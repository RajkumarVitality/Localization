import { browser } from '@wdio/globals';
import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { expectedText, mobileElements } from './mobileElements.js';

export class LoginScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertHelloVisible(): Promise<void> {
    await this.assertTextEquals(
      await this.element(mobileElements.LoginScreen.hello.android, mobileElements.LoginScreen.hello.ios),
      expectedText(mobileElements.LoginScreen.hello)
    );
  }

  enterUsername(username: string): Promise<void> {
    return this.enterText(
      mobileElements.LoginScreen.usernameLabel.android,
      mobileElements.LoginScreen.usernameLabel.ios,
      mobileElements.LoginScreen.usernameField.android,
      mobileElements.LoginScreen.usernameField.ios,
      username
    );
  }

  dismissKeyboard(): Promise<void> {
    return this.click(mobileElements.LoginScreen.hello.android, mobileElements.LoginScreen.hello.ios);
  }

  async enterPassword(password: string): Promise<void> {
    await this.type(mobileElements.LoginScreen.passwordField.android, mobileElements.LoginScreen.passwordField.ios, password);
    await browser.pause(300);
  }

  submit(): Promise<void> {
    return this.click(mobileElements.LoginScreen.submitButton.android, mobileElements.LoginScreen.submitButton.ios);
  }

  async assertIncorrectPasswordMessage(): Promise<void> {
    const text = await this.visibleText(
      await this.element(mobileElements.LoginScreen.incorrectPasswordMessage.android, mobileElements.LoginScreen.incorrectPasswordMessage.ios)
    );
    if (!text.includes(expectedText(mobileElements.LoginScreen.incorrectPasswordMessage))) {
      throw new Error(`Expected incorrect-password message but found: ${text}`);
    }
  }

  dismissIncorrectPasswordMessage(): Promise<void> {
    return this.click(mobileElements.LoginScreen.gotItButton.android, mobileElements.LoginScreen.gotItButton.ios);
  }

  gotItButton(): Promise<void> {
    return this.dismissIncorrectPasswordMessage();
  }

  async assertLockoutMessage(): Promise<void> {
    const text = await this.visibleText(
      await this.element(mobileElements.LoginScreen.lockoutMessage.android, mobileElements.LoginScreen.lockoutMessage.ios)
    );
    if (!text.includes(expectedText(mobileElements.LoginScreen.lockoutMessage))) {
      throw new Error(`Expected account lockout message but found: ${text}`);
    }
  }

  dismissLockoutMessage(): Promise<void> {
    return this.click(mobileElements.LoginScreen.dismissLockout.android, mobileElements.LoginScreen.dismissLockout.ios);
  }
}
