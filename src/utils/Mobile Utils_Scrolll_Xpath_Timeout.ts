import { browser, $, $$ } from '@wdio/globals';
import type { ChainablePromiseElement } from 'webdriverio';
import { settingOr, type MobilePlatform } from '../config/mobileSessionInit.js';
import { executionTimeouts } from '../config/timeoutsHandling.js';
import { executionReporter } from './ExecutionReporter.js';

export class MobileSession {
  readonly isIOS: boolean;
  readonly waitTimeout: number;

  constructor(readonly platform: MobilePlatform) {
    this.isIOS = platform === 'iOS';
    this.waitTimeout = executionTimeouts().element;
  }

  getPlatformLocator(androidXpath: string, iosXpath: string): string {
    return this.isIOS ? iosXpath : androidXpath;
  }

  async retryOnce<T>(description: string, operation: (retry: boolean) => Promise<T>): Promise<T> {
    try {
      return await operation(false);
    } catch (error) {
      executionReporter.log(`${description} failed; retrying once: ${error instanceof Error ? error.message : String(error)}`);
      return await operation(true);
    }
  }

  async waitForElement(selector: string, timeout = this.waitTimeout): Promise<ChainablePromiseElement> {
    return this.retryOnce(`Element lookup ${selector}`, retry => this.waitForElementAttempt(selector, retry ? 0 : timeout));
  }

  private async waitForElementAttempt(selector: string, timeout: number): Promise<ChainablePromiseElement> {
    const element = await $(selector);
    const deadline = Date.now() + timeout;
    do {
      if (await element.isExisting()) {
        return element;
      }
      if (Date.now() >= deadline) break;
      await browser.pause(250);
    } while (Date.now() <= deadline);
    throw new Error(`Element was not found within ${timeout} ms: ${selector}`);
  }

  async waitForVisibleElement(selector: string, timeout = this.waitTimeout): Promise<ChainablePromiseElement> {
    return this.retryOnce(`Element visibility ${selector}`, retry => this.waitForVisibleElementAttempt(selector, retry ? 0 : timeout));
  }

  private async waitForVisibleElementAttempt(selector: string, timeout: number): Promise<ChainablePromiseElement> {
    const element = await $(selector);
    const deadline = Date.now() + timeout;
    do {
      if (await element.isDisplayed()) {
        return element;
      }
      if (Date.now() >= deadline) break;
      await browser.pause(250);
    } while (Date.now() <= deadline);
    throw new Error(`Element was not visible within ${timeout} ms: ${selector}`);
  }

  async isElementVisible(selector: string, timeout = 5_000): Promise<boolean> {
    try {
      await this.waitForVisibleElementAttempt(selector, timeout);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Element was not visible within ')) {
        return false;
      }
      throw error;
    }
  }

  async clickElement(selector: string): Promise<void> {
    await this.retryOnce(`Click ${selector}`, async retry => {
      await (await this.waitForVisibleElementAttempt(selector, retry ? 0 : this.waitTimeout)).click();
    });
  }

  async typeIntoElement(selector: string, value: string): Promise<void> {
    await this.clickElement(selector);
    await this.retryOnce(`Text entry ${selector}`, async retry => {
      const element = await this.waitForVisibleElementAttempt(selector, retry ? 0 : this.waitTimeout);
      await element.setValue(value);
    });
  }

  async enterText(
    androidTriggerXpath: string,
    iosTriggerXpath: string,
    androidEditableXpath: string,
    iosEditableXpath: string,
    value: string
  ): Promise<void> {
    await this.clickElement(this.getPlatformLocator(androidTriggerXpath, iosTriggerXpath));
    await browser.pause(500);
    await this.typeIntoElement(this.getPlatformLocator(androidEditableXpath, iosEditableXpath), value);
    await browser.pause(1_000);
  }

  async scrollUp(): Promise<void> {
    const { width, height } = await browser.getWindowSize();
    await browser.performActions([{
      type: 'pointer',
      id: 'scroll-finger',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: Math.floor(width / 2), y: Math.floor(height / 2) },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 200 },
        {
          type: 'pointerMove',
          duration: 1_500,
          x: Math.floor(width / 2),
          y: Math.floor(height * 0.35)
        },
        // Hold before lifting to avoid a fling that overshoots the target.
        { type: 'pause', duration: 300 },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
    await browser.pause(750);
  }

  async findVisibleScrollTarget(selector: string): Promise<WebdriverIO.Element | undefined> {
    const candidates = await $$(selector);
    const { width, height } = await browser.getWindowSize();
    for (const candidate of candidates) {
      if (!await candidate.isDisplayed()) {
        continue;
      }

      // Native drivers can report off-screen elements as displayed.
      const location = await candidate.getLocation();
      const size = await candidate.getSize();
      const centerX = location.x + size.width / 2;
      const centerY = location.y + size.height / 2;
      if (size.width > 0 && size.height > 0
        && centerX >= 0 && centerX < width
        && centerY >= 0 && centerY < height) {
        return candidate;
      
      }
    }
    return undefined;
  }
}
