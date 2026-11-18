import { constants } from 'node:fs';
import { open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveScenario, scenarios, suites } from '../config/runner.js';

export const frameworkRoot = fileURLToPath(new URL('../../', import.meta.url));

const fixedFiles = [
  'README.md',
  'package.json',
  'tsconfig.json',
  'wdio.conf.ts',
  'scripts/run-mobile-tests.ts',
  'src/config/runner.ts',
  'src/config/mobileSessionInit.ts',
  'src/config/timeoutsHandling.ts',
  'src/config/userCreation.ts',
  'src/utils/Mobile Utils_Scrolll_Xpath_Timeout.ts',
  'src/utils/ExecutionReporter.ts',
  'tests/helpers/genericFlow.ts',
  'tests/helpers/user_helpers/TestUser.ts'
];

const sourceDirectories = [
  { directory: 'src/pages', pattern: /^[A-Za-z][A-Za-z0-9]*\.ts$/ },
  { directory: 'tests/smoke', pattern: /^[a-z0-9-]+\.spec\.ts$/ },
  { directory: 'tests/regression', pattern: /^[a-z0-9-]+\.spec\.ts$/ },
  { directory: 'elements', pattern: /^T\d+\.yml$/ }
];

export function listScenarios() {
  return Object.entries(scenarios).map(([id, definition]) => ({
    id,
    ...definition,
    file: `tests/${definition.file}`,
    suites: Object.entries(suites)
      .filter(([, files]) => files.some(file => file === `./tests/${definition.file}`))
      .map(([name]) => name)
  }));
}

export function frameworkOverview() {
  return {
    stack: ['TypeScript (strict ESM)', 'WebdriverIO 9', 'Mocha', 'Appium', 'LambdaTest/TestMu AI'],
    platforms: ['Android', 'iOS'],
    architecture: {
      entry: 'scripts/run-mobile-tests.ts',
      lifecycle: 'wdio.conf.ts',
      registry: 'src/config/runner.ts',
      pages: 'src/pages/',
      interactions: 'src/utils/Mobile Utils_Scrolll_Xpath_Timeout.ts',
      selectors: 'elements/T<TENANT_NUMBER>.yml via src/pages/mobileElements.ts',
      provisioning: 'tests/helpers/user_helpers/TestUser.ts (beforeSession, one fresh member per spec)',
      reporting: 'src/utils/ExecutionReporter.ts and Allure'
    },
    conventions: [
      'Use async Mocha specs in tests/smoke or tests/regression, with .js import extensions.',
      'Register scenarios and explicit pack membership in src/config/runner.ts.',
      'Reuse BaseScreen, MobileSession, genericFlow, and tenant-specific selectors and expected text.',
      'Verify provisioned accounts with assertTestAccountReady; do not provision again in a spec.',
      'Do not invent selectors, assertions, credentials, or business rules.'
    ],
    localValidation: [
      'npm run typecheck',
      'node --import tsx --test tests/helpers/framework-mcp.test.ts'
    ],
    safety: [
      'This MCP server only reads approved framework files and produces plans; it never runs commands.',
      'Credential files, environment values, runtime artifacts, and member data are not exposed.',
      'Cloud sessions, backend provisioning, and destructive journeys require explicit approval outside MCP.'
    ]
  };
}

export async function listFrameworkFiles(root = frameworkRoot): Promise<string[]> {
  const discovered = await Promise.all(sourceDirectories.map(async ({ directory, pattern }) => {
    const entries = await readdir(path.join(root, directory), { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && pattern.test(entry.name))
      .map(entry => `${directory}/${entry.name}`);
  }));
  return [...fixedFiles, ...discovered.flat()].sort();
}

export async function readFrameworkFile(
  file: string,
  startLine = 1,
  lineCount = 100,
  root = frameworkRoot
) {
  if (!Number.isInteger(startLine) || startLine < 1
    || !Number.isInteger(lineCount) || lineCount < 1 || lineCount > 200) {
    throw new RangeError('startLine must be positive and lineCount must be between 1 and 200.');
  }
  if (!(await listFrameworkFiles(root)).includes(file)) {
    throw new Error('File is not in the approved framework catalog. Use list_framework_files first.');
  }
  const canonicalRoot = await realpath(root);
  const requested = path.join(canonicalRoot, file);
  if (await realpath(requested) !== requested) {
    throw new Error('Symlinked framework files or directories are not allowed.');
  }
  const handle = await open(requested, constants.O_RDONLY | constants.O_NOFOLLOW);
  let text: string;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 256 * 1024) {
      throw new Error('Framework reads require a regular file no larger than 256 KiB.');
    }
    const buffer = Buffer.alloc(256 * 1024 + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 256 * 1024) {
      throw new Error('Framework file exceeded the 256 KiB read limit.');
    }
    text = buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (startLine > lines.length) throw new RangeError('startLine is beyond the end of the file.');
  const endLine = Math.min(startLine + lineCount - 1, lines.length);
  return {
    file,
    startLine,
    endLine,
    totalLines: lines.length,
    content: lines.slice(startLine - 1, endLine)
      .map((line, index) => `${startLine + index}: ${line}`).join('\n')
  };
}

export function planMobileRun(target: 'scenario' | 'suite', name: string, platform: 'Android' | 'iOS') {
  if (platform !== 'Android' && platform !== 'iOS') throw new Error('Unsupported mobile platform.');
  let scenario: keyof typeof scenarios;
  let files: string[];
  let args: string[] = [];
  if (target === 'scenario') {
    scenario = resolveScenario(name, platform);
    files = [`./tests/${scenarios[scenario].file}`];
  } else if (target === 'suite' && (name === 'smoke' || name === 'regression')) {
    files = [...suites[name]];
    const first = Object.entries(scenarios).find(([, definition]) =>
      files.includes(`./tests/${definition.file}`));
    if (!first) throw new Error('Suite has no registered scenarios.');
    scenario = resolveScenario(first[0], platform);
    args = ['--', '--suite', name];
  } else {
    throw new Error('Unsupported target or suite. Use a registered scenario, smoke, or regression.');
  }
  const selected = listScenarios().filter(entry => files.includes(`./${entry.file}`));
  const argv = [
    '--no-install', 'cross-env', `PLATFORM=${platform}`, `LT_SCENARIO=${scenario}`,
    'npm', 'test', ...args
  ];
  return {
    target,
    name,
    platform,
    files,
    executable: 'npx',
    argv,
    command: `npx ${argv.join(' ')}`,
    executed: false,
    requiresApproval: true,
    provisionsMember: selected.some(entry => entry.provisionMember),
    warnings: [
      'Executing this plan opens paid cloud sessions and provisions backend test accounts.',
      ...(selected.some(entry => entry.id === 'lockout') ? ['This selection includes an account-lockout journey.'] : []),
      'Interactive runs prompt for tenant, matching environment, platform, and app ID; confirm the planned platform.',
      'For non-interactive runs configure PLATFORM, VG_ENVIRONMENT, the profile tenant setting, and the uploaded app ID.'
    ],
    requiredSettings: [
      'LT_USERNAME', 'LT_ACCESS_KEY', 'APP_PASSWORD',
      platform === 'Android' ? 'LT_ANDROID_APP_ID (or appId / LT_APP_ID)' : 'LT_IOS_APP_ID (or appId / LT_APP_ID)',
      'VG_ENVIRONMENT and its profile-specific provisioning settings (see README.md)',
      ...(selected.some(entry => entry.id === 'lockout') ? ['INCORRECT_APP_PASSWORD'] : [])
    ]
  };
}
