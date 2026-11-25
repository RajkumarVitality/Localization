import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { suites } from '../../src/config/runner.js';

test('smoke pack selects only login/logout and high-risk MHA', () => {
  assert.deepEqual(suites.smoke, [
    './tests/smoke/login-logout.spec.ts',
    './tests/smoke/mha-high-risk.spec.ts'
  ]);
});

test('regression pack includes the single-attempt and lockout password scenarios', () => {
  assert.ok(suites.regression.includes('./tests/regression/incorrect-password-lockout.spec.ts'));
  assert.ok(suites.regression.includes('./tests/regression/incorrect-password-once.spec.ts'));
});

test('packs contain distinct existing specs in separate worker entries', () => {
  for (const pack of Object.values(suites)) {
    assert.equal(new Set(pack).size, pack.length);
    for (const file of pack) {
      assert.equal(typeof file, 'string');
      assert.ok(existsSync(new URL(`../../${file}`, import.meta.url)), file);
    }
  }
});
