import assert from 'node:assert/strict';
import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { expectedText, mobileElements } from './mobileElements.js';

export class MHASectionScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertStartButtonEnabled(): Promise<void> {
    const startButton = await this.element(mobileElements.MHASectionScreen.startButtonEnabled.android, mobileElements.MHASectionScreen.startButtonEnabled.ios);
    assert.ok(await startButton.isEnabled(), 'MHA Start button is enabled');
  }

  clickStartButton(): Promise<void> {
    return this.click(mobileElements.MHASectionScreen.startButton.android, mobileElements.MHASectionScreen.startButton.ios);
  }

  async assertMHAScreenHeader(): Promise<void> {
    await this.assertTextEquals(
      await this.element(mobileElements.MHASectionScreen.heading.android, mobileElements.MHASectionScreen.heading.ios),
      expectedText(mobileElements.MHASectionScreen.heading)
    );
  }
}
