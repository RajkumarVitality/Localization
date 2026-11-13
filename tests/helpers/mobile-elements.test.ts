import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  expectedText,
  expectedTextOptions,
  formatMobileLocator,
  loadMobileElementCatalog,
  mobileElements
} from '../../src/pages/mobileElements.js';
import { _setGlobal } from '@wdio/globals';
import { LoginScreen } from '../../src/pages/LoginScreen.js';
import { HomeScreen } from '../../src/pages/HomeScreen.js';
import { MHALandingScreen } from '../../src/pages/MHALandingScreen.js';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';

test('loads the central mobile element catalog from the elements directory', () => {
  assert.ok(mobileElements.LoginScreen.hello.android);
  assert.ok(mobileElements.LoginScreen.hello.ios);
  assert.ok(mobileElements.MHAQuestionsScreen.questionByIndex.android);
  assert.ok(mobileElements.MHAQuestionsScreen.questionByIndex.ios);
});

test('formats question locators from the central catalog', () => {
  assert.deepEqual(
    formatMobileLocator(mobileElements.MHAQuestionsScreen.questionByIndex, { index: 2 }),
    {
      android: "//*[@resource-id='question_2']",
      ios: '~question_2'
    }
  );
});

test('reads expected text and state variants beside their element locators', () => {
  const tenant9998 = loadMobileElementCatalog('9998');
  const tenant34 = loadMobileElementCatalog('34');
  assert.equal(expectedText(tenant9998.WelcomeScreen.welcomeMessage),
    'The world\u2019s largest science-based behavioural change program that rewards you for making healthier choices.');
  assert.equal(expectedText(tenant9998.LoginScreen.hello), 'Hello');
  assert.equal(expectedText(tenant34.WelcomeScreen.welcomeMessage),
    "'s Werelds grootste wetenschappelijk onderbouwde programma voor gedragsverandering dat je beloont voor het maken van gezondere keuzes.");
  assert.equal(expectedText(tenant34.LoginScreen.hello), 'Hallo');
  assert.equal(expectedText(tenant9998.MHALandingScreen.points, 'initial'), '0/600 POINTS');
  assert.equal(expectedText(tenant9998.MHALandingScreen.points, 'lowRisk'), '300/600 POINTS');
  assert.deepEqual(expectedTextOptions(tenant9998.HomeScreen.greeting),
    ['Good morning', 'Good afternoon', 'Good evening']);
});

test('rejects missing expected text and unknown variants instead of defaulting', () => {
  assert.throws(() => expectedText(mobileElements.LoginScreen.submitButton), /Missing expected text/);
  assert.throws(() => expectedText(mobileElements.MHALandingScreen.points), /Missing expected text/);
  assert.throws(() => expectedText(mobileElements.MHALandingScreen.points, 'unknown'), /Missing expected text/);
});

for (const platform of ['Android', 'iOS'] as const) {
  test(`${platform} page assertions use the expected text configured on their elements`, async () => {
    let text = expectedText(mobileElements.LoginScreen.hello);
    _setGlobal('$', async () => ({
      isDisplayed: async () => true,
      getText: async () => text,
      getAttribute: async () => text
    }));
    const session = new MobileSession(platform);
    await new LoginScreen(session).assertHelloVisible();

    text = `${expectedText(mobileElements.HomeScreen.greeting, 'afternoon')}, member`;
    await new HomeScreen(session).assertGreetingVisible();

    const landing = new MHALandingScreen(session);
    text = expectedText(mobileElements.MHALandingScreen.points, 'initial');
    await landing.assertMHAInitPoints();
    text = expectedText(mobileElements.MHALandingScreen.points, 'lowRisk');
    await landing.assertLowRiskPointsUpdated();
    text = 'Unexpected points';
    await assert.rejects(landing.assertLowRiskPointsUpdated(), /Expected mobile element text/);
  });
}
