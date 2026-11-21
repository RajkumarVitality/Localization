import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { ExecutionReporter } from '../../src/utils/ExecutionReporter.js';
import { detectObservedFailure, reportObservedFailure } from '../../src/utils/observedFailure.js';

const title = '<android.widget.TextView displayed="true" text="Unsafe device detected" resource-id="com.example:id/dialog_title" />';
const message = '<android.widget.TextView resource-id="com.example:id/dialog_message" displayed="true" text="Your device appears to be unsafe, and so for security reasons a.s.r Vitality cannot be loaded." />';
const source = `<hierarchy>${title}${message}</hierarchy>`;

test('recognizes only the visible unsafe-device dialog and its security message', () => {
  assert.match(detectObservedFailure(source)!, /Unsafe device detected/);
  assert.equal(detectObservedFailure(`<hierarchy>${title}</hierarchy>`), undefined);
  assert.equal(detectObservedFailure(source.replace('displayed="true"', 'displayed="false"')), undefined);
  assert.equal(detectObservedFailure(source.replace('dialog_title', 'unrelated_title')), undefined);
  assert.equal(detectObservedFailure('<hierarchy><node text="Unsafe device detected"/></hierarchy>'), undefined);
});

test('captured failure evidence is reported in the execution log and Allure without changing status', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'observed-failure-test-'));
  const previous = process.env.LT_ARTIFACTS_DIR;
  process.env.LT_ARTIFACTS_DIR = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.LT_ARTIFACTS_DIR;
    else process.env.LT_ARTIFACTS_DIR = previous;
    await rm(root, { recursive: true, force: true });
  });
  _setGlobal('browser', { getPageSource: async () => source });
  const steps: string[] = [];
  const attachments: { name: string; content: string | Buffer }[] = [];
  const reporter = new ExecutionReporter();
  reporter.startTest('smoke', 'failure', {
    addStep: async message => { steps.push(message); },
    addAttachment: async (name, content) => { attachments.push({ name, content }); }
  });
  const captured = await reporter.capturePageSource('listener-failure');
  await reportObservedFailure(captured, reporter);
  await reporter.finishTest('FAILED');
  const reason = attachments.find(item => item.name === 'Observed failure reason');
  assert.ok(reason);
  assert.match(String(reason.content), /Unsafe device detected/);
  assert.match(String(reason.content), /reason the device was flagged is unknown/);
  assert.ok(steps.some(value => value.includes('Observed failure reason:')));
  const executionLog = attachments.find(item => item.name === 'execution.log');
  assert.ok(executionLog);
  assert.match(String(executionLog.content), /Observed failure reason:.*Unsafe device detected/);
  assert.match(String(executionLog.content), /Execution status: FAILED/);
  assert.equal(await readFile(captured!, 'utf8'), source);
});

test('missing or unreadable evidence is reported without inventing a reason', async () => {
  const logs: string[] = [];
  const reporter = {
    log: (message: string) => { logs.push(message); },
    captureTextArtifact: async () => { throw new Error('must not attach'); }
  };
  await reportObservedFailure(undefined, reporter);
  await reportObservedFailure('/no-such-observed-failure-source.xml', reporter);
  assert.match(logs[0], /page source was not captured/);
  assert.match(logs[1], /Unable to read captured page source/);
  assert.ok(logs.every(line => !line.includes('Unsafe device detected')));
});
