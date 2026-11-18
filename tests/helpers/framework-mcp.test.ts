import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { scenarios, suites } from '../../src/config/runner.js';
import {
  frameworkOverview,
  frameworkRoot,
  listFrameworkFiles,
  listScenarios,
  planMobileRun,
  readFrameworkFile
} from '../../src/mcp/framework.js';
import { createFrameworkServer } from '../../src/mcp/server.js';

test('discovery reflects every registered scenario and exact suite membership', async () => {
  const entries = listScenarios();
  assert.equal(entries.length, Object.keys(scenarios).length);
  for (const [id, definition] of Object.entries(scenarios)) {
    const entry = entries.find(value => value.id === id);
    assert.ok(entry);
    assert.equal(entry.file, `tests/${definition.file}`);
    assert.equal(entry.provisionMember, definition.provisionMember);
    assert.deepEqual(entry.suites, Object.entries(suites)
      .filter(([, files]) => files.some(file => file === `./tests/${definition.file}`))
      .map(([name]) => name));
  }
  const files = await listFrameworkFiles();
  for (const file of files) assert.ok((await stat(path.join(frameworkRoot, file))).isFile(), file);
  for (const entry of entries) assert.ok(files.includes(entry.file));
  assert.ok(files.includes('elements/T34.yml'));
  assert.ok(files.includes('src/pages/LoginScreen.ts'));
  assert.ok(!files.some(file => /(?:\.properties|target\/|fixtures\/|node_modules\/)/.test(file)));
  assert.ok(frameworkOverview().safety.some(rule => rule.includes('never runs commands')));
});

test('source reads paginate with line numbers and reject non-catalog paths', async () => {
  const page = await readFrameworkFile('src/pages/LoginScreen.ts', 2, 3);
  assert.equal(page.startLine, 2);
  assert.equal(page.endLine, 4);
  assert.equal(page.content.split('\n').length, 3);
  assert.match(page.content, /^2: /);
  const tail = await readFrameworkFile('src/pages/LoginScreen.ts', page.totalLines, 200);
  assert.equal(tail.endLine, page.totalLines);
  for (const file of [
    '../package.json', './package.json', '/etc/passwd', 'src/../package.json',
    'lambdatest.properties', 'user-creation.properties', '.env',
    'target/allure-results/member.json', 'tests/fixtures/T34/mha-high-risk-assessment.json',
    'src/pages/../../lambdatest.properties'
  ]) {
    await assert.rejects(readFrameworkFile(file), /approved framework catalog/);
  }
  await assert.rejects(readFrameworkFile('package.json', 0), /startLine/);
  await assert.rejects(readFrameworkFile('package.json', 1, 201), /lineCount/);
  await assert.rejects(readFrameworkFile('package.json', 1.5), /startLine/);
  await assert.rejects(readFrameworkFile('package.json', 100_000), /beyond the end/);
});

test('approved paths cannot expose symlink targets or oversized files', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'framework-mcp-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['src/pages', 'tests/smoke', 'tests/regression', 'elements']) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  await writeFile(path.join(root, 'private.txt'), 'must not be returned');
  await symlink(path.join(root, 'private.txt'), path.join(root, 'package.json'));
  await assert.rejects(readFrameworkFile('package.json', 1, 100, root), /Symlinked/);
  await symlink(path.join(root, 'private.txt'), path.join(root, 'src/pages/Private.ts'));
  assert.ok(!(await listFrameworkFiles(root)).includes('src/pages/Private.ts'));
  await writeFile(path.join(root, 'README.md'), 'x'.repeat(256 * 1024 + 1));
  await assert.rejects(readFrameworkFile('README.md', 1, 100, root), /256 KiB/);
  await rm(path.join(root, 'src/pages'), { recursive: true });
  await symlink(path.join(frameworkRoot, 'src/pages'), path.join(root, 'src/pages'));
  await assert.rejects(readFrameworkFile('src/pages/LoginScreen.ts', 1, 100, root), /Symlinked/);
});

