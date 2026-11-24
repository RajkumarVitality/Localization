import { browser, $, $$ } from '@wdio/globals';
import { AssertionError } from 'node:assert';
import type { ChainablePromiseElement } from 'webdriverio';
import { settingOr, type MobilePlatform } from '../config/mobileSessionInit.js';
import { executionTimeouts } from '../config/timeoutsHandling.js';
import { executionReporter } from './ExecutionReporter.js';

export type GestureDirection = 'up' | 'down' | 'left' | 'right';
export type PinchMode = 'in' | 'out';
type Point = { x: number; y: number };
type Rectangle = Point & { width: number; height: number };

function validateGestureDirection(direction: GestureDirection): void {
  if (!['up', 'down', 'left', 'right'].includes(direction)) {
    throw new TypeError(`Invalid gesture direction: ${String(direction)}`);
  }
}

function validateGestureDuration(duration: number): void {
  if (!Number.isInteger(duration) || duration <= 0) {
    throw new RangeError('Gesture duration must be a positive integer in milliseconds.');
  }
}

function touchMove(id: string, start: Point, end: Point, duration: number): object {
  return {
    type: 'pointer',
    id,
    parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, origin: 'viewport', ...start },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', duration, origin: 'viewport', ...end },
      { type: 'pointerUp', button: 0 }
    ]
  };
}

async function performGesture(actions: object[]): Promise<void> {
  let actionError: unknown;
  let actionFailed = false;
  try {
    await browser.performActions(actions);
  } catch (error) {
    actionFailed = true;
    actionError = error;
  }
  try {
    await browser.releaseActions();
  } catch (error) {
    if (actionFailed) throw new AggregateError([actionError, error], 'Gesture and pointer release both failed.');
    throw error;
  }
  if (actionFailed) throw actionError;
}

export class RequiredMobileElementError extends Error {
  override name = 'RequiredMobileElementError';
}

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
      if (error instanceof RequiredMobileElementError || error instanceof AssertionError) {
        executionReporter.log(`${description} failed; aborting current test without retry: ${error.message}`);
        throw error;
      }
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
    throw new RequiredMobileElementError(`Element was not found within ${timeout} ms: ${selector}`);
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
    throw new RequiredMobileElementError(`Element was not visible within ${timeout} ms: ${selector}`);
  }

  async isElementVisible(selector: string, timeout = 5_000): Promise<boolean> {
    try {
      await this.waitForVisibleElementAttempt(selector, timeout);
      return true;
    } catch (error) {
      if (error instanceof RequiredMobileElementError) {
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

  private async gestureViewport(): Promise<Rectangle> {
    const { width, height } = await browser.getWindowSize();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 4 || height < 4) {
      throw new Error('Device viewport is too small or invalid for gestures.');
    }
    return { x: 0, y: 0, width, height };
  }

  private async gestureElementBounds(selector: string): Promise<Rectangle> {
    if (!selector.trim()) throw new TypeError('Gesture element selector must not be blank.');
    const element = await this.waitForVisibleElement(selector);
    const [viewport, location, size] = await Promise.all([
      this.gestureViewport(), element.getLocation(), element.getSize()
    ]);
    const left = Math.max(0, location.x);
    const top = Math.max(0, location.y);
    const right = Math.min(viewport.width - 1, location.x + size.width);
    const bottom = Math.min(viewport.height - 1, location.y + size.height);
    if (![left, top, right, bottom].every(Number.isFinite) || right - left < 4 || bottom - top < 4) {
      throw new Error('Gesture element has insufficient visible bounds in the device viewport.');
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  async swipe(direction: GestureDirection, duration = 500): Promise<void> {
    validateGestureDirection(direction);
    validateGestureDuration(duration);
    const { width, height } = await this.gestureViewport();
    const x = Math.floor(width / 2);
    const y = Math.floor(height / 2);
    const points: Record<GestureDirection, [Point, Point]> = {
      up: [{ x, y: Math.floor(height * 0.75) }, { x, y: Math.floor(height * 0.25) }],
      down: [{ x, y: Math.floor(height * 0.25) }, { x, y: Math.floor(height * 0.75) }],
      left: [{ x: Math.floor(width * 0.75), y }, { x: Math.floor(width * 0.25), y }],
      right: [{ x: Math.floor(width * 0.25), y }, { x: Math.floor(width * 0.75), y }]
    };
    const [start, end] = points[direction];
    executionReporter.log(`Gesture: swipe ${direction} (${duration} ms).`);
    await performGesture([touchMove('swipe-finger', start, end, duration)]);
  }

  async scroll(direction: GestureDirection, duration = 800): Promise<void> {
    validateGestureDirection(direction);
    const opposite: Record<GestureDirection, GestureDirection> = {
      up: 'down', down: 'up', left: 'right', right: 'left'
    };
    await this.swipe(opposite[direction], duration);
  }

  async scrollToElement(
    selector: string, direction: GestureDirection = 'down', maxSwipes = 5
  ): Promise<WebdriverIO.Element> {
    if (!selector.trim()) throw new TypeError('Gesture element selector must not be blank.');
    validateGestureDirection(direction);
    if (!Number.isInteger(maxSwipes) || maxSwipes < 0) {
      throw new RangeError('maxSwipes must be a non-negative integer.');
    }
    for (let count = 0; count <= maxSwipes; count++) {
      const target = await this.findVisibleScrollTarget(selector);
      if (target) return target;
      if (count < maxSwipes) {
        await this.scroll(direction);
        await browser.pause(750);
      }
    }
    throw new RequiredMobileElementError(`Element was not visible after ${maxSwipes} scrolls: ${selector}`);
  }

  async longPress(selector: string, duration = 1_000): Promise<void> {
    validateGestureDuration(duration);
    const rect = await this.gestureElementBounds(selector);
    const center = { x: Math.floor(rect.x + rect.width / 2), y: Math.floor(rect.y + rect.height / 2) };
    executionReporter.log(`Gesture: long press (${duration} ms).`);
    await performGesture([{
      type: 'pointer',
      id: 'press-finger',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, origin: 'viewport', ...center },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
  }

  async pinch(selector: string, mode: PinchMode, duration = 500): Promise<void> {
    if (mode !== 'in' && mode !== 'out') throw new TypeError(`Invalid pinch mode: ${String(mode)}`);
    validateGestureDuration(duration);
    const rect = await this.gestureElementBounds(selector);
    const y = Math.floor(rect.y + rect.height / 2);
    const leftOuter = { x: Math.floor(rect.x + rect.width * 0.2), y };
    const leftInner = { x: Math.floor(rect.x + rect.width * 0.4), y };
    const rightInner = { x: Math.floor(rect.x + rect.width * 0.6), y };
    const rightOuter = { x: Math.floor(rect.x + rect.width * 0.8), y };
    if (leftOuter.x >= leftInner.x || leftInner.x >= rightInner.x || rightInner.x >= rightOuter.x) {
      throw new Error('Gesture element is too narrow for a pinch.');
    }
    executionReporter.log(`Gesture: pinch ${mode} (${duration} ms).`);
    await performGesture([
      touchMove('pinch-left', mode === 'in' ? leftOuter : leftInner, mode === 'in' ? leftInner : leftOuter, duration),
      touchMove('pinch-right', mode === 'in' ? rightOuter : rightInner, mode === 'in' ? rightInner : rightOuter, duration)
    ]);
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
