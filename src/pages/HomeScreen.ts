import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { ProfileScreen } from './ProfileScreen.js';
import { ActivityScreen } from './ActivityScreen.js';
import { HealthScreen } from './HealthScreen.js';
import { expectedTextOptions, mobileElements } from './mobileElements.js';
import {ScreeningVaccinationScreen} from "./ScreeningVaccinationScreen.js";

export class HomeScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertGreetingVisible(): Promise<void> {
    await this.assertTextContains(
      await this.element(mobileElements.HomeScreen.greeting.android, mobileElements.HomeScreen.greeting.ios),
      ...expectedTextOptions(mobileElements.HomeScreen.greeting)
    );
  }

  dismissNotificationPopup(): Promise<void> {
    return this.click(mobileElements.HomeScreen.dismissNotification.android, mobileElements.HomeScreen.dismissNotification.ios);
  }

  acceptPermissionDialog(): Promise<void> {
    return this.click(mobileElements.HomeScreen.allowPermission.android, mobileElements.HomeScreen.allowPermission.ios);
  }

  async openProfileTab(): Promise<ProfileScreen> {
    await this.click(mobileElements.HomeScreen.profileTab.android, mobileElements.HomeScreen.profileTab.ios);
    return new ProfileScreen(this.session);
  }

  async openActivityTab(): Promise<ActivityScreen> {
    await this.click(mobileElements.HomeScreen.activityTab.android, mobileElements.HomeScreen.activityTab.ios);
    return new ActivityScreen(this.session);
  }

  async openHealthTab(): Promise<HealthScreen> {
    await this.click(mobileElements.HomeScreen.healthTab.android, mobileElements.HomeScreen.healthTab.ios);
    return new HealthScreen(this.session);
  }

  async openRewardTab(): Promise<ActivityScreen> {
    await this.click(mobileElements.HomeScreen.rewardTab.android, mobileElements.HomeScreen.rewardTab.ios);
    return new ActivityScreen(this.session);
  }

  async openSeeAllActivities(): Promise<ActivityScreen> {
    await this.scrollAndClick(mobileElements.HomeScreen.seeAllActivities.android, mobileElements.HomeScreen.seeAllActivities.ios, 15);
    return new ActivityScreen(this.session);
  }

}
