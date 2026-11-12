import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { HealthyLivingScreen } from './HealthyLivingScreen.js';
import { expectedText, mobileElements } from './mobileElements.js';

export class WelcomeScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertWelcomeMessage(): Promise<void> {
    await this.assertTextEquals(
      await this.element(mobileElements.WelcomeScreen.welcomeMessage.android, mobileElements.WelcomeScreen.welcomeMessage.ios),
      expectedText(mobileElements.WelcomeScreen.welcomeMessage)
    );
  }

  async openHealthyLiving(): Promise<HealthyLivingScreen> {
    await this.click(mobileElements.WelcomeScreen.nextButton.android, mobileElements.WelcomeScreen.nextButton.ios);
    return new HealthyLivingScreen(this.session);
  }
}
