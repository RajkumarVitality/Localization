import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeFailure, reportFailureAnalysis, sanitizeFailureText } from '../../src/utils/failureAnalysis.js';

const environment = { FAILURE_ANALYSIS_ENABLED: 'true', FAILURE_ANALYSIS_MODEL: 'local-test' };
const evidence = { error: 'Element was not visible', executionLog: 'Opened login screen', platform: 'Android' };
const analysis = {
  category: 'inconclusive',
  probableCause: 'The element did not become visible; the cause is uncertain.',
  evidence: ['Element was not visible'],
  confidence: 0.4,
  recommendedInvestigation: ['Check selector validity and app readiness.']
};
const reply = (value: unknown) => new Response(JSON.stringify({
  message: { content: JSON.stringify(value) }
}));

test('analysis is disabled by default and configuration errors do not call Ollama', async () => {
  const unexpected: typeof fetch = async () => { throw new Error('must not fetch'); };
  assert.deepEqual(await analyzeFailure(evidence, [], {}, unexpected), { status: 'disabled' });
  for (const config of [
    { FAILURE_ANALYSIS_ENABLED: 'true' },
    { ...environment, FAILURE_ANALYSIS_MODEL: 'some-model:cloud' },
    { ...environment, FAILURE_ANALYSIS_TIMEOUT_MS: '0' },
    { ...environment, FAILURE_ANALYSIS_TIMEOUT_MS: '60001' },
    { ...environment, FAILURE_ANALYSIS_TIMEOUT_MS: 'not-a-number' }
  ]) {
    assert.deepEqual(await analyzeFailure(evidence, [], config, unexpected), { status: 'configuration_error' });
  }
});

test('redacts known secrets, identifiers, authorization, URLs, emails, and local paths', () => {
  const safe = sanitizeFailureText(
    'secret-value user@example.test https://user:pass@example.test/token?q=secret\n' +
    'Bearer abc.def\npassword: hidden\nParty ID: 12345\nDate of birth: 1990-01-01\n' +
    '/Users/privateuser/project 123456789',
    ['secret-value']
  );
  for (const forbidden of ['secret-value', 'user@example', 'user:pass', 'abc.def', 'hidden', '12345', '1990', 'privateuser']) {
    assert.ok(!safe.includes(forbidden), forbidden);
  }
});

test('only sends bounded sanitized evidence to fixed loopback endpoint and validates output', async () => {
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.stream, false);
    assert.equal(body.model, 'local-test');
    const sent = JSON.parse(body.messages[1].content);
    assert.ok(sent.error.length <= 6000);
    assert.ok(sent.executionLog.length <= 12000);
    assert.ok(sent.executionLog.endsWith('final failure checkpoint'));
    assert.ok(!JSON.stringify(sent).includes('secret-value'));
    assert.equal(sent.device, 'Pixel 8');
    return reply(analysis);
  };
  assert.deepEqual(await analyzeFailure({
    ...evidence, error: 'secret-value '.repeat(2000),
    executionLog: `${'x'.repeat(20000)}final failure checkpoint`, device: 'Pixel 8'
  }, ['secret-value'], environment, request), { status: 'analyzed', analysis });
});

test('rejects malformed, oversized, and invalid model responses without inventing a classification', async () => {
  const invalid = [
    new Response('not json'),
    new Response('{}'),
    reply({ ...analysis, category: 'confirmed_bug' }),
    reply({ ...analysis, confidence: 5 }),
    reply({ ...analysis, evidence: [] }),
    reply({ ...analysis, extra: 'unexpected' }),
    new Response('x'.repeat(32769))
  ];
  for (const response of invalid) {
    assert.deepEqual(await analyzeFailure(evidence, [], environment, async () => response), { status: 'invalid_response' });
  }
});

test('service failures and redirects are not treated as successful analysis', async () => {
  for (const response of [new Response('', { status: 500 }), new Response('', { status: 302 })]) {
    assert.deepEqual(await analyzeFailure(evidence, [], environment, async () => response), { status: 'unavailable' });
  }
  assert.deepEqual(await analyzeFailure(evidence, [], environment, async () => {
    throw new Error('sensitive transport error');
  }), { status: 'unavailable' });
});

test('deadline aborts an unresponsive request', async () => {
  const request: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  assert.deepEqual(await analyzeFailure(evidence, [], {
    ...environment, FAILURE_ANALYSIS_TIMEOUT_MS: '100'
  }, request), { status: 'timeout' });
});

test('model output is sanitized before it becomes an Allure finding', async () => {
  const outcome = await analyzeFailure(evidence, ['private-value'], environment, async () => reply({
    ...analysis, probableCause: 'private-value user@example.test', evidence: ['Bearer abc.def']
  }));
  assert.equal(outcome.status, 'analyzed');
  const content = JSON.stringify(outcome);
  for (const value of ['private-value', 'user@example.test', 'abc.def']) assert.ok(!content.includes(value));
});

test('Allure integration attaches advisory findings and labels without mutating the failure', async () => {
  const labels: Record<string, string> = {};
  const attachments: { label: string; content: string }[] = [];
  const logs: string[] = [];
  const failure = Object.freeze({ message: 'Element missing', passed: false });
  const reporter = {
    log: (message: string) => { logs.push(message); },
    recentExecutionLog: () => 'Opened login',
    captureTextArtifact: async (label: string, content: string) => {
      attachments.push({ label, content });
      return 'artifact.txt';
    }
  };
  const label = (name: string, value: string) => { labels[name] = value; };
  await reportFailureAnalysis(undefined, { platform: 'Android' }, reporter, label, [], environment);
  await reportFailureAnalysis(failure.message, { platform: 'Android' }, reporter, label, [], {});
  assert.equal(attachments.length, 0);
  await reportFailureAnalysis(failure.message, { platform: 'Android' }, reporter, label, [], environment, async () => reply(analysis));
  assert.equal(labels.ai_failure_category, 'inconclusive');
  assert.equal(labels.ai_analysis_status, 'analyzed');
  assert.equal(attachments[0].label, 'AI Failure Analysis');
  assert.equal(JSON.parse(attachments[0].content).advisoryOnly, true);
  assert.equal(failure.passed, false);
  assert.match(logs[0], /analysis attached/);
});

test('analysis failures are reported in Allure and attachment errors do not escape', async () => {
  const labels: Record<string, string> = {};
  const logs: string[] = [];
  let attached = '';
  const reporter = {
    log: (message: string) => { logs.push(message); },
    recentExecutionLog: () => '',
    captureTextArtifact: async (_label: string, content: string) => { attached = content; return 'file'; }
  };
  await reportFailureAnalysis('failed', { platform: 'iOS' }, reporter,
    (name, value) => { labels[name] = value; }, [], environment,
    async () => { throw new Error('private-error'); });
  assert.equal(labels.ai_analysis_status, 'unavailable');
  assert.equal(labels.ai_failure_category, undefined);
  assert.ok(!attached.includes('private-error'));
  await assert.doesNotReject(reportFailureAnalysis('failed', { platform: 'iOS' }, {
    ...reporter, captureTextArtifact: async () => { throw new Error('sink failed'); }
  }, () => {}, [], environment, async () => reply(analysis)));
  assert.match(logs.at(-1)!, /original test failure is preserved/);
});
