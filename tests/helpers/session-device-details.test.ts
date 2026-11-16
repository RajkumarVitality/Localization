import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureSessionDeviceDetails, sessionTimeLogLine, sessionDeviceDetails, sessionDeviceLogLines } from '../../src/utils/sessionDeviceDetails.js';
import { readLambdaTestSessionDeviceName } from '../../src/utils/lambdatestSession.js';

test('formats session creation time using the runner local timezone', () => {
  assert.equal(sessionTimeLogLine(new Date(2026, 10, 16, 17, 27, 57), 'Create'),
    'Session Create Time: 17:27:57 | 16 Nov 2026');
  assert.equal(sessionTimeLogLine(new Date(2026, 0, 2, 3, 4, 5), 'Create'),
    'Session Create Time: 03:04:05 | 02 Jan 2026');
});

test('formats session end time using the same local timestamp format', () => {
  assert.equal(sessionTimeLogLine(new Date(2026, 10, 16, 17, 55, 16), 'End'),
    'Session End Time: 17:55:16 | 16 Nov 2026');
});

test('stores actual W3C session device details in a reusable immutable variable', () => {
  const details = captureSessionDeviceDetails('session-1', {
    platformName: 'iOS', 'appium:udid': 'device-123',
    'appium:deviceName': 'iPhone 16', 'appium:platformVersion': '18.0'
  });
  assert.equal(sessionDeviceDetails, details);
  assert.deepEqual(details, {
    sessionId: 'session-1', udid: 'device-123', osName: 'iOS',
    osVersion: 'iOS 18.0', deviceName: 'iPhone 16'
  });
  assert.ok(Object.isFrozen(details));
  assert.ok(sessionDeviceLogLines(details).includes('Device UDID: device-123'));
});

test('supports unprefixed cloud-returned capabilities and explicitly reports missing UDID', () => {
  const details = captureSessionDeviceDetails('session-2', {
    platformName: 'Android',
    'LT:Options': { deviceName: 'Galaxy S24', platformVersion: '14' }
  });
  assert.equal(details.osName, 'Android');
  assert.equal(details.deviceName, 'Galaxy S24');
  assert.equal(details.osVersion, 'Android 14');
  assert.equal(details.udid, undefined);
  assert.ok(sessionDeviceLogLines(details).includes('Device UDID: unavailable (not returned by session)'));
  assert.equal(captureSessionDeviceDetails('session-3', null).deviceName, undefined);
});

test('keeps UDID separate from the model name and combines OS name with version', () => {
  const caps = {
    platformName: 'android', 'appium:platformVersion': '14',
    'appium:udid': 'test-device-serial', 'appium:deviceName': 'test-device-serial'
  };
  const details = captureSessionDeviceDetails('session-4', caps, 'Galaxy S24');
  assert.equal(details.udid, 'test-device-serial');
  assert.equal(details.deviceName, 'Galaxy S24');
  assert.equal(details.osVersion, 'android 14');
  assert.ok(sessionDeviceLogLines(details).includes('device: Galaxy S24'));
  assert.ok(sessionDeviceLogLines(details).includes('Device OS version: android 14'));
  assert.equal(captureSessionDeviceDetails('session-5', caps, 'Galaxy S.*').deviceName, undefined);
  assert.equal(captureSessionDeviceDetails('session-6', {
    ...caps, 'LT:Options': { deviceName: 'Galaxy S25' }
  }, 'Galaxy S24').deviceName, 'Galaxy S25');
});

test('prefers the cloud display name over the hardware model code used by Appium', () => {
  const details = captureSessionDeviceDetails('session-display-name', {
    device: 'Galaxy S25',
    deviceName: 'SM-S931B',
    'appium:deviceName': 'SM-S931B',
    deviceModel: 'SM-S931B',
    'LT:Options': { deviceName: 'Galaxy S.*' }
  }, 'Galaxy S.*');
  assert.equal(details.deviceName, 'Galaxy S25');
  assert.ok(sessionDeviceLogLines(details).includes('device: Galaxy S25'));
  assert.ok(sessionDeviceLogLines(details).includes('Device name: Galaxy S25'));
});

test('prefers the LambdaTest display name over an API hardware model code', async () => {
  const apiDeviceName = await readLambdaTestSessionDeviceName(
    'session-api-device-name',
    'test-user',
    'test-key',
    async () => new Response(JSON.stringify({ data: { device_name: 'SM-S931B' } }))
  );
  const details = captureSessionDeviceDetails('session-api-device-name', {
    device: 'Galaxy S25',
    deviceName: 'SM-S931B'
  }, 'Galaxy S.*', undefined, undefined, apiDeviceName);
  assert.equal(details.deviceName, 'Galaxy S25');
});

test('uses the runner device parameter when browser capabilities only contain a hardware code', () => {
  for (const runner of [
    { device: 'Galaxy S24' },
    { 'LT:Options': { deviceName: 'Galaxy S24' } },
    { desired: { deviceName: 'Galaxy S24' } }
  ]) {
    const details = captureSessionDeviceDetails('session-runner-device', {
      deviceName: 'SM-S921U', deviceModel: 'SM-S921U'
    }, 'Galaxy S.*', undefined, runner);
    assert.equal(details.deviceName, 'Galaxy S24');
    assert.ok(sessionDeviceLogLines(details).includes('device: Galaxy S24'));
  }
  assert.equal(captureSessionDeviceDetails('session-pattern', {
    deviceName: 'SM-S921U'
  }, 'Galaxy S.*', undefined, {
    'LT:Options': { deviceName: 'Galaxy S.*' }
  }).deviceName, 'SM-S921U');
});
