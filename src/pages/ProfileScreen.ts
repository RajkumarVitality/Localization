import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { SettingsScreen } from './SettingsScreen.js';
import { mobileElements } from './mobileElements.js';

export class ProfileScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async openSettings(): Promise<SettingsScreen> {
    await this.click(mobileElements.ProfileScreen.settings.android, mobileElements.ProfileScreen.settings.ios);
    return new SettingsScreen(this.session);
  }
}
