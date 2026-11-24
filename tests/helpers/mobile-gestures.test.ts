import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { MobileSession, type GestureDirection } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';

type Action = { type: string; x?: number; y?: number; duration?: number; button?: number };
type Pointer = { id: string; parameters: { pointerType: string }; actions: Action[] };

function setup(platform: 'Android' | 'iOS') {
  const performed: Pointer[][] = [];
  let releases = 0;
  let swipes = 0;
  let visibleAfter = 0;
  let actionError: Error | undefined;
  let releaseError: Error | undefined;
  const element = {
    isDisplayed: async () => true,
    getLocation: async () => ({ x: 100, y: swipes >= visibleAfter ? 200 : 1_100 }),
    getSize: async () => ({ width: 200, height: 100 })
  };
  _setGlobal('browser', {
    getWindowSize: async () => ({ width: 600, height: 1_000 }),
    performActions: async (actions: Pointer[]) => {
      performed.push(actions);
      swipes++;
      if (actionError) throw actionError;
    },
    releaseActions: async () => {
      releases++;
      if (releaseError) throw releaseError;
    },
    pause: async () => {}
  });
  _setGlobal('$', async () => element);
  _setGlobal('$$', async () => [element]);
  return {
    session: new MobileSession(platform), performed,
    releases: () => releases,
    visibleAfter: (value: number) => { visibleAfter = value; },
    failAction: (error: Error) => { actionError = error; },
    failRelease: (error: Error) => { releaseError = error; }
  };
}

for (const platform of ['Android', 'iOS'] as const) {
  test(`${platform} swipe uses viewport-relative W3C touch actions for each direction`, async () => {
    const f = setup(platform);
    const expected = {
      up: [300, 750, 300, 250],
      down: [300, 250, 300, 750],
      left: [450, 500, 150, 500],
      right: [150, 500, 450, 500]
    };
    for (const [direction, coordinates] of Object.entries(expected)) {
      await f.session.swipe(direction as GestureDirection, 600);
      const pointer = f.performed.at(-1)![0];
      assert.equal(pointer.parameters.pointerType, 'touch');
      assert.deepEqual(pointer.actions.map(action => action.type), ['pointerMove', 'pointerDown', 'pointerMove', 'pointerUp']);
      assert.deepEqual([pointer.actions[0].x, pointer.actions[0].y, pointer.actions[2].x, pointer.actions[2].y], coordinates);
      assert.equal(pointer.actions[2].duration, 600);
    }
    assert.equal(f.releases(), 4);
  });

  test(`${platform} scroll reverses finger direction and searches after final swipe`, async () => {
    const f = setup(platform);
    f.visibleAfter(2);
    const target = await f.session.scrollToElement('~target', 'down', 2);
    assert.ok(target);
    assert.equal(f.performed.length, 2);
    assert.ok(f.performed[0][0].actions[0].y! > f.performed[0][0].actions[2].y!);
    assert.equal(f.releases(), 2);
  });

  test(`${platform} long press and pinch use visible element bounds and synchronized pointers`, async () => {
    const f = setup(platform);
    await f.session.longPress('~target', 1200);
    const press = f.performed[0][0];
    assert.deepEqual([press.actions[0].x, press.actions[0].y], [200, 250]);
    assert.equal(press.actions[2].duration, 1200);
    await f.session.pinch('~target', 'in');
    await f.session.pinch('~target', 'out', 700);
    for (const [index, mode] of [[1, 'in'], [2, 'out']] as const) {
      const [left, right] = f.performed[index];
      assert.notEqual(left.id, right.id);
      assert.deepEqual(left.actions.map(action => action.type), right.actions.map(action => action.type));
      const startGap = right.actions[0].x! - left.actions[0].x!;
      const endGap = right.actions[2].x! - left.actions[2].x!;
      assert.equal(mode === 'in' ? startGap > endGap : startGap < endGap, true);
    }
    assert.equal(f.releases(), 3);
  });
}

test('gesture failures release pointers and preserve the original error', async () => {
  const f = setup('Android');
  const error = new Error('device action failed');
  f.failAction(error);
  await assert.rejects(f.session.swipe('up'), actual => actual === error);
  assert.equal(f.releases(), 1);
  f.failRelease(new Error('release failed'));
  await assert.rejects(f.session.swipe('up'), AggregateError);
});

test('invalid input and offscreen elements fail before a gesture is sent', async () => {
  const f = setup('iOS');
  await assert.rejects(f.session.swipe('up', 0), /positive integer/);
  await assert.rejects(f.session.swipe('bad' as GestureDirection), /Invalid gesture direction/);
  await assert.rejects(f.session.scrollToElement('~target', 'down', -1), /non-negative integer/);
  await assert.rejects(f.session.longPress(' '), /must not be blank/);
  f.visibleAfter(Infinity);
  await assert.rejects(f.session.pinch('~target', 'in'), /insufficient visible bounds/);
  assert.equal(f.performed.length, 0);
  await assert.rejects(f.session.scrollToElement('~target', 'down', 1), /not visible after 1 scrolls/);
  assert.equal(f.performed.length, 1);
});
