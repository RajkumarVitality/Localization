import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSessionAppVersion } from '../../src/utils/sessionAppVersion.js';
import { captureSessionDeviceDetails, sessionDeviceLogLines } from '../../src/utils/sessionDeviceDetails.js';

test('uses returned app version without querying the device', async () => {
  const client = { execute: async () => { throw new Error('Unexpected command'); } };
  for (const capabilities of [
    { 'appium:appVersion': '3.0.2340.20999' },
    { 'LT:Options': { appVersion: '3.0.2340.20999' } }
  ]) {
    assert.equal(await readSessionAppVersion(client, 'Android', capabilities), '3.0.2340.20999');
  }
});

test('reads Android versionName for the app under test and preserves all version components', async () => {
  const client = {
    async execute(command: string, args: Record<string, unknown>) {
      assert.equal(command, 'mobile: shell');
      assert.deepEqual(args, { command: 'dumpsys', args: ['package', 'com.example.app'], timeout: 10_000 });
      return 'Packages:\n    versionCode=310129644\n    versionName=3.0.2340.20999\n';
    }
  };
  const version = await readSessionAppVersion(client, 'Android', { 'appium:appPackage': 'com.example.app' });
  assert.equal(version, '3.0.2340.20999');
  const details = captureSessionDeviceDetails('session-version', {}, undefined, version);
  assert.equal(details.appVersion, version);
  assert.ok(sessionDeviceLogLines(details).includes('App Version: 3.0.2340.20999'));
});

test('supports Android stdout objects and a configured package fallback', async () => {
  const client = { execute: async () => ({ stdout: ' versionName=1.2.3\r\n' }) };
  assert.equal(await readSessionAppVersion(client, 'Android', {}, 'com.example.app'), '1.2.3');
});

test('reads the matching iOS app marketing version instead of its build number', async () => {
  const client = {
    async execute(command: string, args: Record<string, unknown>) {
      assert.equal(command, 'mobile: listApps');
      assert.equal(args.applicationType, 'User');
      return {
        'com.example.other': { CFBundleShortVersionString: '9.9' },
        'com.example.app': { CFBundleShortVersionString: '3.0.2340.20999', CFBundleVersion: '12345' }
      };
    }
  };
  assert.equal(await readSessionAppVersion(client, 'iOS', {
    'LT:Options': { bundleId: 'com.example.app' }
  }), '3.0.2340.20999');
});

test('reports missing identifiers, missing versions, and blocked provider commands', async () => {
  const empty = { execute: async () => ({}) };
  await assert.rejects(readSessionAppVersion(empty, 'Android', {}), /ANDROID_APP_PACKAGE/);
  await assert.rejects(readSessionAppVersion(empty, 'Android', {}, 'com.example.app'), /versionName/);
  await assert.rejects(readSessionAppVersion(empty, 'iOS', {}, 'com.example.app'), /CFBundleShortVersionString/);
  const blocked = { execute: async () => { throw new Error('mobile shell is disabled'); } };
  await assert.rejects(readSessionAppVersion(blocked, 'Android', {}, 'com.example.app'), /shell is disabled/);
});
