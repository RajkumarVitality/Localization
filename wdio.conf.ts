import {
  appToUninstall,
  buildCapabilities,
  cloudEndpoint,
  appIdFor,
  deviceDefaults,
  logSharedAppIdWarning,
  requiredSetting,
  selectedPlatform,
  sessionDashboardUrl,
  setSessionNameFromSpecs,
  settingOr,
  setting,
  shouldOpenLiveSession
} from './src/config/mobileSessionInit.js';
import { executionReporter } from './src/utils/ExecutionReporter.js';
import { closeLiveSessionTab, openInDefaultBrowser } from './src/utils/browserLauncher.js';
import type { MobilePlatform } from './src/config/mobileSessionInit.js';
import { browser } from '@wdio/globals';
import { addAttachment, addLabel, addLink, addStep } from '@wdio/allure-reporter';
import { executionTimeouts } from './src/config/timeoutsHandling.js';
import { resolveScenario, scenarios, suites } from './src/config/runner.js';
import { initializeTestAccountsForSpecs, testAccounts } from './tests/helpers/user_helpers/TestUser.js';
import { configuredTenantNumber, mobileEnvironments, userCreationProfilePrefix, userCreationSetting } from './src/config/userCreation.js';
import { reportDynatraceSessions } from './src/utils/dynatraceSessions.js';
import { captureSessionDeviceDetails, sessionTimeLogLine, sessionDeviceDetails, sessionDeviceLogLines } from './src/utils/sessionDeviceDetails.js';
import { readLambdaTestSessionDeviceName } from './src/utils/lambdatestSession.js';
import { reportFailureAnalysis } from './src/utils/failureAnalysis.js';

