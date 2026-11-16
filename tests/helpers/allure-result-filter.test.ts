import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { allureFilterOptions } from '../../src/config/allureFilterOptions.js';
import {
  createFilteredAllureResults,
  matchesAllureResult,
  validateAllureDate
} from '../../src/utils/allureResultFilter.js';

test('report tenant choices use each configured environment profile', () => {
  const settings: Record<string, string> = {
    VG_MDEV_TENANT_NUMBER: '34',
    VG_UAT_TENANT_NUMBER: '34',
    VG_T9998_MDEV_TENANT_NUMBER: '9998',
    VG_CA_TEST_TENANT_NUMBER: '9998',
    VG_CA_DEV_TENANT_NUMBER: '9998'
  };
  const profiles = allureFilterOptions(key => settings[key]);
  assert.deepEqual(profiles.filter(profile => profile.tenant === '34').map(profile => profile.environment), ['mdev', 'uat']);
  assert.deepEqual(profiles.filter(profile => profile.tenant === '9998').map(profile => profile.environment),
    ['ca-test', 'ca-dev', 'mdev-9998']);
  assert.equal(allureFilterOptions(() => undefined).every(profile => profile.tenant === undefined), true);
  assert.throws(() => allureFilterOptions(() => '../34'), /Invalid tenant number configured/);
});

test('validates report date filters strictly', () => {
  assert.equal(validateAllureDate('2026-10-22', '--from'), '2026-10-22');
  assert.throws(() => validateAllureDate('2026-02-30', '--to'), /valid date in YYYY-MM-DD/);
  assert.throws(() => validateAllureDate('22-10-2026', '--from'), /valid date in YYYY-MM-DD/);
});

test('matches Allure results by inclusive UTC date range and environment label', () => {
  const result = {
    start: Date.parse('2026-10-22T23:59:00.000Z'),
    labels: [{ name: 'environment', value: 'ca-dev' }]
  };
  assert.equal(matchesAllureResult(result, { fromDate: '2026-10-22', toDate: '2026-10-22' }), true);
  assert.equal(matchesAllureResult(result, { environment: 'CA-DEV' }), true);
  assert.equal(matchesAllureResult(result, { environment: 'dev' }), false);
  assert.equal(matchesAllureResult(result, { toDate: '2026-10-21' }), false);
  assert.equal(matchesAllureResult({}, { fromDate: '2026-10-22' }), false);
});

test('matches tenant labels exactly and combines tenant with other filters', () => {
  const result = {
    start: Date.parse('2026-10-22T10:00:00.000Z'),
    labels: [{ name: 'environment', value: 'mdev' }, { name: 'tenant', value: '34' }]
  };
  assert.equal(matchesAllureResult(result, { tenant: '34', environment: 'mdev', fromDate: '2026-10-22' }), true);
  assert.equal(matchesAllureResult(result, { tenant: '9998', environment: 'mdev' }), false);
  assert.equal(matchesAllureResult(result, { tenant: '034' }), false);
  assert.equal(matchesAllureResult(result, { tenant: '34', environment: 'uat' }), false);
  assert.equal(matchesAllureResult(result, { tenant: '34', toDate: '2026-10-21' }), false);
  assert.equal(matchesAllureResult({ labels: [{ name: 'environment', value: 'mdev' }] }, { tenant: '34' }), false);
  assert.equal(matchesAllureResult({ labels: [{ name: 'environment', value: 'mdev' }] }, {}), true);
});

test('copies only matching results, related containers, and their attachments', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'allure-filter-test-'));
  const source = path.join(directory, 'source');
  const output = path.join(directory, 'filtered');
  await mkdir(source);
  t.after(() => rm(directory, { recursive: true, force: true }));

  await writeFile(path.join(source, 'android-result.json'), JSON.stringify({
    uuid: 'android',
    start: Date.parse('2026-10-22T10:00:00.000Z'),
    labels: [{ name: 'environment', value: 'mdev' }, { name: 'tenant', value: '34' }],
    attachments: [{ name: 'Screenshot', source: 'android.png' }],
    steps: [{ steps: [{ attachments: [{ name: 'execution.log', source: 'execution.txt' }] }] }]
  }));
  await writeFile(path.join(source, 'ios-result.json'), JSON.stringify({
    uuid: 'ios',
    start: Date.parse('2026-10-22T10:00:00.000Z'),
    labels: [{ name: 'environment', value: 'mdev' }, { name: 'tenant', value: '9998' }],
    attachments: [{ name: 'Screenshot', source: 'ios.png' }]
  }));
  await writeFile(path.join(source, 'setup-container.json'), JSON.stringify({
    children: ['android', 'ios'],
    befores: [{ steps: [{ attachments: [{ name: 'Setup', source: 'setup.txt' }] }] }]
  }));
  await writeFile(path.join(source, 'android.png'), 'screenshot');
  await writeFile(path.join(source, 'ios.png'), 'other screenshot');
  await writeFile(path.join(source, 'setup.txt'), 'setup log');
  await writeFile(path.join(source, 'execution.txt'), 'execution log');

  const summary = await createFilteredAllureResults(source, output, {
    fromDate: '2026-10-22',
    toDate: '2026-10-22',
    environment: 'mdev',
    tenant: '34'
  });
  assert.deepEqual(summary, { matched: 1, total: 2 });
  assert.deepEqual((await readdir(output)).sort(), [
    'android-result.json',
    'android.png',
    'execution.txt',
    'setup-container.json',
    'setup.txt'
  ]);
  const container = JSON.parse(await readFile(path.join(output, 'setup-container.json'), 'utf8')) as { children: string[] };
  assert.deepEqual(container.children, ['android']);
});

test('rejects unsafe Allure attachment source paths', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'allure-filter-unsafe-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'one-result.json'), JSON.stringify({
    uuid: 'one',
    steps: [{ attachments: [{ name: 'log', source: '../outside.txt' }] }]
  }));
  await assert.rejects(createFilteredAllureResults(directory, path.join(directory, 'filtered'), {}),
    /invalid attachment path/);
});

test('fails clearly when no results match the selected filter', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'allure-filter-empty-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'one-result.json'), JSON.stringify({
    uuid: 'one',
    start: Date.parse('2026-10-21T10:00:00.000Z'),
    labels: [{ name: 'environment', value: 'mdev' }]
  }));
  await assert.rejects(
    createFilteredAllureResults(directory, path.join(directory, 'filtered'), { environment: 'ca-test' }),
    /No Allure test results match/
  );
});
