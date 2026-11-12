import assert from 'node:assert/strict';
import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { expectedText, mobileElements } from './mobileElements.js';

export class SettingsScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertLoaded(): Promise<void> {
    assert.ok(await (await this.element(mobileElements.SettingsScreen.heading.android, mobileElements.SettingsScreen.heading.ios)).isDisplayed());
  }

  scrollToLogoutAndTap(): Promise<void> {
    return this.scrollAndClick(mobileElements.SettingsScreen.logout.android, mobileElements.SettingsScreen.logout.ios, 10);
  }

  async assertLogoutConfirmation(): Promise<void> {
    await this.assertTextEquals(
      await this.element(mobileElements.SettingsScreen.logoutConfirmation.android, mobileElements.SettingsScreen.logoutConfirmation.ios),
      expectedText(mobileElements.SettingsScreen.logoutConfirmation)
    );
  }

  confirmLogout(): Promise<void> {
    return this.click(mobileElements.SettingsScreen.confirmLogout.android, mobileElements.SettingsScreen.confirmLogout.ios);
  }
}
