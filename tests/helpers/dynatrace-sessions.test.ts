import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DynatraceUtil } from '../../src/utils/DynatraceUtil.js';
import { dynatraceSessionQuery, fetchDynatraceSessions, reportDynatraceSessions } from '../../src/utils/dynatraceSessions.js';
import { readLambdaTestSessionDeviceName } from '../../src/utils/lambdatestSession.js';

const start = new Date('2026-10-21T18:27:00.000Z');
const end = new Date('2026-10-21T20:00:00.000Z');

function localIsoTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}` +
    `:${pad(Math.abs(offset) % 60)}`;
}

function dynatraceWindowStart(end: Date): Date {
  return new Date(end.getTime() - 5 * 60 * 1000);
}

test('queries the execution timeframe and records Dynatrace sessions and sessions link', async t => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init });
    if (calls.length === 1) return Response.json({ state: 'RUNNING', requestToken: 'request-token' });
    return Response.json({
      state: 'SUCCEEDED',
      result: { records: [{ 'dt.rum.session.id': 'session-1', 'os.name': 'iOS' }], metadata: { notifications: [] } }
    });
  });
  const logs: string[] = [];
  const attachments: Array<{ label: string; content: string }> = [];
  const links: Array<{ url: string; name?: string }> = [];
  await reportDynatraceSessions({
    log: message => logs.push(message),
    captureTextArtifact: async (label, content) => {
      attachments.push({ label, content });
      return '/artifact';
    }
  }, async (url, name) => { links.push({ url, name }); }, start, end, 'iOS', 'test-token');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.pathname, '/platform/storage/query/v1/query:execute');
  assert.equal(calls[0].init?.method, 'POST');
  const request = JSON.parse(String(calls[0].init?.body));
  assert.equal(request.defaultTimeframeStart, start.toISOString());
  assert.equal(request.defaultTimeframeEnd, end.toISOString());
  assert.match(request.query, /matchesValue\(os.name, "iOS"\)/);
  assert.match(request.query, /GTB_-_Central_App/);
  assert.equal(calls[1].url.pathname, '/platform/storage/query/v1/query:poll');
  assert.equal(calls[1].url.searchParams.get('request-token'), 'request-token');
  assert.equal(links[0].url, DynatraceUtil.generateSessionsUrl(start, end, 'iOS'));
  assert.equal(links[0].name, 'Open Dynatrace sessions');
  assert.ok(logs.some(message => message.includes('session-1')));
  assert.ok(logs.some(message => message.includes('not necessarily this test')));
  assert.equal(attachments[0].label, 'dynatrace-sessions');
  assert.deepEqual(JSON.parse(attachments[0].content).records, [{ 'dt.rum.session.id': 'session-1', 'os.name': 'iOS' }]);
  assert.doesNotMatch(JSON.stringify({ logs, attachments, links }), /test-token/);
});

test('creates platform-specific sessions links without requiring an API token', async () => {
  for (const platform of ['Android', 'iOS'] as const) {
    const links: string[] = [];
    const logs: string[] = [];
    await reportDynatraceSessions({
      log: message => logs.push(message),
      captureTextArtifact: async () => { throw new Error('Unexpected artifact'); }
    }, async url => { links.push(url); }, start, end, platform);
    const url = new URL(links[0]);
    assert.equal(url.pathname, '/ui/apps/dynatrace.classic.session.segmentation/ui/user-sessions');
    assert.equal(url.searchParams.get('gtf'),
      `${localIsoTimestamp(dynatraceWindowStart(end))} to ${localIsoTimestamp(end)}`);
    assert.equal(url.searchParams.get('gf'), 'all');
    assert.deepEqual(url.searchParams.getAll('filter'), [
      'app:GTB \u254d Central App', 'appType:Mobile', `osFamily:${platform}`
    ]);
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.has('tf'), false);
    assert.match(logs[0], /may include other sessions/);
  }
  assert.throws(() => DynatraceUtil.generateSessionsUrl(end, start, 'Android'), /time range is invalid/);
});

test('uses the ASR (GTB) Dynatrace session link for tenant 34', async () => {
  const links: string[] = [];
  await reportDynatraceSessions({
    log: () => {},
    captureTextArtifact: async () => { throw new Error('Unexpected artifact'); }
  }, async url => { links.push(url); }, start, end, 'Android', undefined, undefined, undefined, '34');

  const url = new URL(links[0]);
  assert.equal(url.origin, 'https://ckd69549.apps.dynatrace.com');
  assert.equal(url.pathname, '/ui/apps/dynatrace.classic.session.segmentation/ui/user-sessions');
  assert.ok(url.searchParams.getAll('filter').includes('app:ASR (GTB)'));
  assert.ok(!url.searchParams.getAll('filter').includes('app:GTB \u254d Central App'));
});

test('supports Android, empty results and reports query errors explicitly', async t => {
  assert.match(dynatraceSessionQuery('Android'), /matchesValue\(os.name, "Android"\)/);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    state: 'SUCCEEDED', result: { records: [] }
  }));
  assert.deepEqual((await fetchDynatraceSessions(start, end, 'Android', 'token')).records, []);
  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 403 }));
  await assert.rejects(fetchDynatraceSessions(start, end, 'Android', 'token'), /HTTP 403/);
  fetchMock.mock.mockImplementation(async () => Response.json({ state: 'RUNNING' }));
  await assert.rejects(fetchDynatraceSessions(start, end, 'Android', 'token'), /without a request token/);
  fetchMock.mock.mockImplementation(async () => Response.json({ state: 'FAILED' }));
  await assert.rejects(fetchDynatraceSessions(start, end, 'Android', 'token'), /state: FAILED/);
  await assert.rejects(fetchDynatraceSessions(start, end, 'Android', ''), /DYNATRACE_ACCESS_TOKEN/);
  await assert.rejects(fetchDynatraceSessions(end, start, 'Android', 'token'), /time range is invalid/);
});

test('filters Classic session segmentation by the logged creation/end times and device OS version', async () => {
  const createdAt = new Date('2026-11-16T18:27:57+05:30');
  const endedAt = new Date('2026-11-16T18:29:15+05:30');
  const links: string[] = [];
  await reportDynatraceSessions({
    log: () => {},
    captureTextArtifact: async () => { throw new Error('Unexpected artifact'); }
  }, async url => { links.push(url); }, createdAt, endedAt, 'Android', undefined, 'android 14');
  const url = new URL(links[0]);
  assert.equal(url.pathname, '/ui/apps/dynatrace.classic.session.segmentation/ui/user-sessions');
  assert.equal(url.searchParams.get('gtf'),
    `${localIsoTimestamp(dynatraceWindowStart(endedAt))} to ${localIsoTimestamp(endedAt)}`);
  assert.deepEqual(url.searchParams.getAll('filter'), [
    'app:GTB \u254d Central App', 'appType:Mobile', 'osFamily:Android', 'osVersion:Android 14'
  ]);
  assert.ok(new URL(DynatraceUtil.generateSessionsUrl(createdAt, endedAt, 'iOS', 'iOS 18.0'))
    .searchParams.getAll('filter').includes('osVersion:iOS 18.0'));
});

test('uses a five-minute local timeframe ending at the session end time', () => {
  const createdAt = new Date(2026, 10, 16, 21, 17, 0);
  const endedAt = new Date(2026, 10, 16, 21, 20, 0);
  const timeframe = new URL(DynatraceUtil.generateSessionsUrl(createdAt, endedAt, 'Android'))
    .searchParams.get('gtf');

  assert.equal(timeframe,
    `${localIsoTimestamp(new Date(2026, 10, 16, 21, 15, 0))} to ${localIsoTimestamp(endedAt)}`);
  assert.match(timeframe ?? '', /^2026-11-16T21:15:00[+-]\d{2}:\d{2} to 2026-11-16T21:20:00[+-]\d{2}:\d{2}$/);
});

test('applies the captured device name using the confirmed Classic Device filter', async () => {
  const links: string[] = [];
  await reportDynatraceSessions({
    log: () => {},
    captureTextArtifact: async () => { throw new Error('Unexpected artifact'); }
  }, async url => { links.push(url); }, start, end, 'Android', undefined, 'android 15', 'Galaxy S25');
  const url = new URL(links[0]);
  assert.deepEqual(url.searchParams.getAll('filter'), [
    'app:GTB \u254d Central App', 'appType:Mobile', 'osFamily:Android',
    'osVersion:Android 15', 'device:Galaxy S25'
  ]);
  assert.ok(new URL(DynatraceUtil.generateSessionsUrl(start, end, 'iOS', 'iOS 18', 'iPhone 16'))
    .searchParams.getAll('filter').includes('device:iPhone 16'));
  assert.equal(new URL(DynatraceUtil.generateSessionsUrl(start, end, 'Android', undefined, ' '))
    .searchParams.getAll('filter').some(filter => filter.startsWith('device:')), false);
});

test('passes the device name returned by LambdaTest to the Dynatrace Device filter', async () => {
  const deviceName = await readLambdaTestSessionDeviceName(
    'session-1',
    'test-user',
    'test-key',
    async () => Response.json({ data: { device_name: 'Galaxy S25 Ultra' } })
  );
  const links: string[] = [];
  await reportDynatraceSessions({
    log: () => {},
    captureTextArtifact: async () => { throw new Error('Unexpected artifact'); }
  }, async url => { links.push(url); }, start, end, 'Android', undefined, undefined, deviceName);

  assert.ok(new URL(links[0]).searchParams.getAll('filter').includes('device:Galaxy S25 Ultra'));
});
