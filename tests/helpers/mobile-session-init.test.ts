import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCapabilities } from '../../src/config/mobileSessionInit.js';

test('tenant 34 adds Dutch locale capabilities and other tenants do not', () => {
  const keys = [
    'VG_ENVIRONMENT',
    'VG_MDEV_TENANT_NUMBER',
    'LT_USERNAME',
    'LT_ACCESS_KEY',
    'appId'
  ];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  try {
    process.env.VG_ENVIRONMENT = 'mdev';
    process.env.LT_USERNAME = 'test-user';
    process.env.LT_ACCESS_KEY = 'test-key';
    process.env.appId = 'lt://test-app';

    process.env.VG_MDEV_TENANT_NUMBER = '34';
    const tenant34 = buildCapabilities('Android', 'loginAndLogout', 'loginAndLogout');
    assert.equal(tenant34['appium:locale'], 'nl');
    assert.equal(tenant34['appium:language'], 'NL');

    process.env.VG_MDEV_TENANT_NUMBER = '9998';
    const tenant9998 = buildCapabilities('Android', 'loginAndLogout', 'loginAndLogout');
    assert.equal(Object.hasOwn(tenant9998, 'appium:locale'), false);
    assert.equal(Object.hasOwn(tenant9998, 'appium:language'), false);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