test('plans every scenario and suite without changing the environment or executing', () => {
  const originalEnvironment = { ...process.env };
  for (const platform of ['Android', 'iOS'] as const) {
    for (const [name, definition] of Object.entries(scenarios)) {
      const plan = planMobileRun('scenario', name, platform);
      assert.deepEqual(plan.files, [`./tests/${definition.file}`]);
      assert.ok(plan.argv.includes(`LT_SCENARIO=${name}`));
      assert.ok(plan.argv.includes(`PLATFORM=${platform}`));
      assert.equal(plan.executed, false);
      assert.equal(plan.requiresApproval, true);
      assert.equal(plan.provisionsMember, definition.provisionMember);
      assert.equal(plan.warnings.some(warning => warning.includes('lockout')), name === 'lockout');
      assert.equal(plan.requiredSettings.includes('INCORRECT_APP_PASSWORD'), name === 'lockout');
    }
    for (const name of ['smoke', 'regression'] as const) {
      const plan = planMobileRun('suite', name, platform);
      assert.deepEqual(plan.files, suites[name]);
      assert.deepEqual(plan.argv.slice(-3), ['--', '--suite', name]);
      assert.equal(plan.executed, false);
      assert.equal(plan.requiresApproval, true);
      assert.equal(plan.warnings.some(warning => warning.includes('lockout')), name === 'regression');
    }
  }
  assert.ok(
    Object.keys(process.env).length === Object.keys(originalEnvironment).length
    && Object.entries(originalEnvironment).every(([key, value]) => process.env[key] === value),
    'Run planning must not change environment variables.'
  );
  for (const name of ['unknown', '__proto__', 'toString', 'loginAndLogout; echo unsafe']) {
    assert.throws(() => planMobileRun('scenario', name, 'Android'), /Unsupported LT_SCENARIO/);
    assert.throws(() => planMobileRun('suite', name, 'iOS'), /Unsupported target or suite/);
  }
});

test('MCP protocol advertises only read-only tools and returns explicit tool errors', async t => {
  const server = createFrameworkServer();
  const client = new Client({ name: 'framework-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [
    'framework_overview', 'list_framework_files', 'list_scenarios',
    'plan_mobile_run', 'read_framework_file'
  ]);
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.equal(tool.annotations?.openWorldHint, false);
  }
  for (const [name, args] of [
    ['framework_overview', {}],
    ['list_framework_files', {}],
    ['list_scenarios', {}],
    ['read_framework_file', { file: 'src/config/runner.ts', startLine: 1, lineCount: 5 }],
    ['plan_mobile_run', { target: 'scenario', name: 'loginAndLogout', platform: 'Android' }]
  ] as const) {
    const response = await client.callTool({ name, arguments: args });
    assert.notEqual(response.isError, true, name);
    assert.ok(response.content);
  }
  for (const args of [
    { file: 'lambdatest.properties' },
    { file: 'package.json', lineCount: 201 },
    { file: 'package.json', startLine: -1 }
  ]) {
    const response = await client.callTool({ name: 'read_framework_file', arguments: args });
    assert.equal(response.isError, true);
  }
  for (const args of [
    { target: 'scenario', name: 'unknown', platform: 'Android' },
    { target: 'suite', name: 'smoke', platform: 'Windows' },
    { target: 'shell', name: 'echo unsafe', platform: 'Android' }
  ]) {
    const response = await client.callTool({ name: 'plan_mobile_run', arguments: args });
    assert.equal(response.isError, true);
  }
});

test('stdio entry point initializes and responds from a real MCP client', { timeout: 20_000 }, async t => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', path.join(frameworkRoot, 'src/mcp/server.ts')],
    cwd: frameworkRoot,
    stderr: 'pipe'
  });
  let diagnostics = '';
  transport.stderr?.on('data', chunk => { diagnostics += String(chunk); });
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const response = await client.callTool({ name: 'list_scenarios', arguments: {} });
  assert.notEqual(response.isError, true, diagnostics);
  assert.match(JSON.stringify(response), /loginAndLogout/);
  assert.match(JSON.stringify(response), /regression\/incorrect-password-lockout\.spec\.ts/);
  assert.ok(transport.pid);
  assert.deepEqual(client.getServerVersion(), { name: 'mobile-framework', version: '1.0.0' });
  assert.equal(diagnostics, '');
});