const platform: MobilePlatform = selectedPlatform();
const scenario = resolveScenario(settingOr('LT_SCENARIO', 'loginAndLogout'), platform);
const endpoint = cloudEndpoint();
const testScenario = scenarios[scenario];
const timeouts = executionTimeouts();
let liveSessionUrl: string | undefined;
let sessionStartTime: Date;
let sessionCreatedAt: Date;

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: [`./tests/${testScenario.file}`],
  suites,
  maxInstances: 1,
  capabilities: [buildCapabilities(platform, scenario, testScenario.name)],
  hostname: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
  protocol: endpoint.protocol === 'https:' ? 'https' : 'http',
  path: endpoint.pathname,
  framework: 'mocha',
  reporters: [
    'spec',
    ['allure', {
      outputDir: 'target/allure-results',
      disableWebdriverStepsReporting: true,
      disableWebdriverScreenshotsReporting: true
    }]
  ],
  logLevel: 'info',
  waitforTimeout: timeouts.element,
  connectionRetryTimeout: 180_000,
  connectionRetryCount: 2,
  mochaOpts: {
    ui: 'bdd',
    timeout: timeouts.test,
    retries: 0
  },
  async beforeSession(_config, capabilities, specs) {
    try {
      setSessionNameFromSpecs(capabilities, specs);
      await initializeTestAccountsForSpecs(specs);
      sessionStartTime = new Date();
    } catch (error) {
      console.error('[UserProvisioning] Pre-session setup failed; stopping worker without opening a mobile session.', error);
      // WebdriverIO logs and swallows hook errors; terminate only this worker.
      process.exit(1);
    }
  },
  async before() {
    sessionCreatedAt = new Date();
    console.log(`[MobileSession] ${sessionTimeLogLine(sessionCreatedAt, 'Create')}`);
    console.log(`[MobileSession] App ID: ${appIdFor(platform, scenario)}`);
    let sessionApiDeviceName: string | undefined;
    try {
      sessionApiDeviceName = await readLambdaTestSessionDeviceName(
        browser.sessionId,
        requiredSetting('LT_USERNAME', 'UserName'),
        requiredSetting('LT_ACCESS_KEY', 'AccessKey')
      );
    } catch (error) {
      console.warn(
        `[MobileSession] LambdaTest device-name lookup failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const details = captureSessionDeviceDetails(
      browser.sessionId, browser.capabilities, sessionApiDeviceName
    );
    for (const line of sessionDeviceLogLines(details)) console.log(`[MobileSession] ${line}`);
  },
  async beforeTest(test) {
    addLabel('environment', (userCreationSetting('VG_ENVIRONMENT') ?? 'mdev').toLowerCase());
    addLabel('tenant', configuredTenantNumber());
    executionReporter.startTest(test.parent, test.title, { addAttachment, addStep });
    executionReporter.log('Starting test execution.');
    executionReporter.log(sessionTimeLogLine(sessionCreatedAt, 'Create'));
    executionReporter.log(`App ID: ${appIdFor(platform, scenario)}`);
    if (!sessionDeviceDetails) throw new Error('Session device details were not captured after session initialization.');
    for (const line of sessionDeviceLogLines(sessionDeviceDetails)) executionReporter.log(line);
    const accountDetails = testAccounts.details;
    await executionReporter.captureTextArtifact('provisioned-test-user', [
      `Party ID: ${accountDetails.partyId}`,
      `Insurer code: ${accountDetails.insurerCode}`,
      `Date of birth: ${accountDetails.dateOfBirth}`,
      `Member username: ${accountDetails.memberUsername}`
    ].join('\n'));
    for (const [name, value] of Object.entries(sessionDeviceDetails)) {
      if (value) await addLabel(name, value);
    }
    await executionReporter.captureTextArtifact('session-device-details', JSON.stringify(sessionDeviceDetails, null, 2));
    executionReporter.log(`Mobile session initiation started: ${sessionStartTime.toISOString()}`);
    executionReporter.log(`Timeouts: element=${timeouts.element} ms, test=${timeouts.test} ms.`);
    const dashboardUrl = sessionDashboardUrl(browser.sessionId);
    executionReporter.log(`LambdaTest session ID: ${browser.sessionId}`);
    executionReporter.log(`LambdaTest live/recorded session: ${dashboardUrl}`);
    if (shouldOpenLiveSession()) {
      executionReporter.log('Opening the live session in the default browser (set LT_OPEN_LIVE_SESSION=false to disable).');
      openInDefaultBrowser(dashboardUrl, message => executionReporter.log(message));
      liveSessionUrl = dashboardUrl;
    }
    logSharedAppIdWarning(platform);
    const device = deviceDefaults(platform, scenario);
    await browser.pause(scenario === 'loginAndLogout' && platform === 'Android' ? 7_000 : 4_000);
    await executionReporter.captureTextArtifact(
      'session-config',
      `platform=${platform}\ndevice=${device.device}\nversion=${device.version}\nappId=${appIdFor(platform, scenario)}\nsessionId=${browser.sessionId}\ndashboardUrl=${dashboardUrl}\n`
    );
    await executionReporter.captureScreenshot('app-loaded');
  },
  afterTest: async (_test, _context, result) => {
    const testEndTime = new Date();
    if (result.error) {
      executionReporter.log(`Test failed: ${result.error.message}`);
      await executionReporter.captureScreenshot('listener-failure');
      await executionReporter.capturePageSource('listener-failure');
      await reportFailureAnalysis(
        result.error.stack ?? result.error.message,
        {
          platform,
          device: sessionDeviceDetails?.deviceName,
          osVersion: sessionDeviceDetails?.osVersion,
          appVersion: sessionDeviceDetails?.appVersion
        },
        executionReporter,
        addLabel,
        [
          'LT_USERNAME', 'LT_ACCESS_KEY', 'UserName', 'AccessKey',
          'APP_PASSWORD', 'APP_USERNAME', 'INCORRECT_APP_PASSWORD', 'APP_INCORRECT_PASSWORD'
        ].map(key => setting(key) ?? '').concat(
          mobileEnvironments.flatMap(profile => ['API_BEARER_TOKEN', 'API_BASIC_AUTH'].flatMap(suffix => {
            const value = userCreationSetting(`${userCreationProfilePrefix(profile)}${suffix}`) ?? '';
            return [value, value.replace(/^(Basic|Bearer)\s+/i, '')];
          }))
        )
      );
    } else {
      await executionReporter.captureScreenshot('test-passed');
      executionReporter.log('Test passed.');
    }
    try {
      if (!sessionDeviceDetails?.osVersion) {
        executionReporter.log('Dynatrace OS-version filter unavailable: device OS version was not returned by the session.');
      }
      if (!sessionDeviceDetails?.deviceName) {
        executionReporter.log('Dynatrace Device filter unavailable: session device name was not resolved.');
      }
      await reportDynatraceSessions(executionReporter, addLink, sessionCreatedAt, testEndTime, platform,
        process.env.DYNATRACE_ENABLED === 'true' ? process.env.DYNATRACE_ACCESS_TOKEN ?? '' : undefined,
        sessionDeviceDetails?.osVersion, sessionDeviceDetails?.deviceName, configuredTenantNumber());
    } catch (error) {
      executionReporter.log(`Dynatrace session reporting failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    executionReporter.log('Execution session summary:');
    executionReporter.log(sessionTimeLogLine(sessionCreatedAt, 'Create'));
    executionReporter.log(sessionTimeLogLine(testEndTime, 'End'));
    executionReporter.log(`App ID: ${appIdFor(platform, scenario)}`);
    if (sessionDeviceDetails) {
      executionReporter.log(`LambdaTest session ID: ${sessionDeviceDetails.sessionId}`);
      for (const line of sessionDeviceLogLines(sessionDeviceDetails)) executionReporter.log(line);
    } else {
      executionReporter.log('Session device details unavailable: not captured after session initialization.');
    }
    await executionReporter.finishTest(result.error ? 'FAILED' : 'PASSED');
  },
  async after() {
    const appId = appToUninstall(platform);
    if (appId) {
      await browser.execute('mobile: removeApp', { appId });
    }
    if (liveSessionUrl) {
      executionReporter.log('Mobile execution complete; closing the live session browser tab/window (best effort).');
      await closeLiveSessionTab(liveSessionUrl, message => executionReporter.log(message));
    }
  },
  onComplete() {
    console.log(`[MobileTestRunner] Finished scenario: ${scenario} (${platform}).`);
  }
};
