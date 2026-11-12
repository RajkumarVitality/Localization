import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { LoginScreen } from './LoginScreen.js';
import { expectedText, mobileElements } from './mobileElements.js';

export class HealthyLivingScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertHealthyLivingMessage(): Promise<void> {
    await this.assertTextEquals(
      await this.element(mobileElements.HealthyLivingScreen.welcomeMessage.android, mobileElements.HealthyLivingScreen.welcomeMessage.ios),
      expectedText(mobileElements.HealthyLivingScreen.welcomeMessage)
    );
  }

  async openLogin(): Promise<LoginScreen> {
    await this.click(mobileElements.HealthyLivingScreen.loginButton.android, mobileElements.HealthyLivingScreen.loginButton.ios);
    return new LoginScreen(this.session);
  }
}
