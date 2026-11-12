import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

export interface MobileLocator {
  android: string;
  ios: string;
  expected?: string | Record<string, string>;
}

type MobileElementCatalog = Record<string, Record<string, MobileLocator>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isMobileElementCatalog(value: unknown): value is MobileElementCatalog {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(page =>
    isRecord(page)
    && Object.values(page).every(locator =>
      isRecord(locator)
      && typeof locator.android === 'string'
      && typeof locator.ios === 'string'
      && (locator.expected === undefined
        || typeof locator.expected === 'string'
        || (isRecord(locator.expected)
          && Object.keys(locator.expected).length > 0
          && Object.values(locator.expected).every(text => typeof text === 'string')))
    )
  );
}

const catalog = load(readFileSync(new URL('../../elements/T9998.yml', import.meta.url), 'utf8'));

if (!isMobileElementCatalog(catalog)) {
  throw new TypeError('Invalid mobile element catalog: locators require Android and iOS selectors, with optional expected text or named text variants');
}

export const mobileElements = catalog;

export function expectedText(locator: MobileLocator, variant?: string): string {
  const expected = locator.expected;
  if (typeof expected === 'string' && variant === undefined) {
    return expected;
  }
  if (expected && typeof expected === 'object'
    && variant !== undefined && Object.hasOwn(expected, variant)) {
    return expected[variant];
  }
  throw new TypeError(`Missing expected text${variant === undefined ? '' : ` variant "${variant}"`} for mobile element: ${locator.android}`);
}

export function expectedTextOptions(locator: MobileLocator): string[] {
  const expected = locator.expected;
  if (expected && typeof expected === 'object' && Object.keys(expected).length > 0) {
    return Object.values(expected);
  }
  return [expectedText(locator)];
}

export function formatMobileLocator(locator: MobileLocator, values: Record<string, string | number>): MobileLocator {
  const format = (selector: string): string => selector.replace(/\{(\w+)\}/g, (_match, key: string) => {
    if (!(key in values)) {
      throw new TypeError(`Missing value for mobile locator placeholder: ${key}`);
    }
    return String(values[key]);
  });

  return { android: format(locator.android), ios: format(locator.ios) };
}
