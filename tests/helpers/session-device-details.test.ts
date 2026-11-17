import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureSessionDeviceDetails, sessionTimeLogLine, sessionDeviceDetails, sessionDeviceLogLines } from '../../src/utils/sessionDeviceDetails.js';

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
    platformName: 'iOS', 'appium:udid': 'device-123', 'appium:platformVersion': '18.0'
  });
  assert.equal(sessionDeviceDetails, details);
  assert.deepEqual(details, {
    sessionId: 'session-1', udid: 'device-123', osName: 'iOS',
    osVersion: 'iOS 18.0'
  });
  assert.ok(Object.isFrozen(details));
  assert.ok(sessionDeviceLogLines(details).includes('Device UDID: device-123'));
});

test('supports unprefixed cloud-returned capabilities and explicitly reports missing UDID', () => {
  const details = captureSessionDeviceDetails('session-2', {
    platformName: 'Android',
    'LT:Options': { platformVersion: '14' }
  });
  assert.equal(details.osName, 'Android');
  assert.equal(details.osVersion, 'Android 14');
  assert.equal(details.udid, undefined);
  assert.ok(sessionDeviceLogLines(details).includes('Device UDID: unavailable (not returned by session)'));
});

test('keeps UDID separate and combines OS name with version', () => {
  const caps = {
    platformName: 'android', 'appium:platformVersion': '14',
    'appium:udid': 'test-device-serial'
  };
  const details = captureSessionDeviceDetails('session-4', caps);
  assert.equal(details.udid, 'test-device-serial');
  assert.equal(details.osVersion, 'android 14');
  assert.ok(sessionDeviceLogLines(details).includes('Device OS version: android 14'));
});
