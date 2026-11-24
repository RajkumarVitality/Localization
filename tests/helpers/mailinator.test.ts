import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import childProcess from 'node:child_process';
import { getMailinatorMessageLinks } from '../../src/config/mailinator.js';

function setupTest(t: TestContext): void {
  t.mock.method(childProcess, 'execFile', (...args: unknown[]) => {
    const callback = args[args.length - 1];
    assert.equal(typeof callback, 'function');
    if (typeof callback === 'function') callback(null);
  });
  for (const [key, value] of Object.entries({
    MAILINATOR_API_TOKEN: 'test-only-token', VG_ENVIRONMENT: 'mdev', VG_MDEV_LOGIN_PREFIX: 'mdev--'
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

test('fetches first-message links for bare, email, and prefixed usernames', async t => {
  setupTest(t);
  const base = 'https://api.mailinator.com/api/v2/domains/vgnet.testinator.com/inboxes/Example_261123173148';
  const urls: string[] = [];
  const resetPasswordLink = 'https://example.invalid/reset-password?confirmationCode=test-code&username=Example';
  const links = { links: ['https://example.invalid/deep-linking-web?linkId=4', resetPasswordLink] };
  const launches: unknown[][] = [];
  t.mock.method(childProcess, 'execFile', (...args: unknown[]) => {
    launches.push(args.slice(0, 2));
    const callback = args[args.length - 1];
    if (typeof callback === 'function') callback(null);
  });
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    urls.push(url);
    assert.deepEqual(init.headers, { Authorization: 'test-only-token' });
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(url === base ? { msgs: [{ id: 'first/id' }, { id: 'second' }] } : links);
  });
  for (const username of ['Example_261123173148', 'Example_261123173148@vgnet.testinator.com',
    'mdev--Example_261123173148@vgnet.testinator.com']) {
    urls.length = 0;
    assert.equal(await getMailinatorMessageLinks(username), resetPasswordLink);
    assert.deepEqual(urls, [base, `${base}/messages/first%2Fid/links`]);
  }
  const command = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = process.platform === 'win32'
    ? ['url.dll,FileProtocolHandler', resetPasswordLink] : [resetPasswordLink];
  assert.deepEqual(launches, [[command, args], [command, args], [command, args]]);
});

test('reports browser launch errors without exposing the reset confirmation code', async t => {
  setupTest(t);
  t.mock.method(globalThis, 'fetch', async (url: string) => Response.json(url.endsWith('/links')
    ? { links: ['https://example.invalid/reset-password?confirmationCode=private-code'] }
    : { msgs: [{ id: 'first' }] }));
  t.mock.method(childProcess, 'execFile', (...args: unknown[]) => {
    const callback = args[args.length - 1];
    if (typeof callback === 'function') callback(new Error('private-code'));
  });
  await assert.rejects(getMailinatorMessageLinks('Example_261123173148'),
    /^Error: Unable to open the reset-password link in the default browser\.$/);
});

test('can return the reset link without launching a second browser', async t => {
  setupTest(t);
  const launches = t.mock.method(childProcess, 'execFile', () => { throw new Error('Unexpected browser launch'); });
  const link = 'https://example.invalid/reset-password?confirmationCode=test-code';
  t.mock.method(globalThis, 'fetch', async (url: string) => Response.json(url.endsWith('/links')
    ? { links: [link] } : { msgs: [{ id: 'first' }] }));
  assert.equal(await getMailinatorMessageLinks('Example_261123173148', false), link);
  assert.equal(launches.mock.callCount(), 0);
});

test('rejects invalid usernames and missing message IDs before requesting links', async t => {
  setupTest(t);
  const request = t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  for (const username of ['', '../user', 'user@another.invalid', 'user@@vgnet.testinator.com']) {
    await assert.rejects(getMailinatorMessageLinks(username), /Mailinator username/);
  }
  assert.equal(request.mock.callCount(), 0);
  for (const body of [null, {}, { msgs: null }, { msgs: [] }, { msgs: [{}] }, { msgs: [{ id: 123 }] },
    { msgs: [{ id: ' ' }] }]) {
    request.mock.mockImplementation(async () => Response.json(body));
    const before = request.mock.callCount();
    await assert.rejects(getMailinatorMessageLinks('Example_261123173148'), /Mailinator response was missing/);
    assert.equal(request.mock.callCount(), before + 1);
  }
});

test('reports failures from either request without exposing response contents', async t => {
  setupTest(t);
  const request = t.mock.method(globalThis, 'fetch', async (_input: string | URL | Request) =>
    new Response('private content', { status: 401 }));
  await assert.rejects(getMailinatorMessageLinks('Example_261123173148'), /inbox request failed with HTTP 401/);
  assert.equal(request.mock.callCount(), 1);
  request.mock.mockImplementation(async (url: string | URL | Request) => String(url).endsWith('/links')
    ? new Response('private content', { status: 404 })
    : Response.json({ msgs: [{ id: 'first' }] }));
  await assert.rejects(getMailinatorMessageLinks('Example_261123173148'), /message links request failed with HTTP 404/);
});

test('rejects invalid links responses and messages without a reset-password link', async t => {
  setupTest(t);
  const request = t.mock.method(globalThis, 'fetch', async (_input: string | URL | Request) => Response.json({}));
  for (const body of [null, {}, { links: null }, { links: [123] }, { links: [] },
    { links: ['not-a-url', 'https://example.invalid/deep-linking-web?next=/reset-password',
      'http://example.invalid/reset-password', 'https://example.invalid/reset-password-extra'] }]) {
    request.mock.mockImplementation(async (url: string | URL | Request) => Response.json(String(url).endsWith('/links')
      ? body : { msgs: [{ id: 'first' }] }));
    await assert.rejects(getMailinatorMessageLinks('Example_261123173148'),
      /Mailinator response was missing a valid links array|did not contain an HTTPS reset-password link/);
  }
});
