import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { scenarios, suites } from '../../src/config/runner.js';

const previousEnvironment = process.env.VG_ENVIRONMENT;
process.env.VG_ENVIRONMENT = 'mdev-9998';
const { LoginScreen } = await import('../../src/pages/LoginScreen.js');
const { loadMobileElementCatalog, expectedText } = await import('../../src/pages/mobileElements.js');
if (previousEnvironment === undefined) delete process.env.VG_ENVIRONMENT;
else process.env.VG_ENVIRONMENT = previousEnvironment;

test('reset-password is registered but remains outside the default suites', () => {
  assert.equal(scenarios['reset-password'].provisionMember, true);
  for (const suite of Object.values(suites)) {
    assert.ok(!suite.includes(`./tests/${scenarios['reset-password'].file}`));
  }
});

for (const platform of ['Android', 'iOS'] as const) {
  test(`${platform} reset screens assert tenant 9998 text and return to login`, async t => {
    const catalog = loadMobileElementCatalog('9998');
    const session = new MobileSession(platform);
    const platformKey = platform === 'Android' ? 'android' : 'ios';
    const clicks: string[] = [];
    const typed: Array<[string, string]> = [];
    let showingMail = false;
    _setGlobal('$', async (selector: string) => {
      const locator = (showingMail ? [catalog.YouHaveMailScreen.Header] : [
        catalog.ForgotPasswordScreen.Header,
        catalog.ForgotPasswordScreen.SubText
      ]).find(item => session.getPlatformLocator(item.android, item.ios) === selector);
      return {
        isDisplayed: async () => true,
        getAttribute: async () => locator ? expectedText(locator) : 'Incorrect text'
      };
    });
    t.mock.method(session, 'clickElement', async (selector: string) => { clicks.push(selector); });
    t.mock.method(session, 'typeIntoElement', async (selector: string, value: string) => {
      typed.push([selector, value]);
    });
    const forgot = await new LoginScreen(session).openForgotPassword();
    await forgot.assertLoaded();
    const mail = await forgot.requestReset('Example@vgnet.testinator.com');
    showingMail = true;
    await mail.assertLoaded();
    assert.ok(await mail.openLogin() instanceof LoginScreen);
    const selector = (page: string, key: string) => session.getPlatformLocator(
      catalog[page][key].android, catalog[page][key].ios
    );
    assert.deepEqual(clicks, [
      selector('LoginScreen', 'forgotPassword'),
      selector('ForgotPasswordScreen', 'Header'),
      selector('ForgotPasswordScreen', 'ResetButton'),
      selector('YouHaveMailScreen', 'NewPasswordButton')
    ]);
    assert.deepEqual(typed, [[selector('ForgotPasswordScreen', 'EmailField'), 'Example@vgnet.testinator.com']]);
    assert.ok(catalog.YouHaveMailScreen.NewPasswordButton[platformKey]);
  });
}
