import { BaseScreen } from './BaseScreen.js';
import { expectedText, mobileElements } from './mobileElements.js';
import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { LoginScreen } from './LoginScreen.js';

export class YouHaveMailScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertLoaded(): Promise<void> {
    const header = mobileElements.YouHaveMailScreen.Header;
    await this.assertTextEquals(await this.element(header.android, header.ios), expectedText(header));
  }

  async openLogin(): Promise<LoginScreen> {
    const button = mobileElements.YouHaveMailScreen.NewPasswordButton;
    await this.click(button.android, button.ios);
    return new LoginScreen(this.session);
  }
}
