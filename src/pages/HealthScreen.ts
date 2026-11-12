import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import {ActivityScreen} from "./ActivityScreen.js";
import { expectedText, mobileElements } from './mobileElements.js';

export class HealthScreen extends BaseScreen {
    constructor(session: MobileSession) {
        super(session);
    }

    async assertHealthHeader(): Promise<this> {
        await this.assertTextEquals(
            await this.element(mobileElements.HealthScreen.heading.android, mobileElements.HealthScreen.heading.ios),
            expectedText(mobileElements.HealthScreen.heading)
        );
        return this;
    }
    async scrollTillSeeAllActivity(): Promise<ActivityScreen> {
        await this.scrollAndClick(mobileElements.HealthScreen.seeAllActivity.android, mobileElements.HealthScreen.seeAllActivity.ios, 15);
        return new ActivityScreen(this.session);
    }

}
