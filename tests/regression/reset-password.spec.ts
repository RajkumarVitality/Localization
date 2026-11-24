import { remote } from 'webdriverio';
import { configuredTenantNumber, requiredUserCreationSetting, userCreationProfilePrefix, userCreationSetting } from '../../src/config/userCreation.js';
import { getMailinatorMessageLinks } from '../../src/config/mailinator.js';
import { executionReporter } from '../../src/utils/ExecutionReporter.js';
import { assertTestAccountReady, testAccounts } from '../helpers/user_helpers/TestUser.js';
import { openLoginScreen, settleHomeScreen } from '../helpers/genericFlow.js';

describe('Reset password', () => {
  before('verify tenant and provisioned member', () => {
    if (configuredTenantNumber() !== '9998') throw new Error('Reset password requires tenant 9998 locators.');
    assertTestAccountReady();
  });

  it('resets the password through email and logs in with the new password', async () => {
    const password = 'TestPassword123@';
    const prefix = requiredUserCreationSetting(
      `${userCreationProfilePrefix(userCreationSetting('VG_ENVIRONMENT') ?? 'mdev')}LOGIN_PREFIX`
    );
    const email = testAccounts.member.slice(prefix.length);
    const inbox = email.split('@')[0];
    const { session, loginScreen, homeScreen } = await openLoginScreen();
    const forgotPassword = await loginScreen.openForgotPassword();
    await forgotPassword.assertLoaded();
    const mailScreen = await forgotPassword.requestReset(testAccounts.member);
    await mailScreen.assertLoaded();
    executionReporter.log('Reset requested; validated the forgot-password and mail screens.');

    const web = await remote({ capabilities: { browserName: 'chrome' }, logLevel: 'silent' });
    try {
      let resetLink = '';
      await web.waitUntil(async () => {
        try {
          resetLink = await getMailinatorMessageLinks(inbox, false);
          return true;
        } catch (error) {
          if (error instanceof Error && (
            error.message.includes('missing a valid msgs[0].id') ||
            error.message.includes('did not contain an HTTPS reset-password link')
          )) {
            executionReporter.log('Reset email not ready; checking again within the 90-second limit.');
            return false;
          }
          throw error;
        }
      }, { timeout: 90_000, interval: 3_000, timeoutMsg: 'Reset-password email did not arrive within 90 seconds.' });
      await web.url(resetLink);
      const newPassword = web.$('//*[@id="password"]');
      const confirmation = web.$('//*[@id="confirm_password"]');
      const resetButton = web.$('//*[@id="reset-button"]');
      await newPassword.waitForDisplayed({ timeout: 30_000 });
      await newPassword.setValue(password);
      await confirmation.waitForDisplayed({ timeout: 30_000 });
      await confirmation.setValue(password);
      await resetButton.waitForClickable({ timeout: 30_000 });
      await resetButton.click();
      await web.waitUntil(async () => {
        const text = await web.$('body').getText();
        return /password/i.test(text) && /successfully\s+reset/i.test(text);
      }, { timeout: 30_000, timeoutMsg: 'Password reset success message was not displayed.' });
      executionReporter.log('Web password reset succeeded.');
    } finally {
      await web.deleteSession();
    }

    const newLogin = await mailScreen.openLogin();
    await newLogin.assertHelloVisible();
    await newLogin.enterUsername(testAccounts.member);
    await newLogin.dismissKeyboard();
    await newLogin.enterPassword(password);
    await newLogin.dismissKeyboard();
    await newLogin.submit();
    await settleHomeScreen(homeScreen, session);
    executionReporter.log('Mobile login succeeded with the reset password.');
  });
});
