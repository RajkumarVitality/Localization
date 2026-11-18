# Appium Mobile Tests with TypeScript

This project runs Android and iOS mobile UI tests with TypeScript, WebdriverIO,
Mocha, and the TestMu AI (formerly LambdaTest) real-device cloud.

For the implementation architecture, mobile-session lifecycle, configuration
resolution, capabilities, and reporting design, see the
[technical documentation](./docs/technical-documentation.md).

## LambdaTest script generator agent

The workspace custom agent is defined in
[`lambdatest-script-generator.agent.md`](./.github/agents/lambdatest-script-generator.agent.md).
In VS Code Copilot Chat, select **LambdaTest Script Generator** from the agent
dropdown. If it is not listed, open **Chat: Configure Custom Agents** from the
Command Palette and check that workspace agents are enabled for your harness.
You need a VS Code/Copilot setup that supports custom agents.

Example prompt:

```text
Create a regression test for logging out and logging back in on Android and iOS.
Provision a fresh member using the existing helper, reuse the page objects,
assert the home greeting after the second login, and register the test in the
regression pack. Run local validation only; do not start a LambdaTest session.
```

Provide the journey, expected results, target platform, and pack. For new screens,
provide confirmed selectors or sanitized Appium page source. The agent reuses
existing helpers, adds spec/runner wiring and documentation, and reports local
validation separately from live execution. It requires approval before cloud
sessions or backend provisioning. No API key or extra dependency is needed to
add the agent; generated live tests still need the credentials described below.
This is a Copilot custom agent, not a standalone generator CLI or LambdaTest MCP
server.

### Official LambdaTest Appium skill

