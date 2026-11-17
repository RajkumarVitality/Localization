import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLambdaTestSessionDeviceName } from '../../src/utils/lambdatestSession.js';

test('reads the device name from the LambdaTest session API with Basic authentication', async () => {
  let requestUrl: URL | undefined;
  let requestInit: RequestInit | undefined;
  const name = await readLambdaTestSessionDeviceName(
    'session/id',
    'test-user',
    'test-key',
    async (input, init) => {
      requestUrl = new URL(String(input));
      requestInit = init;
      return new Response(JSON.stringify({ data: { device_name: 'Galaxy S25' } }));
    }
  );

  assert.equal(name, 'Galaxy S25');
  assert.equal(requestUrl?.pathname, '/mobile-automation/api/v1/sessions/session%2Fid');
  assert.equal(
    new Headers(requestInit?.headers).get('Authorization'),
    `Basic ${Buffer.from('test-user:test-key').toString('base64')}`
  );
  assert.equal(new Headers(requestInit?.headers).get('Accept'), 'application/json');
});

test('supports the session API device_name response field', async () => {
  const name = await readLambdaTestSessionDeviceName('session-1', 'user', 'key', async () =>
    new Response(JSON.stringify({ data: { device_name: 'iPhone 16' } }))
  );
  assert.equal(name, 'iPhone 16');
});

test('reads only the data.device_name field from session metadata', async () => {
  const name = await readLambdaTestSessionDeviceName('session-1', 'user', 'key', async () =>
    new Response(JSON.stringify({
      data: { device_name: ' SM-S931B ', device: { name: 'Galaxy S25' } },
      device_name: 'Wrong top-level name'
    }))
  );
  assert.equal(name, 'SM-S931B');
});

test('retries a 404 while the LambdaTest session record becomes available', async () => {
  let requests = 0;
  const name = await readLambdaTestSessionDeviceName('session-1', 'user', 'key', async () => {
    requests++;
    return requests < 3
      ? new Response('', { status: 404 })
      : new Response(JSON.stringify({ data: { device_name: 'Galaxy S26' } }));
  });
  assert.equal(name, 'Galaxy S26');
  assert.equal(requests, 3);
});

test('reports unsuccessful and missing-device API responses', async () => {
  await assert.rejects(
    readLambdaTestSessionDeviceName('session-1', 'user', 'key', async () =>
      new Response('', { status: 401 })
    ),
    /HTTP 401/
  );
  await assert.rejects(
    readLambdaTestSessionDeviceName('session-1', 'user', 'key', async () =>
      new Response(JSON.stringify({ data: { status: 'complete' } }))
    ),
    /did not include a device name/
  );
});
