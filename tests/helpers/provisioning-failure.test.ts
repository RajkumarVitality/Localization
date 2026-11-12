import assert from 'node:assert/strict';
import { test } from 'node:test';
import { provisioningFailure } from '../../src/config/provisioningFailure.js';

test('provisioning failures include diagnostic JSON but redact secrets and member data', async t => {
  const previous = process.env.VG_MDEV_API_BEARER_TOKEN;
  process.env.VG_MDEV_API_BEARER_TOKEN = 'private-test-token';
  t.after(() => {
    if (previous === undefined) delete process.env.VG_MDEV_API_BEARER_TOKEN;
    else process.env.VG_MDEV_API_BEARER_TOKEN = previous;
  });
  const error = await provisioningFailure(Response.json({
    message: 'Invalid reward type 2298 for member 40189132 member@example.invalid Jane private-test-token\r\nFORGED',
    errors: [{ code: 'INVALID_EVENT', description: 'Event is not configured for tenant' }],
    password: 'must-not-log',
    request: { body: 'must-not-log' },
    authorization: 'must-not-log'
  }, { status: 400 }), 'Create-reward-event request failed with HTTP 400.', ['Jane', 40189132]);
  assert.match(error.message, /HTTP 400/);
  assert.match(error.message, /Invalid reward type 2298/);
  assert.match(error.message, /INVALID_EVENT/);
  assert.doesNotMatch(error.message, /40189132|member@example|Jane|private-test-token|must-not-log|[\r\n]/);
});

test('failure response bodies are omitted safely when empty, non-JSON or oversized', async () => {
  for (const [body, expected] of [
    ['', /empty/],
    ['<html>private gateway error</html>', /non-JSON body omitted/],
    ['x'.repeat(16_385), /oversized body omitted/],
    ['"private string"', /non-object body omitted/]
  ] as const) {
    const error = await provisioningFailure(new Response(body, { status: 500 }), 'HTTP 500.');
    assert.match(error.message, expected);
    assert.doesNotMatch(error.message, /private/);
  }
});

test('response read failures preserve the HTTP error and the read cause', async () => {
  const cause = new Error('stream interrupted');
  const response = new Response(new ReadableStream({
    start(controller) { controller.error(cause); }
  }), { status: 400 });
  const error = await provisioningFailure(response, 'HTTP 400.');
  assert.match(error.message, /HTTP 400.*could not be read/);
  assert.equal(error.cause, cause);
});

test('large nested diagnostics are limited and sensitive labels are redacted', async () => {
  const error = await provisioningFailure(Response.json({
    errors: Array.from({ length: 10 }, () => ({
      message: `token=private-value password="private password" ${'x'.repeat(600)}`
    }))
  }), 'HTTP 400.');
  assert.ok(error.message.length < 2200);
  assert.match(error.message, /truncated/);
  assert.doesNotMatch(error.message, /private-value|private password/);
});
