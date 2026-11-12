import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { expectedText, mobileElements } from './mobileElements.js';

export class MHALandingScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertMHAScreenHeader(): Promise<void> {
    await this.assertTextEquals(
      await this.element(mobileElements.MHALandingScreen.heading.android, mobileElements.MHALandingScreen.heading.ios),
      expectedText(mobileElements.MHALandingScreen.heading)
    );
  }

  async assertMHAInitPoints(): Promise<void> {
    await this.assertTextEquals(await this.element(mobileElements.MHALandingScreen.points.android, mobileElements.MHALandingScreen.points.ios), expectedText(mobileElements.MHALandingScreen.points, 'initial'));
  }

  async assertTimeInit(): Promise<void> {
    await this.assertTextEquals(await this.element(mobileElements.MHALandingScreen.time.android, mobileElements.MHALandingScreen.time.ios), expectedText(mobileElements.MHALandingScreen.time));
  }

  async isVisibleMHAStartButton(): Promise<boolean> {
    return this.isVisible(
      mobileElements.MHALandingScreen.startButton.android,
      mobileElements.MHALandingScreen.startButton.ios
    );
  }

  clickMHAStartButton(): Promise<void> {
    return this.click(
      mobileElements.MHALandingScreen.startButton.android,
      mobileElements.MHALandingScreen.startButton.ios
    );
  }

  clickIundertandOnDataPrivacyScreen(): Promise<void> {
    return this.click(mobileElements.MHALandingScreen.understandPrivacy.android, mobileElements.MHALandingScreen.understandPrivacy.ios);
  }

  async assertDataPrivacyScreenVisible(): Promise<void> {
    await this.element(
      mobileElements.MHALandingScreen.understandPrivacy.android,
      mobileElements.MHALandingScreen.understandPrivacy.ios
    );
  }

  clickDataPrivacyBackButton(): Promise<void> {
    return this.click(mobileElements.MHALandingScreen.privacyBack.android, mobileElements.MHALandingScreen.privacyBack.ios);
  }

  async assertLowRiskPointsUpdated(): Promise<void> {
    await this.assertTextContains(await this.element(mobileElements.MHALandingScreen.points.android, mobileElements.MHALandingScreen.points.ios), expectedText(mobileElements.MHALandingScreen.points, 'lowRisk'));
  }

  async assertCompltedDate(): Promise<void> {
    await this.assertTextContains(await this.element(mobileElements.MHALandingScreen.completedDate.android, mobileElements.MHALandingScreen.completedDate.ios), expectedText(mobileElements.MHALandingScreen.completedDate));
  
  }
  async assertRiskType(expectedRisk: 'Low risk' | 'Moderate risk' | 'High risk'): Promise<void> {
    await this.assertTextContains(await this.element(mobileElements.MHALandingScreen.riskType.android, mobileElements.MHALandingScreen.riskType.ios), expectedRisk);
  }
}
  