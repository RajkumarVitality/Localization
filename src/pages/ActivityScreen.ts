import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { MHALandingScreen } from './MHALandingScreen.js';
import { ScreeningVaccinationScreen } from './ScreeningVaccinationScreen.js';
import { expectedText, mobileElements } from './mobileElements.js';

export class ActivityScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertActivityHeader(): Promise<this> {
    await this.assertTextEquals(
      await this.element(mobileElements.ActivityScreen.heading.android, mobileElements.ActivityScreen.heading.ios),
      expectedText(mobileElements.ActivityScreen.heading)
    );
    return this;
  }

  async openMHAFeedcard(): Promise<MHALandingScreen> {
    await this.scrollAndClick(mobileElements.ActivityScreen.mhaFeedcard.android, mobileElements.ActivityScreen.mhaFeedcard.ios, 7);
    return new MHALandingScreen(this.session);
  }

  async assertMHAInitPoints(): Promise<this> {
    await this.assertTextEquals(
      await this.element(mobileElements.ActivityScreen.mhaPoints.android, mobileElements.ActivityScreen.mhaPoints.ios),
      expectedText(mobileElements.ActivityScreen.mhaPoints)
    );
    return this;
  }

  async assertMHAInitText(): Promise<this> {
    await this.assertTextEquals(
      await this.element(mobileElements.ActivityScreen.mhaDescription.android, mobileElements.ActivityScreen.mhaDescription.ios),
      expectedText(mobileElements.ActivityScreen.mhaDescription)
    );
    return this;
  }

  async openScreeningVaccinationFeedcard(): Promise<ScreeningVaccinationScreen> {
    await this.scrollAndClick(mobileElements.ActivityScreen.screeningVaccinationFeedcard.android, mobileElements.ActivityScreen.screeningVaccinationFeedcard.ios, 15);
    return new ScreeningVaccinationScreen(this.session);
  }

  async assertSnVInitPoints(): Promise<ScreeningVaccinationScreen> {
    await this.assertTextEquals(
      await this.element(mobileElements.ActivityScreen.screeningVaccinationPoints.android, mobileElements.ActivityScreen.screeningVaccinationPoints.ios),
      expectedText(mobileElements.ActivityScreen.screeningVaccinationPoints)
    );
    return new ScreeningVaccinationScreen(this.session);
  }

  async assertSnVInitText(): Promise<ScreeningVaccinationScreen> {
    await this.assertTextEquals(
      await this.element(mobileElements.ActivityScreen.screeningVaccinationDescription.android, mobileElements.ActivityScreen.screeningVaccinationDescription.ios),
      expectedText(mobileElements.ActivityScreen.screeningVaccinationDescription)
    );
    return new ScreeningVaccinationScreen(this.session);
  }
}
