import { BaseScreen } from './BaseScreen.js';
import { expectedText, mobileElements } from './mobileElements.js';
import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { YouHaveMailScreen } from './YouHaveMailScreen.js';

export class ForgotPasswordScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertLoaded(): Promise<void> {
    for (const locator of [mobileElements.ForgotPasswordScreen.Header, mobileElements.ForgotPasswordScreen.SubText]) {
      await this.assertTextEquals(await this.element(locator.android, locator.ios), expectedText(locator));
    }
  }

  async requestReset(username: string): Promise<YouHaveMailScreen> {
    const fields = mobileElements.ForgotPasswordScreen;
    await this.type(fields.EmailField.android, fields.EmailField.ios, username);
    await this.click(fields.Header.android, fields.Header.ios);
    await this.click(fields.ResetButton.android, fields.ResetButton.ios);
    return new YouHaveMailScreen(this.session);
  }
}
