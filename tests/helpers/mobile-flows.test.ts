import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { executionReporter } from '../../src/utils/ExecutionReporter.js';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { HealthyLivingScreen } from '../../src/pages/HealthyLivingScreen.js';
import { HomeScreen } from '../../src/pages/HomeScreen.js';
import { LoginScreen } from '../../src/pages/LoginScreen.js';
import { MHAQuestionsScreen } from '../../src/pages/MHAQuestionsScreen.js';
import { WelcomeScreen } from '../../src/pages/WelcomeScreen.js';
import { assessmentResourceUrl, loadAssessmentResource } from '../../src/config/assessmentResource.js';
import { loginToHome } from '../helpers/genericFlow.js';

for (const platform of ['Android', 'iOS'] as const) {
  test(`shared ${platform} login preserves navigation, credentials, and home-screen settling`, async t => {
    const overrides = {
      PLATFORM: platform,
      LT_SCENARIO: 'login',
      APP_PASSWORD: 'validation-password',
      LT_WAIT_SECONDS: '10',
      LT_TEST_TIMEOUT_SECONDS: '20'
    };
    const previous = new Map(Object.keys(overrides).map(key => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    t.after(() => {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    const calls: string[] = [];
    const session = new MobileSession(platform);
    const healthyLivingScreen = new HealthyLivingScreen(session);
    const loginScreen = new LoginScreen(session);
    _setGlobal('browser', {
      pause: async (duration: number) => { calls.push(`pause:${duration}`); }
    });
    t.mock.method(executionReporter, 'log', () => {});
    t.mock.method(executionReporter, 'captureScreenshot', async (label: string) => {
      calls.push(`screenshot:${label}`);
      return undefined;
    });
    t.mock.method(WelcomeScreen.prototype, 'assertWelcomeMessage', async () => { calls.push('welcome'); });
    t.mock.method(WelcomeScreen.prototype, 'openHealthyLiving', async () => {
      calls.push('open-healthy-living');
      return healthyLivingScreen;
    });
    t.mock.method(HealthyLivingScreen.prototype, 'assertHealthyLivingMessage', async () => {
      calls.push('healthy-living');
    });
    t.mock.method(HealthyLivingScreen.prototype, 'openLogin', async () => {
      calls.push('open-login');
      return loginScreen;
    });
    t.mock.method(LoginScreen.prototype, 'assertHelloVisible', async () => { calls.push('hello'); });
    t.mock.method(LoginScreen.prototype, 'enterUsername', async (value: string) => {
      calls.push(`username:${value}`);
    });
    t.mock.method(LoginScreen.prototype, 'enterPassword', async (value: string) => {
      calls.push(`password:${value}`);
    });
    t.mock.method(LoginScreen.prototype, 'dismissKeyboard', async () => { calls.push('dismiss-keyboard'); });
    t.mock.method(LoginScreen.prototype, 'submit', async () => { calls.push('submit'); });
    t.mock.method(HomeScreen.prototype, 'dismissNotificationPopup', async () => {
      calls.push('dismiss-notification');
    });
    t.mock.method(HomeScreen.prototype, 'acceptPermissionDialog', async () => {
      calls.push('accept-permission');
    });
    t.mock.method(HomeScreen.prototype, 'assertGreetingVisible', async () => { calls.push('greeting'); });

    const result = await loginToHome('validation-user');
    assert.equal(result.session.platform, platform);
    assert.ok(result.homeScreen instanceof HomeScreen);
    assert.deepEqual(calls, [
      'welcome', 'open-healthy-living', 'healthy-living', 'open-login', 'hello',
      'username:validation-user', 'dismiss-keyboard', 'password:validation-password',
      'dismiss-keyboard', 'submit',
      ...(platform === 'Android' ? ['dismiss-notification', 'pause:3000', 'accept-permission'] : []),
      'pause:1000', 'greeting', 'screenshot:home-screen'
    ]);
  });
}

for (const tenant of ['34', '9998']) {
  for (const risk of ['low', 'high']) {
    test(`assessment resource loader reads tenant ${tenant} ${risk}-risk fixture`, async t => {
      const previousEnvironment = process.env.VG_ENVIRONMENT;
      const previousTenant = process.env.VG_CA_TEST_TENANT_NUMBER;
      process.env.VG_ENVIRONMENT = 'ca-test';
      process.env.VG_CA_TEST_TENANT_NUMBER = tenant;
      t.after(() => {
        if (previousEnvironment === undefined) delete process.env.VG_ENVIRONMENT;
        else process.env.VG_ENVIRONMENT = previousEnvironment;
        if (previousTenant === undefined) delete process.env.VG_CA_TEST_TENANT_NUMBER;
        else process.env.VG_CA_TEST_TENANT_NUMBER = previousTenant;
      });
      const resourceName = `mha-${risk}-risk-assessment.json`;
      const expectedUrl = new URL(`../fixtures/T${tenant}/${resourceName}`, import.meta.url);
      assert.equal(assessmentResourceUrl(resourceName).href, expectedUrl.href);
      const expected = JSON.parse(await readFile(expectedUrl, 'utf8'));
      const screen = new MHAQuestionsScreen(new MobileSession('Android'));
      let loaded: unknown;
      t.mock.method(screen, 'completeAssessment', async (assessment: unknown) => { loaded = assessment; });
      await screen.completeAssessmentFromResource(resourceName);
      assert.deepEqual(loaded, expected);
      assert.deepEqual(await loadAssessmentResource(resourceName), expected);
    });
  }
}

test('MDEV-9998 assessments use the tenant-specific profile settings', t => {
  const previousEnvironment = process.env.VG_ENVIRONMENT;
  const previousMdevTenant = process.env.VG_MDEV_TENANT_NUMBER;
  const previousTenant = process.env.VG_T9998_MDEV_TENANT_NUMBER;
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.VG_ENVIRONMENT;
    else process.env.VG_ENVIRONMENT = previousEnvironment;
    if (previousMdevTenant === undefined) delete process.env.VG_MDEV_TENANT_NUMBER;
    else process.env.VG_MDEV_TENANT_NUMBER = previousMdevTenant;
    if (previousTenant === undefined) delete process.env.VG_T9998_MDEV_TENANT_NUMBER;
    else process.env.VG_T9998_MDEV_TENANT_NUMBER = previousTenant;
  });
  process.env.VG_ENVIRONMENT = 'mdev-9998';
  process.env.VG_MDEV_TENANT_NUMBER = '34';
  process.env.VG_T9998_MDEV_TENANT_NUMBER = '9998';
  assert.equal(assessmentResourceUrl('mha-low-risk-assessment.json').href,
    new URL('../fixtures/T9998/mha-low-risk-assessment.json', import.meta.url).href);
});

test('assessment resource loading rejects invalid tenants and missing tenant fixtures', async t => {
  const previousEnvironment = process.env.VG_ENVIRONMENT;
  const previousTenant = process.env.VG_CA_TEST_TENANT_NUMBER;
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.VG_ENVIRONMENT;
    else process.env.VG_ENVIRONMENT = previousEnvironment;
    if (previousTenant === undefined) delete process.env.VG_CA_TEST_TENANT_NUMBER;
    else process.env.VG_CA_TEST_TENANT_NUMBER = previousTenant;
  });
  process.env.VG_ENVIRONMENT = 'ca-test';
  process.env.VG_CA_TEST_TENANT_NUMBER = '../34';
  assert.throws(() => assessmentResourceUrl('mha-low-risk-assessment.json'), /Invalid assessment tenant number/);
  assert.throws(() => assessmentResourceUrl(' '), /must not be blank/);
  process.env.VG_CA_TEST_TENANT_NUMBER = '123456789';
  await assert.rejects(loadAssessmentResource('mha-low-risk-assessment.json'), { code: 'ENOENT' });
});
