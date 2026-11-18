import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { LoginScreen } from '../../src/pages/LoginScreen.js';
import { expectedText, mobileElements } from '../../src/pages/mobileElements.js';
import { MobileSession, RequiredMobileElementError } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from '../../src/pages/BaseScreen.js';

test('visibility timeout gets exactly one fresh lookup attempt', async t => {
  let lookups = 0;
  let clock = 0;
  t.mock.method(Date, 'now', () => ++clock);
  _setGlobal('$', async () => {
    lookups++;
    return { isDisplayed: async () => false };
  });
  await assert.rejects(new MobileSession('Android').waitForVisibleElement('~missing', 0),
    /Element was not visible/);
  assert.equal(lookups, 1);
});

for (const operation of ['lookup', 'visibility', 'click', 'type'] as const) {
  test(`${operation} aborts after the wait without retrying a missing element`, async t => {
    let clock = 0;
    let lookups = 0;
    let subsequentStep = false;
    let pauses = 0;
    t.mock.method(Date, 'now', () => clock);
    _setGlobal('browser', { pause: async () => { pauses++; clock += 250; } });
    _setGlobal('$', async () => {
      const lookup = ++lookups;
      const check = async () => {
        return operation === 'type' && lookup === 1;
      };
      return { isDisplayed: check, isExisting: check, click: async () => {} };
    });
    const session = new MobileSession('Android');
    const action = operation === 'lookup' ? () => session.waitForElement('~missing', 500)
      : operation === 'visibility' ? () => session.waitForVisibleElement('~missing', 500)
        : operation === 'click' ? () => session.clickElement('~missing')
          : () => session.typeIntoElement('~missing', 'value');
    await assert.rejects(async () => {
      await action();
      subsequentStep = true;
    }, RequiredMobileElementError);
    assert.equal(clock, operation === 'lookup' || operation === 'visibility' ? 500 : session.waitTimeout);
    assert.equal(pauses, clock / 250);
    assert.equal(subsequentStep, false);
    assert.equal(lookups, operation === 'type' ? 2 : 1);
  });
}

for (const platform of ['Android', 'iOS'] as const) {
  for (const failure of ['visibility', 'click', 'type', 'assertion'] as const) {
    for (const recovers of [false, true]) {
    test(`${platform} ${failure} retries once and ${recovers ? 'continues on recovery' : 'aborts on second failure'}`, async () => {
      const calls: string[] = [];
      let failures = 0;
      const shouldFail = () => ++failures === 1 || !recovers;
      _setGlobal('$', async () => ({
        isDisplayed: async () => {
          calls.push('visible');
          if (failure === 'visibility' && shouldFail()) throw new Error('Driver lookup failed');
          return true;
        },
        click: async () => {
          calls.push('click');
          if (failure === 'click' && shouldFail()) throw new Error('stale element reference');
        },
        setValue: async () => {
          calls.push('type');
          if (shouldFail()) throw new Error('stale element reference');
        },
        getAttribute: async () => {
          calls.push('assertion');
          if (shouldFail()) return 'Unexpected text';
          return expectedText(mobileElements.LoginScreen.hello);
        }
      }));
      const session = new MobileSession(platform);
      const scenario = async () => {
        if (failure === 'assertion') {
          await new LoginScreen(session).assertHelloVisible();
        } else if (failure === 'type') {
          await session.typeIntoElement('~input', 'value');
        } else {
          await session.clickElement('~button');
        }
        calls.push('subsequent-step');
      };
      if (recovers) await scenario();
      else await assert.rejects(scenario, failure === 'assertion' ? /Mobile element text did not match/
        : failure === 'visibility' ? /Driver lookup failed/ : /stale element reference/);
      const expected = failure === 'visibility' ? ['visible', 'visible', ...(recovers ? ['click'] : [])]
        : failure === 'assertion' ? ['visible', 'assertion', 'assertion']
          : failure === 'type' ? ['visible', 'click', 'visible', 'type', 'visible', 'type']
            : ['visible', 'click', 'visible', 'click'];
      assert.deepEqual(calls, [...expected, ...(recovers ? ['subsequent-step'] : [])]);
      assert.equal(failures, 2);
    });
    }

    test('optional visibility remains false and a later independent operation can succeed', async () => {
      _setGlobal('$', async () => ({ isDisplayed: async () => false }));
      const session = new MobileSession('Android');
      assert.equal(await session.isElementVisible('~optional', 0), false);
      await assert.rejects(session.waitForVisibleElement('~required', 0), RequiredMobileElementError);
      _setGlobal('$', async () => ({ isDisplayed: async () => true }));
      await session.waitForVisibleElement('~next-test', 0);
    });

    test('nested retry wrappers preserve the missing-element error without retrying', async () => {
      const session = new MobileSession('iOS');
      const missing = new RequiredMobileElementError('required element missing');
      let attempts = 0;
      await assert.rejects(session.retryOnce('outer assertion', () =>
        session.retryOnce('inner lookup', async () => {
          attempts++;
          throw missing;
        })), error => error === missing);
      assert.equal(attempts, 1);
    });

    test('scroll exhaustion aborts without repeating the scroll sequence', async t => {
      class Screen extends BaseScreen {
        constructor(session: MobileSession) { super(session); }
        run() { return this.scrollAndClick('~missing', '~missing', 2); }
      }
      const session = new MobileSession('Android');
      let lookups = 0;
      let swipes = 0;
      t.mock.method(session, 'findVisibleScrollTarget', async () => { lookups++; return undefined; });
      t.mock.method(session, 'scrollUp', async () => { swipes++; });
      await assert.rejects(new Screen(session).run(), RequiredMobileElementError);
      assert.equal(lookups, 3);
      assert.equal(swipes, 2);
    });
  }
}
