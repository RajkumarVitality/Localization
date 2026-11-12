import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { expectedText, mobileElements } from './mobileElements.js';

export class MHASuccessfulCompleteScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertCompletionMessage(): Promise<void> {
    await this.assertTextContains(
      await this.element(mobileElements.MHASuccessfulCompleteScreen.completionMessage.android, mobileElements.MHASuccessfulCompleteScreen.completionMessage.ios),
      expectedText(mobileElements.MHASuccessfulCompleteScreen.completionMessage)
    );
  }

  async assertViewResultsButtonVisible(): Promise<void> {
    await this.assertTextEquals(
      await this.element(mobileElements.MHASuccessfulCompleteScreen.viewResultsLabel.android, mobileElements.MHASuccessfulCompleteScreen.viewResultsLabel.ios),
      expectedText(mobileElements.MHASuccessfulCompleteScreen.viewResultsLabel)
    );
  }

  clickViewResults(): Promise<void> {
    return this.click(mobileElements.MHASuccessfulCompleteScreen.viewResultsButton.android, mobileElements.MHASuccessfulCompleteScreen.viewResultsButton.ios);
  }
}
