import { executionReporter } from '../../src/utils/ExecutionReporter.js';
import { requiredSetting } from '../../src/config/mobileSessionInit.js';
import { assertTestAccountReady, testAccounts } from '../helpers/user_helpers/TestUser.js';
import { loginWithUsername } from '../helpers/genericFlow.js';

describe('single incorrect password attempt', () => {
  before('verify pre-session incorrect-password member account', () => {
    const incorrectPassword = requiredSetting('INCORRECT_APP_PASSWORD', 'APP_INCORRECT_PASSWORD');
    if (incorrectPassword === requiredSetting('APP_PASSWORD')) {
      throw new Error('INCORRECT_APP_PASSWORD must differ from APP_PASSWORD for incorrect-password scenarios.');
    }
    assertTestAccountReady();
  });

  it('shows the incorrect-password message after one attempt and returns to login', async () => {
    executionReporter.log('Running one incorrect password attempt scenario.');
    const { loginScreen } = await loginWithUsername(testAccounts.member);
    await loginScreen.enterPassword(requiredSetting('INCORRECT_APP_PASSWORD', 'APP_INCORRECT_PASSWORD'));
    await loginScreen.dismissKeyboard();
    await loginScreen.submit();
    executionReporter.log('Submitted one incorrect password attempt.');
    await loginScreen.assertIncorrectPasswordMessage();
    executionReporter.log('Validated incorrect-password message after one attempt.');
    await loginScreen.gotItButton();
    await loginScreen.assertHelloVisible();
    await executionReporter.captureScreenshot('one-time-incorrect-password');
    executionReporter.log('Returned to login after dismissing the incorrect-password message.');
  });
});