The generator also uses the official
[`appium-skill`](./.github/skills/appium-skill/SKILL.md) from
[LambdaTest/agent-skills](https://github.com/LambdaTest/agent-skills).
Its JavaScript/WebdriverIO, cloud, iOS, and hybrid-app references are included.
The [upstream revision](./.github/skills/appium-skill/UPSTREAM.md) and
[MIT license](./.github/skills/appium-skill/LICENSE) are retained.

For VS Code Copilot, the skill is installed under `.github/skills/`, not
`.cursor/skills/` (the Cursor-specific location). No duplicate installation is
needed. Open **Chat: Open Customizations** or the skills menu to confirm it is
discovered; discovery depends on the selected harness and VS Code version.
The generator agent explicitly references it while preserving this project's
TypeScript/Mocha conventions and cloud-execution approval requirements.

This installs reusable AI instructions, not a LambdaTest API/MCP connection
or a Copilot SDK generator service. It does not upload apps, provision members,
or launch paid device sessions.

## Local AI failure analysis

An opt-in Ollama analyzer categorizes failed tests and attaches **AI Failure
Analysis** to Allure without changing their original status. It uses sanitized
error text, recent framework logs, and available device metadata, not screenshots
or page dumps. See the [failure-analysis guide](./docs/failure-analysis.md)
for local model setup, settings, categories, limitations, and the read-only
**Appium Failure Analysis** Copilot agent.

## Mobile framework MCP server and agent

For architecture, tool contracts, client setup, troubleshooting, and PoC
limitations, see the [MCP agent technical documentation](./docs/mcp-agent-technical-documentation.md).

The local **mobile-framework** MCP server exposes five read-only tools:
`framework_overview`, `list_scenarios`, `list_framework_files`,
`read_framework_file`, and `plan_mobile_run`. It explains the architecture,
discovers registered scenarios and pack membership, reads approved source and
tenant selector files with line numbers, and produces run commands and warnings.
It does not generate code itself: the Copilot agent uses this context to edit
the framework with the editor's tools.

After installing dependencies, in VS Code:

1. Run **MCP: List Servers**, select **mobile-framework**, and start/trust the
   workspace server configured in [`.vscode/mcp.json`](./.vscode/mcp.json).
2. Select **Mobile Framework MCP Agent** in Copilot Chat. Its definition is in
   [`.github/agents/mobile-framework-mcp.agent.md`](./.github/agents/mobile-framework-mcp.agent.md).
3. Ask: "Explain the framework, then create a regression test for logging out
   and back in on Android. Reuse existing selectors and provisioned accounts.
   Run local validation only; do not launch LambdaTest."

This requires a VS Code/Copilot version supporting workspace MCP servers and
custom agents. For JetBrains or another MCP client, configure a stdio server with command
`node`, arguments `--import`, `tsx`, `src/mcp/server.ts`, and working directory
set to this repository's absolute path. No MCP API key or HTTP port is needed.
`npm run --silent mcp:start` also starts the stdio server; it waits for an MCP
client, not interactive commands. Standard output is reserved for MCP messages.

The server does not load credential settings, return environment values, read
local credential files, member fixtures or reports, write files, execute shell
commands, provision accounts, or contact the cloud. Source reads use an explicit
catalog, reject symlinks, and are limited to 200 lines per request and 256 KiB
per file. Approved source is visible to the connected AI client; never put
secrets in source files or connect an untrusted client.

`plan_mobile_run` accepts `target` (`scenario` or `suite`), a registered `name`,
and `platform` (`Android` or `iOS`). For example:

```json
{"target":"suite","name":"smoke","platform":"Android"}
```

Plans are not executed. The agent must obtain explicit approval before running
cloud sessions or provisioning/backend writes through its execution tools.
Interactive commands still prompt for tenant, environment, platform, and app ID;
non-interactive runs need the settings documented below.
Restart the MCP server after changing the scenario registry so discovery and
plans use the updated imports. If the server is unavailable, the agent reports
that and can inspect the repository directly.

Use `npm run test:mcp` for local protocol, discovery, file-access, and run-plan
checks; these do not open devices or provision members.

## Prerequisites

- Node.js 20 or later and npm
- A TestMu AI account with a username and access key
- Appium-uploaded Android and/or iOS application IDs

Install dependencies:

```bash
npm install
```

## Configure credentials

Set the following environment variables or copy
[`lambdatest.properties.example`](./lambdatest.properties.example) to
`lambdatest.properties` and fill in the values. Local credentials files are
ignored by Git.

Required settings:

- `LT_USERNAME` and `LT_ACCESS_KEY` (legacy aliases `UserName` and `AccessKey`
  are also accepted)
- An App ID: set `appId` (direct override), `LT_ANDROID_APP_ID` /
  `LT_IOS_APP_ID` (platform-specific), or `LT_APP_ID` (shared fallback). There
  is no built-in default — the run fails fast with a clear error if none of
  these are set. Note that the Android app ID used to differ by scenario
  (login/ios-login/screening/mha used one app, lockout used another); you are
  now responsible for setting the correct one per run.
- `APP_PASSWORD` for registration and login of generated login/logout, MHA,
  lockout, and screening users. `APP_USERNAME` is not required for these scenarios.
- `INCORRECT_APP_PASSWORD` for the account-lockout test
  (`APP_INCORRECT_PASSWORD` is also accepted as a legacy alias).
  It must differ from `APP_PASSWORD`. The test provisions and locks a fresh
  account; `LOCKOUT_USERNAME` is not required.

In `lambdatest.properties`, `LT_USERNAME`, `LT_ACCESS_KEY` (including legacy
aliases `UserName` and `AccessKey`) and `APP_PASSWORD` may use
`base64:<encoded-value>`; the runner decodes these values when loading the
file. Environment-variable values remain unchanged. Base64 is reversible
encoding, not encryption, and does not protect credentials from anyone who
can read the properties file. Prefer environment variables or a secret manager
when secure storage is required.

For example, these dummy values decode to `user`, `ltkey` and `password`:

```properties
LT_USERNAME=base64:dXNlcg==
LT_ACCESS_KEY=base64:bHRrZXk=
APP_PASSWORD=base64:cGFzc3dvcmQ=
```

Encode each value as UTF-8 using standard Base64 with padding and no line
breaks. Keep the `base64:` prefix so plain-text values remain supported.
For example, `printf '%s' 'dummy-value' | base64` encodes a dummy value
without adding a newline to the input. Avoid entering real credentials in
shell commands that may be saved in history.

The mental-health assessment journeys, login/logout and lockout scenarios provision a new
member account in the worker's WebdriverIO `beforeSession` hook, before opening
the cloud mobile session. Each spec receives a fresh account. Setup performs
party creation, enrolment, registration, status calculation, login-event
capture, event processing and onboarding-instruction deletion. Reward-event
creation (`processEventToCreateReward`) is currently commented out in the
automated provisioning flow because tenant 34 rejects the request. Setup failures
are logged with the original configuration or API error and terminate that
worker with exit code 1 before any real mobile session is opened; there is no
fallback to a fixed account. This explicit worker exit is necessary because
WebdriverIO otherwise logs ordinary `beforeSession` errors and continues.
Each provisioning API step logs its environment, step name, POST endpoint with
the selected profile's configured `TENANT_NUMBER`,
`START`, and `SUCCESS` or `FAILED`, with elapsed time. Responses returned by API
helpers also show the HTTP status; failures retain the original API or network
error. Logs include the configured `ZUUL_URL` for party creation, status calculation
and instruction lookup, or `INTEGRATION_PLATFORM_BASE_URL` for other steps.
Endpoint templates omit member IDs, and these step logs do not include
credentials or request bodies. A failed step stops subsequent provisioning steps.
HTTP failures also include bounded, sanitized JSON error diagnostics from the
server (such as error codes and messages). Credentials and member identifiers
are redacted; non-JSON, oversized and non-diagnostic response fields are omitted.
Failure-body reads are limited to 16 KiB and five seconds, and logged details to
2,048 characters. These diagnostics do not retry failed provisioning writes.
Mocha suite hooks only verify that the account is ready, without provisioning again.
The screening scenario also provisions a fresh member before opening a mobile session.
`testAccounts.member` exposes the selected profile's `LOGIN_PREFIX` plus the generated
email only after setup succeeds. API requests use the unprefixed email.
The Allure report includes a `provisioned-test-user` attachment with the generated
member username, Party ID, insurer code, and date of birth for each test.
The password is always read from `APP_PASSWORD`, never stored in the fixture.
Configure the profile's `API_BEARER_TOKEN`, `API_BASIC_AUTH`, `LOGIN_PREFIX`,
`ZUUL_URL`, `TENANT_NUMBER`, `INTEGRATION_PLATFORM_BASE_URL`, `EMAIL_DOMAIN`
and shared `configUserAgent` in user-creation settings before these runs.

The read-only `getUserInstruction` lookup (sent as a POST by the backend API)
has a 30-second timeout per attempt and up to three attempts, with 500 ms and
1,000 ms backoff. Only transient network errors, timeouts and HTTP 502/503/504
are retried; authentication, TLS and invalid-response errors fail immediately.
Retry warnings and final errors identify the endpoint and network error code
without logging credentials or the request body, and retain the original cause.
For persistent failures, check backend availability and the runner's VPN, DNS,
proxy and TLS configuration. The lookup runs from the Node.js worker, not from
the cloud device. Account creation and other provisioning writes are not retried
automatically, to avoid duplicate side effects.

`captureLoginEvents` also has a 30-second request timeout. Failures identify the
selected integration-platform setting, server origin and network error code,
preserving the original cause without logging tokens, payloads or member IDs.
This write is never automatically retried: after a connection failure, check
backend logs to determine whether it was applied before replaying the request.

Environment variables take precedence over `lambdatest.properties` in the
project root or `src/test/resources/`. Use environment variables instead of
Java's former `-DKEY=value` system properties.

Optional settings:

- `LT_GRID_URL` (defaults to `mobile-hub.lambdatest.com`)
- `platform` / `PLATFORM`, `device` / `LT_DEVICE`, and `version` / `LT_VERSION`
- `LT_BUILD_NAME`, `LT_TEST_NAME`, and `LT_PROJECT_NAME`
  Cloud session names are assigned from each worker's spec filename before
  the session starts (for example, `login-logout` or `mha-high-risk`).
  If `LT_TEST_NAME` is set, it is used as a prefix followed by the spec name,
  so parallel pack sessions remain distinguishable. Build names are unchanged.
- `LT_ARTIFACTS_DIR` (defaults to `target/test-artifacts`)
- `LT_WAIT_SECONDS` (defaults to `300`)
- `LT_TEST_TIMEOUT_SECONDS` controls the whole test independently of element
  waits. Every scenario defaults to `900` seconds (15 minutes), regardless of
  platform. It must exceed `LT_WAIT_SECONDS`.
- `LT_OPEN_LIVE_SESSION` (defaults to `true`): as soon as a mobile session
  starts, its LambdaTest App Automation dashboard page (live device view +
  Appium logs) is opened automatically in your default browser. Set this to
  `false` to disable auto-opening; it's also skipped automatically when a `CI`
  environment variable is set. The session ID and dashboard URL are always
  logged to the console and to `execution.log` regardless of this setting.

## Run the scenarios

Missing required elements abort the current test when the configured
existence/visibility wait expires, without another lookup attempt. Exhausting
the configured scroll limit also aborts without repeating the scroll sequence.
Optional visibility checks can still return false. Other operation failures
(such as stale-element clicks or text assertions) retain their existing single
retry; only the failed operation is repeated, not the entire test case.
Failure evidence, reporting, and session cleanup still run after the test
body aborts. Other scenarios in the pack are not cancelled.

Interactive test commands first ask for `TENANT_NUMBER` for user creation, then
a matching environment, then the platform (`1. Android`, `2. iOS`),
then the uploaded AppId (`lt://...`)
before starting. AppId must be entered; blank input prompts again. The entered
AppId overrides app settings from `lambdatest.properties` for the whole run.
Tenant input is required and matched against each profile's `TENANT_NUMBER`
in `user-creation.properties` (environment-variable overrides still apply).
Only matching profiles are offered; a single match is selected automatically.
For example, if MDEV and UAT both configure tenant `34`, entering `34` offers
`1. MDEV  2. UAT`. Configure `VG_T9998_MDEV_TENANT_NUMBER=9998` and the
other `VG_T9998_MDEV_` settings to offer a separate MDEV profile for tenant
`9998`. Unknown tenants prompt again instead of overriding a profile.
Press Enter at the platform or environment prompt to use the shown default.
The selection applies to all provisioning workers without modifying the properties file.
Mobile element locators and expected text are loaded from `elements/T<TENANT_NUMBER>.yml`
for the selected profile, so tenant `9998` uses `T9998.yml` and tenant `34` uses `T34.yml`.
In non-interactive CI runs, prompts are skipped; set `PLATFORM`,
`VG_ENVIRONMENT`, and the profile-specific tenant variable (for example,
`VG_MDEV_TENANT_NUMBER`) in the environment instead.
Selecting tenant 34 adds `language: nl` and `locale: nl` inside `LT:Options`
for Android and iOS. Other tenants do not receive these options.
For non-interactive runs, supply `appId=lt://APP_ID` in the environment to
override app settings from `lambdatest.properties`.

### Smoke and regression packs

```bash
npm run test:smoke
npm run test:regression
VG_ENVIRONMENT=mdev PLATFORM=iOS npm run test:smoke
PLATFORM=iOS npm run test:smoke
PLATFORM=iOS npm run test:regression
```

| Pack | Specs |
| --- | --- |
| Smoke | `login-logout.spec.ts`, `mha-high-risk.spec.ts` |
| Regression | `incorrect-password-lockout.spec.ts`, `mha-low-risk.spec.ts` |

These named WebdriverIO suites run only the listed specs, with a separate,
freshly reset mobile session and a newly provisioned member for each spec.
Smoke runs with up to five workers (`maxInstances: 5`); regression remains
sequential (`maxInstances: 1`). The smoke pack currently has two specs, so it
can open up to two sessions concurrently. Pass `--maxInstances <count>` after
`npm run test:smoke --` to override the smoke worker limit. They use the existing cloud,
platform, app, and user-creation settings; no credentials are stored in the
suite definitions. Regression also requires `INCORRECT_APP_PASSWORD`.
Specs are resolved from `tests/smoke/` and `tests/regression/`; the scenario
registry stores paths relative to `tests/`, not the former `tests/testScenarios/`.
Direct runner selection is supported with
`npm test -- --suite smoke` or `npm test -- --suite regression`; leave
`LT_SCENARIO` unset or use a valid scenario from `src/config/runner.ts`.

MHA question screens use native iOS accessibility-ID and predicate selectors to
avoid XPath hierarchy evaluation during each question/answer/button lookup.
Android selectors and visibility waits remain unchanged. Device/cloud command
latency still affects execution time; this does not disable animation or readiness checks.
After the final assessment answer, the flow clicks Submit once without first
waiting for a question Next button. Intermediate question and section navigation
is preserved. Assessment inputs are loaded from `tests/fixtures/T<TENANT_NUMBER>/`:
tenant `34` uses `T34`, while tenant `9998` uses `T9998`. The high- and low-risk
journeys use `mha-high-risk-assessment.json` and `mha-low-risk-assessment.json`
respectively; the negative tests also use the selected tenant's low-risk fixture.
Missing tenant fixtures fail rather than falling back to another tenant.

### MHA negative tests

The opt-in `mha-unanswered` scenario provisions a fresh member and verifies
that Next is disabled on the first required question without selecting an
answer. It preserves the existing navigation selectors and is not included
in the default smoke or regression packs.

```bash
LT_SCENARIO=mha-unanswered PLATFORM=Android npm test
LT_SCENARIO=mha-unanswered PLATFORM=iOS npm test
```

The opt-in `mha-exit-partial` scenario answers the first question, closes the
assessment, verifies the exit confirmation, selects Yes and checks that the MHA
landing screen displays Start with zero points. It does not yet verify reopening
or saved answers.

```bash
LT_SCENARIO=mha-exit-partial PLATFORM=Android npm test
LT_SCENARIO=mha-exit-partial PLATFORM=iOS npm test
```

Incomplete submission, exit/resume, offline submission, duplicate submission,
answer revision and session expiry are not yet automated. Their expected
behavior, controls and backend verification or fault-injection mechanisms
must be confirmed before adding executable specs.

### User-creation environments

User provisioning reads its settings from `user-creation.properties`, separately
from the mobile/cloud settings in `lambdatest.properties`. Copy
[`user-creation.properties.example`](./user-creation.properties.example) to
`user-creation.properties` and fill in the selected profile. The local file is
ignored by Git; never commit API credentials.

Set `VG_ENVIRONMENT` to `mdev`, `mdev-9998`, `ca-test`, `ca-dev`, or `uat`
(default: `mdev`). The corresponding prefixes are `VG_MDEV_`, `VG_T9998_MDEV_`,
`VG_CA_TEST_`, `VG_CA_DEV_`, and `VG_UAT_`. The `mdev-9998` profile has its own
settings and does not fall back to `VG_MDEV_` provisioning values.
Each profile requires `TENANT_NUMBER`, `ZUUL_URL`,
`INTEGRATION_PLATFORM_BASE_URL`, `VITALITY_PRODUCT_KEY`,
`MEMBERSHIP_REFERENCE_KEYS` (comma-separated), `EMAIL_DOMAIN`, and
`API_BASIC_AUTH` (base64 credentials, optionally prefixed with `Basic`).
Enrolment uses the selected profile's `VITALITY_PRODUCT_KEY` for
`product.identifierTypeKey`; there is no hardcoded product-key default.
Product keys accept `VITALITYACTIVEV1`, `SLI_VITALITY`, or numeric values.
Membership reference keys accept `POLICY_NUMBER`,
`PARTNER_CONTRACT_NUMBER`, or numeric values.

Runtime environment variables override this separate file:

```bash
VG_ENVIRONMENT=ca-test PLATFORM=Android npm run test:mha-high-risk
```

Provisioning settings previously stored in `lambdatest.properties` must be moved
to the new file. These settings only apply when a test calls
`resolveTestUserCredentials()`; fixed-account tests are unchanged.

```bash
PLATFORM=Android npm run test:login
PLATFORM=iOS npm run test:login
npm run test:android
npm run test:ios
npm run test:lockout
npm run test:mha
PLATFORM=Android npm run test:mha-high-risk
PLATFORM=iOS npm run test:mha-high-risk
npm run test:screening
```

The login, lockout, MHA, and screening commands use `platform` / `PLATFORM` if set;
otherwise they default to Android. Override the target with `PLATFORM=iOS`
(macOS/Linux) or set it in `lambdatest.properties`.

`LT_SCENARIO` selects the matching uploaded app and spec:

| Scenario | `LT_SCENARIO` | Default platform app |
| --- | --- | --- |
| Platform-selected login/logout | `login` | Android or iOS login app |
| Android login/logout | `android-login` | Android login app |
| iOS login/logout | `ios-login` | iOS login app |
| Incorrect-password lockout | `lockout` | Lockout app |
| Mental-health assessment | `mha` | MHA app |
| Screening/vaccination form | `screening` | MHA app |

`test:login` runs `tests/testScenarios/login-logout.spec.ts` on the selected platform.
The `test:android` and `test:ios` commands run the same spec with an explicit
platform and retain their platform-specific scenario defaults.

You can target another device or uploaded app without editing the project:

```bash
PLATFORM=iOS LT_DEVICE="iPhone 15" LT_VERSION=17 LT_IOS_APP_ID=lt://APP_ID npm run test:ios
```

To type-check the project:

```bash
npm run typecheck
```

Run the local unit tests without a device or cloud session:

```bash
npm run test:unit
```

Mobile scenarios use WebdriverIO's Mocha adapter with the BDD interface
(`describe` / `it`). Local utility regression tests use Node's built-in test
runner with the existing TypeScript loader.

## Project structure

```text
src/
  config/       # Credentials, capabilities, scenario registry, timeouts
  screens/      # Platform-aware page objects and assertions
  utils/        # Mobile session interactions, reporting, browser launching
tests/
  fixtures/     # Non-secret account data and assessment JSON
  helpers/      # Reusable navigation, login, and home-screen flows
  specs/        # Mocha mobile scenarios (*.spec.ts)
  unit/         # Local regression tests (*.test.ts)
wdio.conf.ts    # Runner settings and session/reporting hooks
```

Five specs cover login/logout (Android and iOS), lockout, MHA low risk, MHA high
risk, and screening/vaccination. `src/config/runner.ts` contains the
scenario-to-spec registry and smoke/regression suite definitions. Common flows stay in helpers, while
screen-specific locators and interactions stay in page objects.

Each test writes its execution log, screenshots, and (on failure) page source to
a timestamped directory under `target/test-artifacts/`. Generated artifacts,
legacy `test-output/` reports, and coverage output are ignored by Git. These
directories are recreated as needed; they do not belong in source control.

## Allure reports

Every mobile scenario also writes Allure results to `target/allure-results/`.
The console spec reporter and existing timestamped artifacts remain enabled.
Allure includes execution steps, screenshots, session configuration, execution
logs, and page source captured on failure.

Run a scenario, then launch the report filter UI:

```bash
PLATFORM=Android npm run test:mha-high-risk
npm run report:generate
```

Each new test result is labeled with its user-creation environment and tenant
number. The browser UI lets you select inclusive start/end dates, a tenant, and
an environment before generating the report. Tenant choices and their environments
come from the profile tenant settings in `user-creation.properties` (including
environment-variable overrides). For example, tenant `34` offers MDEV and UAT
when both profiles are configured for `34`. Choosing all tenants shows every
environment. Restart the report UI after changing the properties file. Dates use UTC
(`YYYY-MM-DD`); leave them blank to include all dates. The selected dates and
filters are shown above the embedded Allure report. Only the generated
report is filtered: the original `target/allure-results/` files are unchanged.
The `dev` profile appears as `ca-dev`. Older results without environment labels
can still be filtered by date. Older results without tenant labels are included
when all tenants are selected, but cannot match a tenant filter; rerun those
tests to generate tenant-labeled results.

### Dynatrace session details

After session creation, the LambdaTest session API is queried using the configured
`LT_USERNAME` and `LT_ACCESS_KEY`; its device display name takes precedence over
capability names. If the lookup fails or returns no name, returned device capabilities
are used as fallback and the lookup failure is logged without failing the test.
Device details are stored in the exported
`sessionDeviceDetails` variable in `src/utils/sessionDeviceDetails.ts`:
`sessionId`, `udid`, `osName`, `osVersion`, and `deviceName`. They appear in the
console, execution log, Allure labels, and the `session-device-details` attachment.
The session-ready time is printed in the console and execution log using the
runner's local timezone: `Session Create Time: 17:27:57 | 16 Nov 2026`.
The configured App ID is also printed as `App ID: <appId>` in the console,
execution log, and Allure steps.
After initialization, `App Version` is read from returned app-version capabilities,
or from installed app metadata using the returned package/bundle ID (falling back
to `ANDROID_APP_PACKAGE` / `IOS_BUNDLE_ID`). Android uses `mobile: shell` with
`dumpsys package` (`versionName`); the cloud provider must allow that command.
iOS real devices use `mobile: listApps` (`CFBundleShortVersionString`).
The version is stored as `sessionDeviceDetails.appVersion` and included in logs,
Allure labels/attachments, and the end summary. Retrieval failures are logged
explicitly and do not fail the test; no version is fabricated from the App ID.
When each test finishes (passed or failed), `Session End Time` is recorded in the
same format in the console, execution log, and Allure. This is the test finish
time, not the later mobile session teardown time.
Before finalizing each test's report, an execution session summary repeats the
creation/end times, App ID, session ID, and stored device details in the console,
execution log, and Allure steps. It does not query the device again during teardown.
Device logs include both `device: Galaxy S24` and `Device name: Galaxy S24`
(using the resolved model name) at the start and in the end summary.
Returned cloud `device` display names take precedence over Appium hardware model
codes, keeping execution logs and Allure device details consistent.
When `browser.capabilities` only supplies a hardware code, the concrete device
name from the runner capabilities (also used by Allure Parameters) is preferred.
Regex selection patterns are never printed as resolved device names.
Values not returned by the provider or session API are explicitly logged as unavailable rather
than replaced with requested device patterns. Device names equal to the UDID
are excluded; a concrete configured device name is used if no returned model
name is available. `osVersion` combines OS name and version (for example,
`android 14`). UDID is not a Dynatrace RUM session
identifier; device-specific Dynatrace filters require a verified mapping.

Each test writes an **Open Dynatrace sessions** link to `execution.log` and
Allure. It opens Classic User Sessions filtered to GTB Central App (or ASR (GTB)
for tenant 34), mobile app
type, test platform, and captured Device OS version (for example, `Android 14`).
The Device filter uses the captured cloud display name (for example,
`device:Galaxy S25`), matching the device value used in execution logs and Allure.
If the device name cannot be resolved, the missing filter is explicitly logged.
The Dynatrace timeframe ends at the logged `Session End Time` and starts exactly
five minutes earlier. Both values are encoded as local ISO timestamps with an
explicit timezone offset. If the device OS
version is unavailable, the missing filter is explicitly logged.
The list can contain multiple sessions; it does not identify a
specific RUM session. Dynatrace login and permission to view sessions are needed.

To additionally include Dynatrace RUM session details for each test, set
`DYNATRACE_ENABLED=true` and provide `DYNATRACE_ACCESS_TOKEN` as a short-lived
Dynatrace OAuth access token with permission to query `user.sessions` in Grail.
Keep the token in a secret environment variable, not a properties file or source
control. The sessions URL is defined in `src/utils/DynatraceUtil.ts`.

At the end of each test, the runner queries the supplied GTB Central App
real-user DQL using that session's start time, test end time and platform (iOS or Android).
The matching session records and query metadata are written to
`execution.log`; Allure also receives a
`dynatrace-sessions` attachment. These are RUM session records, not application
logs, and the query returns at most 1,000 records. Sessions are matched only by
time, app and platform, so they can include other users' data, and may be absent
if Dynatrace has not ingested them yet. Protect artifacts and reports accordingly.
The query can add up to 30 seconds to each test. Query failures are logged in
the execution report without changing the test outcome.

Run report generation even when the test fails to inspect the failure evidence.
The Allure command-line tool requires Java on your PATH (`JAVA_HOME` may also
be used). `report:generate` starts a local report UI and opens it in your
default browser; leave that terminal running while using the report, and press
Ctrl+C when finished. `report:open` starts the same UI.

Results accumulate across runs. Each generated, filtered report is stored in
`target/allure-filtered-reports/`; the source results and previous reports are
not replaced. These directories are ignored by Git under `target/`. Reports
can contain account and screen data; keep them private and restrict access to
CI artifacts.

## Scrolling

Scroll-to-element actions use short, slow swipes (15% of the screen height over
1.5 seconds), hold before releasing to reduce momentum, and wait 750 ms for the
screen to settle. Before each swipe, the target is checked for visibility and an
on-screen center. Scrolling stops and clicks the target as soon as it is visible,
or fails after the page object's configured maximum number of swipes.

## iOS execution time

Exact iOS `name` XPath locators use native XCUITest predicate queries, including
Next/Submit button alternatives. Complex XPath locators remain unchanged.
MHA answer selection uses a native label/name predicate and a single
wait-and-click operation. Each section and question is logged so a stalled
question can be identified instead of only seeing the overall timeout.

Every execution has a 15-minute whole-test timeout by default, including the
MHA journey's login, scrolling, questions, and results verification.
Increasing the whole-test timeout does
not increase individual element waits. For a custom limit, set
`LT_TEST_TIMEOUT_SECONDS` in the local properties file or environment.
