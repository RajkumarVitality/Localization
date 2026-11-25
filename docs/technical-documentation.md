# Localization Framework: Technical Documentation

## 1. Purpose and scope

This document describes the Localization repository's Appium mobile-testing proof of concept
(PoC): its TypeScript/WebdriverIO architecture, real-device session setup,
test-user provisioning boundary, execution lifecycle, and reporting outputs.
It is intended as an implementation guide for maintaining and extending the
PoC. It documents the behavior currently implemented in the repository; it is
not a production-readiness or application-under-test specification.

The project name is **Localization**. Its framework combines reusable
Android/iOS journeys, tenant-specific selectors and expected text, backend
test-account provisioning, cloud device execution, and execution evidence.
Localization is driven by the selected tenant; it is not a standalone
translation-management service or a general language-switching test engine.

### Reading guide

| Need | Sections |
| --- | --- |
| Architecture and execution lifecycle | 2-7 |
| Reports and local validation | 8-10 |
| Installation and commands | 11 |
| Tenant/language selection and fixtures | 12 |
| Page objects, waits, and retries | 13 |
| Adding tests or tenant support | 14 |
| Diagnostics, operations, and AI integration | 15-17 |

For installation, credentials, and copy-paste run commands, see the root
[README](../README.md). Never put real credentials, member data, or generated
test evidence in this document.

For the AI-assisted discovery and test-generation layer, see the
[MCP server and Copilot agent technical guide](./mcp-agent-technical-documentation.md),
including tool contracts, client setup, safety boundaries, and PoC limitations.

## 2. Technology and execution model

- **Runtime:** Node.js 20+ with TypeScript running through `tsx`.
- **Mobile automation:** WebdriverIO 9, Mocha, and Appium.
- **Device provider:** TestMu AI real-device cloud (formerly LambdaTest).
- **Platforms:** Android with UiAutomator2; iOS with XCUITest.
- **Reports:** WebdriverIO spec output and Allure results.
- **Local utility tests:** Node.js built-in test runner.

The test process runs locally. It uses the local Node.js worker to resolve
configuration and, for applicable scenarios, create a test account through
the configured backend APIs. The mobile automation session itself is created
on the cloud device provider using the WebDriver endpoint.

## 3. Component map

```text
scripts/run-mobile-tests.ts
  -> wdio.conf.ts
       -> src/config/mobileSessionInit.ts
       -> src/config/runner.ts
       -> src/config/timeoutsHandling.ts
       -> tests/helpers/user_helpers/TestUser.ts (beforeSession)
       -> tests/{smoke,regression}/*.spec.ts
            -> tests/helpers/*.ts
            -> src/pages/*.ts
       -> src/utils/ExecutionReporter.ts
       -> src/utils/browserLauncher.ts

scripts/serve-allure-report.ts
  -> scripts/generate-allure-report.ts
  -> src/utils/allureResultFilter.ts
```

| Area | Responsibility |
| --- | --- |
| `scripts/run-mobile-tests.ts` | Prompts for tenant, matching environment, platform, and app ID in an interactive terminal, applies the default smoke worker limit, and starts the WebdriverIO CLI as a child process. |
| `wdio.conf.ts` | Resolves run settings, configures WebdriverIO/Mocha/reporters, provisions accounts before sessions, and connects test hooks to reporting and cleanup. |
| `src/config/mobileSessionInit.ts` | Loads cloud settings, validates platform/app selection, constructs capabilities and endpoint configuration, names sessions, and provides artifact-path helpers. |
| `src/config/runner.ts` | Maps scenario names to spec files and declares smoke/regression suites and account-provisioning policies. |
| `src/config/properties.ts` | Parses Java-properties-like files and decodes explicitly Base64-prefixed supported values. |
| `src/config/userCreation.ts` | Reads the separate test-user provisioning settings file and environment overrides. |
| `src/config/API-to-Create-New-User.ts` | Implements the backend API calls used by account setup. |
| `tests/helpers/user_helpers/TestUser.ts` | Performs pre-session account creation for scenarios that require a new member and exposes the created member to tests. |
| `tests/helpers/` | Shared flows, test hooks, account utilities, and local unit tests. |
| `src/pages/` | Screen/page objects using shared interactions and the tenant-specific selector catalog. |
| `src/pages/mobileElements.ts` | Loads and validates tenant YAML catalogs; resolves expected text variants and locator placeholders. |
| `elements/T<tenant>.yml` | Android/iOS selectors and expected localized text for each supported tenant. |
| `src/config/assessmentResource.ts` | Resolves assessment inputs under the selected tenant's fixture directory. |
| `src/utils/dynatraceSessions.ts` | Adds execution-window observability links and optionally queries Dynatrace session records. |
| `src/utils/ExecutionReporter.ts` | Writes execution logs and per-test evidence locally and attaches supported evidence to Allure. |
| `scripts/serve-allure-report.ts` | Serves a local filter UI for date, environment, and tenant-filtered Allure report generation. |

## 4. Test selection and scenario registry

The runner resolves `LT_SCENARIO` (default `loginAndLogout`) through
`src/config/runner.ts`. The registry currently contains:

| Scenario | Spec | Provisions a member |
| --- | --- | --- |
| `loginAndLogout` | `tests/smoke/login-logout.spec.ts` | Yes |
| `lockout` | `tests/regression/incorrect-password-lockout.spec.ts` | Yes |
| `incorrect-password-once` | `tests/regression/incorrect-password-once.spec.ts` | Yes |
| `mha-low-risk` | `tests/regression/mha-low-risk.spec.ts` | Yes |
| `mha-high-risk` | `tests/smoke/mha-high-risk.spec.ts` | Yes |
| `mha-unanswered` | `tests/regression/mha-unanswered.spec.ts` | Yes |
| `mha-exit-partial` | `tests/regression/mha-exit-partial.spec.ts` | Yes |
| `mha-privacy-cancel` | `tests/regression/mha-privacy-cancel.spec.ts` | Yes |
| `screening` | `tests/regression/screening-vaccination.spec.ts` | Yes |

`loginAndLogout` is the default scenario. Other values must match a registry
key. Smoke and regression suites are separately declared in the same registry;
the wrapper gives smoke runs a default `maxInstances` of five unless the caller
specifies one. `wdio.conf.ts` otherwise sets `maxInstances` to one.

Every WebdriverIO session must receive exactly one spec. This is checked when
assigning the cloud session name and when selecting the test-account
provisioning policy. A suite may contain multiple specs, but each worker
session receives its own spec and follows the same pre-session hook.

The configured app ID is resolved once from the run's platform and settings;
it is not mapped from each individual spec in the scenario registry. When
running a suite whose specs require different uploaded app builds, configure
the selected app appropriately or run those scenarios separately.

## 5. Settings and precedence

Mobile/cloud settings are read by `mobileSessionInit.ts` from environment
variables and then from `lambdatest.properties` in the project root or
`src/test/resources/lambdatest.properties`. A non-empty environment value
takes precedence over a file value. The property loader reads the root file
before the nested file, so a duplicate key in the nested file takes precedence
over the root-file value. Missing optional files are ignored; other file-read
errors are surfaced.

User-creation settings are a separate concern: `userCreation.ts` reads
`user-creation.properties` and environment variables. Do not assume a value in
one properties file is automatically available to the other configuration
reader. The required per-environment prefixes and fields are documented in the
[README setup section](../README.md#user-creation-environments).

### Mobile/cloud settings

| Purpose | Keys and behavior |
| --- | --- |
| Cloud credentials | `LT_USERNAME` and `LT_ACCESS_KEY`; legacy aliases `UserName` and `AccessKey` are accepted. Both are required. |
| App under test | Precedence: `appId`, platform-specific `LT_ANDROID_APP_ID` / `LT_IOS_APP_ID`, legacy `androidAppId` / `iosAppId`, then shared `LT_APP_ID`. An App ID is required. |
| Platform | `PLATFORM`, then `platform`, default `Android`. Accepted values are Android or iOS, case-insensitive. |
| Device and OS version | `device` then `LT_DEVICE`; `version` then `LT_VERSION`. Defaults are `Galaxy S.*` / `14` for the helper's `android-login` special case, `Galaxy S.*` / `.*` for other Android scenarios, and `iPhone .*` / `.*` for iOS. The current scenario registry does not use the `android-login` key, so registered Android scenarios default to `.*`. |
| Grid endpoint | `LT_GRID_URL`, default `mobile-hub.lambdatest.com`. The scheme defaults to HTTPS and `/wd/hub` is appended when absent. |
| Build and session labels | `LT_BUILD_NAME` and `LT_TEST_NAME`; a session name is refined from the worker's `.spec.ts` filename before session start. |
| Optional cloud project | The implementation reads a property whose key is `Central Project_Mobile Appium` followed by a trailing space and adds it as the LambdaTest project option when present. |
| Browser behavior | `LT_OPEN_LIVE_SESSION` defaults to `true`; any non-empty `CI` setting disables auto-opening. Setting `LT_OPEN_LIVE_SESSION=false` also disables it. |
| Local evidence directory | `LT_ARTIFACTS_DIR`, default `target/test-artifacts`. |
| Optional cleanup target | `ANDROID_APP_PACKAGE` / `LT_ANDROID_APP_PACKAGE` or `IOS_BUNDLE_ID` / `LT_IOS_BUNDLE_ID`; when supplied, the app is removed after execution. |

The property parser accepts `key=value` and `key:value` lines and ignores blank
lines and lines beginning with `#` or `!`. A `base64:` prefix is decoded only
for `LT_USERNAME`, `LT_ACCESS_KEY`, their legacy aliases, and `APP_PASSWORD`
when those values come from the properties file. This encoding is reversible
and must not be treated as secret storage. Environment-variable values are not
decoded.

## 6. Mobile session initialization

The session setup is implemented in
[`src/config/mobileSessionInit.ts`](../src/config/mobileSessionInit.ts) and
consumed by [`wdio.conf.ts`](../wdio.conf.ts).

1. **Resolve platform and scenario.** The platform is validated; the selected
   scenario is resolved from `LT_SCENARIO` with a default of `loginAndLogout`.
2. **Resolve endpoint and timeouts.** The configured grid URL is normalized
   into a WebDriver endpoint. `LT_WAIT_SECONDS` defaults to 10 seconds and
   `LT_TEST_TIMEOUT_SECONDS` defaults to 900 seconds. Both must be positive,
   within the supported timer range, and the whole-test timeout must exceed
   the element-wait timeout.
3. **Build capabilities.** Cloud credentials, app ID, device, and OS version
   are required/resolved before WebdriverIO starts. Capabilities set the
   platform-specific automation engine, cloud options, app-reset behavior,
   and a 1,800-second Appium idle timeout. Video and visual capture are
   enabled. iOS additionally enables automatic alert acceptance.
4. **Name the session per spec.** `beforeSession` derives the scenario suffix
   from the sole `.spec.ts` filename. `LT_TEST_NAME`, when set, is used as a
   prefix. Invalid or multiple spec inputs fail rather than producing an
   ambiguous session name.
5. **Provision before device session.** The same hook initializes any
   scenario-specific account before the cloud session is opened. If setup
   fails, the worker logs the error and exits with a non-zero code; it does
   not continue with a fixed-account fallback.
6. **Execute and capture evidence.** `beforeTest` records the cloud session
   link and configuration, optionally opens the live session dashboard, waits
   briefly for the app to load, and captures initial evidence.
7. **Finish and clean up.** `afterTest` captures a pass/failure screenshot;
   failures also capture the current page source. The `after` hook optionally
   removes the configured app and makes a best-effort attempt to close the
   dashboard browser tab/window.

The app reset settings are `fullReset: true` and `noReset: false` in both the
Appium and cloud capability options. This favors a clean app state for each
session. The optional app-removal hook is separate and runs only when a bundle
ID/package name is configured.

## 7. Test-account provisioning boundary

Provisioning runs in the local Node.js worker's WebdriverIO `beforeSession`
hook, not on the mobile device. The scenario registry determines whether an
account is required. For a provisioning scenario, the helper validates the
selected environment and required profile settings, then runs the configured
backend sequence: create party, enrol member, register member, calculate
status, retrieve user instructions, capture login events, process events,
and delete the onboarding instruction. The separate reward-event creation
step and the direct backend login call are currently commented out in the
orchestrator; they are not executed provisioning steps. The generated login
identity is made available to tests only after the sequence succeeds.

The screening/vaccination scenario provisions a fresh member and logs in with
the generated username. The lockout scenario additionally requires an incorrect
password that differs from `APP_PASSWORD`. Provisioning writes are not
automatically retried because replaying a partially completed write sequence
could create duplicate state. Backend/API error handling and operational
troubleshooting details are in the [README](../README.md).

Keep user-creation credentials and cloud credentials in their respective
configuration sources. Never log passwords or tokens. The existing runner
does attach generated member details to Allure, and screen/page-source evidence
may contain personal data; restrict artifact access and sharing accordingly.
Do not copy real account details into source fixtures or documentation.

## 8. Reporting and artifacts

For each test, `ExecutionReporter` creates a timestamped directory under
`target/test-artifacts/` (or the configured artifacts root). Evidence can
include:

- `execution.log`, including session ID/dashboard URL and execution status;
- a text session configuration snapshot;
- screenshots at app load and test completion;
- failure-time screenshot and page source.

The runner also attaches generated member details (including member username,
Party ID, insurer code, and date of birth), resolved device/session details,
and execution timing. These attachments are operational test evidence, not
safe-to-publish documentation.

`dynatraceSessions.ts` adds a Dynatrace link for the execution window and
available platform/device/tenant filters. If `DYNATRACE_ENABLED=true`, the
runner uses `DYNATRACE_ACCESS_TOKEN` for an optional query and attaches
returned session information. A time-window match can include sessions from
other activity; it does not prove a record belongs to this test. Reporting
failures are logged separately by the runner.

The WebdriverIO Allure reporter writes source results to
`target/allure-results/`. The custom reporter attaches execution steps and
available evidence. The local report UI can generate separate filtered reports
under `target/allure-filtered-reports/` using date, environment, and tenant
labels; it does not modify the source results. Older results without tenant
labels are excluded only when a tenant filter is selected.
Generated output is ignored by Git. Treat artifacts and reports as potentially
sensitive because they may contain member or screen data; limit retention and
access, especially in CI.

The live-session dashboard URL is derived from the cloud session ID and logged
regardless of whether automatic browser opening is enabled. Closing the
dashboard is best-effort and must not be relied on as a cloud-session
termination mechanism.

## 9. Local validation and cloud execution

Local unit tests exercise utility/configuration behavior without requiring an
Appium cloud session. TypeScript validation checks compilation. Full mobile
scenario execution requires valid cloud credentials, a compatible uploaded
app, and any backend settings/accounts required by that scenario.

```bash
npm run typecheck
npm run test:unit
```

Use the documented `npm run test:*` commands in the
[README](../README.md#run-the-scenarios) for cloud execution. Cloud runs can
consume device-farm capacity and interact with backend environments; confirm
the selected platform, environment, App ID, and test-account settings before
starting one.

## 10. Current PoC boundaries

- The cloud provider and real-device execution model are configured in the
  current implementation; a local Appium-server execution mode is not exposed
  by this runner.
- App IDs are configuration-driven and shared across the worker's specs; the
  scenario registry does not currently assign an app ID per spec.
- Device selection uses provider matching strings and defaults; it does not
  guarantee a particular device instance or OS patch level.
- Test-user setup depends on external backend services and environment
  profiles. Local unit tests do not prove those services are reachable or that
  cloud execution will pass.
- Some negative/partial assessment journeys are opt-in and their unimplemented
  behaviors require confirmation. The current registry includes the unanswered,
  exit-partial, and privacy-cancel specs in regression; source registration,
  rather than older README examples, determines current membership. Do not
  treat registered specs as proof of live verified coverage.
- Dashboard opening/closing and evidence capture are convenience/diagnostic
  behavior, not a replacement for managed cloud-session lifecycle or secure
  artifact retention.

## 11. Installation and execution runbook

### 11.1 Prerequisites and setup

Use Node.js 20+ and npm. Live runs additionally require access to the cloud
device provider, compatible uploaded Android/iOS app IDs, and network/VPN
access to the selected backend environment. The local worker, not the cloud
device, performs provisioning API calls.

```bash
npm ci
cp lambdatest.properties.example lambdatest.properties
cp user-creation.properties.example user-creation.properties
```

Populate the ignored local files or inject settings through CI secrets.
Never commit filled-in credential files. `base64:` values supported by the
mobile property loader are reversible encoding, not encryption.

Configure cloud credentials, app ID, `APP_PASSWORD`, and the selected
provisioning profile. Lockout additionally needs `INCORRECT_APP_PASSWORD`.
Use the example files for setting names, not as valid runtime credentials.

### 11.2 Environment profiles

| `VG_ENVIRONMENT` | Setting prefix |
| --- | --- |
| `ca-test` | `VG_CA_TEST_` |
| `ca-dev` | `VG_CA_DEV_` |
| `mdev` (default) | `VG_MDEV_` |
| `uat` | `VG_UAT_` |
| `mdev-9998` | `VG_T9998_MDEV_` |

Each profile supplies `TENANT_NUMBER`, backend URLs, product/reference keys,
email-domain configuration, `LOGIN_PREFIX`, and authentication settings.
Shared `configUserAgent` is also required. Refer to
[`user-creation.properties.example`](../user-creation.properties.example)
for the exact keys and API-specific requirements.
`mdev-9998` is independent of `mdev`; missing values do not fall back to the
other profile.

Interactive execution first asks for a tenant. It matches that number against
configured profile tenant settings and offers only matching environments.
An unknown tenant is rejected rather than written into an arbitrary profile.
The app ID prompt is mandatory. The resulting selections apply to all workers
for that invocation without rewriting properties files.

### 11.3 Available commands

The following mobile commands can open paid cloud sessions and modify backend
state. Confirm authorization and configuration before executing them.

| Command | Selection |
| --- | --- |
| `npm test` | Default `loginAndLogout`, unless `LT_SCENARIO` selects another registered scenario. |
| `npm run test:login` | Cross-platform login/logout. |
| `npm run test:android` | Login/logout with Android selected initially. |
| `npm run test:ios` | Login/logout with iOS selected initially. |
| `npm run test:smoke` | Smoke suite, default maximum five workers. |
| `npm run test:regression` | Regression suite, default maximum one worker. |
| `npm run test:lockout` | Incorrect-password lockout using a newly provisioned account. |
| `npm run test:mha` / `npm run test:mha-high-risk` | High-risk assessment journey. |
| `npm run test:screening` | Screening/vaccination journey. |

Other registry entries can be selected explicitly:

```bash
LT_SCENARIO=mha-low-risk PLATFORM=iOS npm test
```

Interactive prompts can override the initial platform. In non-interactive CI,
prompts are skipped: provide `PLATFORM`, `VG_ENVIRONMENT`, the selected profile
settings, credentials, and app ID in the process environment or supported
configuration files. Do not put secret values in committed pipeline commands.

Suite selection is declared in `src/config/runner.ts`:

| Suite | Registered scenarios |
| --- | --- |
| Smoke | `loginAndLogout`, `mha-high-risk` |
| Regression | `lockout`, `mha-low-risk`, `mha-privacy-cancel`, `mha-unanswered`, `mha-exit-partial`, `screening` |

Use `npm test -- --suite smoke` or `npm test -- --suite regression` for direct
suite selection. Each spec receives a separate session and account.
The smoke worker limit does not imply five running devices when fewer specs
exist; actual concurrency is also limited by provider capacity.

## 12. Tenant localization and assessment data

### 12.1 Tenant resolution

`configuredTenantNumber()` in `userCreation.ts` selects the active profile
using `VG_ENVIRONMENT` (default `mdev`) and reads its prefixed `TENANT_NUMBER`.
For catalog/fixture resolution it falls back to `9998` if no tenant is set.
Provisioning still requires an explicitly configured profile tenant: this
fallback is not sufficient configuration for a live run.

```text
VG_ENVIRONMENT
  -> userCreationProfilePrefix(...)
  -> <profile prefix>TENANT_NUMBER
       -> elements/T<tenant>.yml
       -> tests/fixtures/T<tenant>/
       -> report tenant label
       -> tenant 34 language/locale capability branch
```

Tenant `34` has Dutch expected text and tenant `9998` has English expected
text in the checked-in catalogs. For tenant `34`, `buildCapabilities` sets
`language: nl` and `locale: nl` in both `LT:Options` and Appium capabilities
for Android and iOS. Other tenants receive no explicit language/locale
override from that branch. Catalog selection does not itself translate the app
or guarantee its actual device language; confirm the behavior on the target app.

### 12.2 Catalog schema and helpers

Each YAML catalog is organized by screen and element key. Both platform
selectors are required; expected text is optional until an assertion requests it.
For example, the English tenant catalog includes:

```yaml
LoginScreen:
  hello:
    android: "//*[@resource-id='txthello_001']"
    ios: "//*[@name='txthello_001']"
    expected: "Hello"
```

The matching Dutch catalog uses the same logical keys with `expected: "Hallo"`.
Logical keys let the same page-object method select tenant-specific data.
Catalogs can also provide different selectors where the tenant's UI differs.

| Helper | Responsibility |
| --- | --- |
| `loadMobileElementCatalog(tenantNumber)` | Validates numeric tenant input and loads the matching YAML catalog. |
| `mobileElements` | Catalog resolved at module initialization from the configured tenant. |
| `expectedText(locator, variant?)` | Retrieves a string or a named expected-text variant; missing values fail explicitly. |
| `expectedTextOptions(locator)` | Returns configured string variants for assertions that support alternatives. |
| `formatMobileLocator(locator, values)` | Expands named placeholders such as `{index}` in both platform selectors; missing values fail. |

Named variants can represent states such as greeting time or assessment risk
outcome. They are expected application states, not automatic language detection.
Formatting a locator returns the platform selector pair, not expected text.
Use confirmed accessibility/resource identifiers where supported; preserve
existing catalog selectors until a tested replacement is available.

Missing catalogs and invalid schemas fail rather than selecting another
tenant's text. Required screen/element coverage is additionally established by
page usage and helper tests; basic shape validation alone does not prove that
every screen key or selector is correct.

Because `mobileElements` is initialized when imported, set the tenant before
loading page modules. Use a fresh worker/process for another tenant rather than
mutating the environment halfway through a journey.

### 12.3 Assessment fixtures

`assessmentResource.ts` resolves:

```text
tests/fixtures/T<tenant>/mha-high-risk-assessment.json
tests/fixtures/T<tenant>/mha-low-risk-assessment.json
```

Assessment documents contain a `Mental health assessment` object with
`Count` and `Sections`; sections have a `Name` and `Questions`, and questions
have `Name`, `Type`, and optional `Values`.
The loader parses JSON and applies a TypeScript type assertion; it does not
perform complete runtime schema validation. Calling flows may check required
fields. Review translated question names, answer values, section order, and
counts when changing fixtures.

The selected tenant controls both selectors/text and assessment inputs.
Missing fixture files do not fall back to another tenant. Use synthetic
assessment inputs, not real member health records.

## 13. Page objects, shared flows, waits, and retries

`BaseScreen` provides platform-selector routing, element operations, text
assertions, bounded scrolling, and checkpoint/reporting helpers.
Concrete screen classes implement business-facing methods such as
`assertHelloVisible`, `enterUsername`, or `openSettings`.
Specs should express journeys using those methods rather than duplicate
low-level selectors.

`MobileSession` contains shared WebdriverIO operations and W3C touch actions.
Required element existence/visibility waits throw `RequiredMobileElementError`
on expiration. `retryOnce` logs and propagates that error or a Node assertion
failure without retrying, including through nested wrappers. Exhausting a
scroll search uses the same error and does not repeat the search. Optional visibility probes still
return false. Other operation failures retain their existing one retry, with
an immediate lookup rather than another full wait. The current test stops,
but reporting/cleanup and other tests in the suite remain enabled.

| Setting | Default | Scope |
| --- | --- | --- |
| `LT_WAIT_SECONDS` | 10 seconds | Shared element wait and WebdriverIO wait configuration; configurable for slower devices. |
| `LT_TEST_TIMEOUT_SECONDS` | 900 seconds | Mocha test timeout; must exceed the element wait. |
| `connectionRetryTimeout` | 180,000 ms | WebdriverIO connection handling. |
| `connectionRetryCount` | 2 | WebdriverIO connection retries, separate from UI operation retry. |
| `mochaOpts.retries` | 0 | No automatic retry of the full Mocha test body. |

Some current helpers contain fixed settling pauses. Do not interpret that as
a requirement to add new sleeps: prefer readiness/visibility checks for new
behavior. UI operation retries do not authorize replaying provisioning writes.

`genericFlow.ts` centralizes welcome/healthy-living navigation, login,
permission handling, home readiness, and home screenshots. Passwords are read
using the existing required-setting helper, not supplied in spec literals.

## 14. Extending the framework

### 14.1 Add a test journey

1. Define the expected behavior, supported platform(s), tenant(s), account
   requirements, and intended pack.
2. Read the closest spec and existing page methods; reuse `genericFlow`
   and shared interaction/reporting helpers.
3. Add confirmed selectors and expected text to each supported tenant catalog.
   Do not derive exact selectors from screenshots alone.
4. Add focused screen methods where necessary and a kebab-case `*.spec.ts`
   under `tests/smoke/` or `tests/regression/`.
5. Add a registry entry with its relative spec path, display name, and
   provisioning policy. Declare suite membership explicitly.
6. Verify account readiness in the suite hook; do not provision again inside
   the spec or create a second WebdriverIO session.
7. Add targeted local checks, review scenario selection and fixtures, and
   update directly related commands/documentation.
8. Perform a separate, authorized live run before claiming device coverage.

The current provisioning resolver matches registered specs by basename.
Keep spec basenames unique across packs; do not introduce ambiguous names.

### 14.2 Add tenant or language coverage

1. Configure the intended backend profile and numeric tenant.
2. Add `elements/T<tenant>.yml` with verified selectors, translated text, and
   compatible logical screen/element keys.
3. Add the assessment fixtures required by supported journeys.
4. If a distinct environment profile is needed, update the profile registry,
   prefix mapping, example settings, prompt-selection tests, and documentation.
5. Review the capability language/locale branch. It currently handles tenant
   `34` explicitly; a new catalog alone does not add a device-locale mapping.
6. Exercise catalog/text helpers locally, then validate approved Android/iOS
   journeys on the intended language/device configuration.

There is no general `LANGUAGE` setting or language/tenant matrix runner in
the current implementation. Supporting multiple languages for one tenant
requires an explicit design change rather than renaming a catalog.

## 15. Troubleshooting and operational handling

| Symptom | Diagnostic/action |
| --- | --- |
| Unknown tenant in interactive runner | Confirm the number matches at least one profile's configured `TENANT_NUMBER`; check environment overrides. |
| Missing cloud/app setting | Check mobile-setting precedence and uploaded app compatibility; no built-in app ID exists. |
| Provisioning stops before device creation | Inspect the failed provisioning step and original API/configuration error; check local VPN, endpoints, and credentials. |
| Partially created backend account | Investigate applied writes before replaying setup; do not assume account deletion or rollback exists. |
| YAML load/schema failure | Confirm the numeric tenant, matching catalog filename, and selector/text schema. |
| Wrong language or text assertion | Compare profile tenant, active catalog, actual app language, and expected-text variant. |
| Missing assessment question/fixture | Check the selected tenant's fixture, translated question text, and current app questionnaire. |
| Repeated UI lookup failure | Inspect failure screenshot/page source and platform selector; increasing all timeouts can hide a selector defect. |
| Report missing tenant-filtered results | Confirm tenant labels exist; old unlabeled results are excluded when filtering by tenant. |
| No Dynatrace match | Inspect time window, filters, token permissions, and backend reporting delay; matches are not test-exclusive. |

`getUserInstruction` is a backend read sent as POST; its helper has bounded
transient retries. This does not imply the write sequence is safe to retry.
Retain the original provisioning error and do not silently substitute a
fixed account.

After a run, inspect test status, account/session attachments, failure
evidence, and provider session completion. Closing the dashboard window is
not session cleanup. Optional app removal does not delete the generated
backend account. Define account retention/cleanup outside this PoC before
large-scale repeated execution.

## 16. Reports, CI, and local verification

Both report commands start the local report-serving/filter workflow:

```bash
npm run report:generate
npm run report:open
```

The default report UI port is `4173`; use `ALLURE_REPORT_PORT` to select
another port. Filtered report generation preserves source Allure results.
Use a compatible Java runtime if required by the installed Allure
command-line distribution. Keep the report service and generated member
evidence restricted to intended users.

For CI, supply settings before process initialization, avoid interactive
stdin, keep cloud credentials in the CI secret store, and set `CI` to suppress
automatic live-dashboard opening. Set concurrency deliberately to match
provider capacity and backend provisioning limits. Restrict artifact access
and retention rather than publishing raw screenshots/page dumps.

Local checks are distinct from live scenario execution:

```bash
npm run typecheck
npm run test:unit
npm run test:mcp
```

`test:unit` uses `tests/helpers/*.test.ts`; it does not automatically include
nested tests under `tests/helpers/user_helpers/`. Run relevant nested files
explicitly with `node --import tsx --test <path>`.
`tsconfig.json` includes `src`, tests, and `wdio.conf.ts`; standalone script
coverage should not be assumed from its include list.

At the time of this documentation, repository-wide type-checking has known
missing-import failures in existing helper tests. Record baseline failures
separately, and do not report a passing full build based solely on focused
checks. No live device run was performed for this documentation task.

### GitHub Actions

The manual [Mobile Test Suites workflow](../.github/workflows/mobile-tests.yml)
accepts tenant, environment, platform, suite, and uploaded app ID inputs.
After committing it to the default branch, use **Actions > Mobile Test Suites >
Run workflow**. Actions does not display the terminal selection prompts.

Tenant `9998` permits `ca-test`, `ca-dev`, or `mdev-9998`; tenant `34` permits
`mdev` or `uat`. GitHub choice lists cannot change dynamically based on another
input, so all profiles appear and the workflow rejects incompatible selections.
It also verifies that the selected profile's configured tenant matches the
input; it never silently rewrites a provisioning profile's tenant.

Create `LT_PROPERTIES` and `USER_CREATION_PROPERTIES` Actions secrets with
the complete configured mobile/cloud and provisioning properties contents.
Create the GitHub environment `mobile-tests` and configure required reviewers
where supported. The workflow input maps to `VG_ENVIRONMENT`; the app ID maps
to the existing `appId` override. The selected tenant is checked against the
profile's prefixed `TENANT_NUMBER`, not used as a new runtime setting reader.

The workflow uses a GitHub-hosted macOS runner and a two-worker limit for
either suite. If the backend requires private network access, replace
`macos-latest` with a self-hosted macOS runner labeled `mobile-tests` that has
the necessary connectivity. Cloud devices still run on LambdaTest.
Runs create accounts and consume cloud capacity; regression includes lockout.
Credential files are removed after the run. Artifacts are not uploaded
automatically because reports can contain member details.

## 17. Optional AI and MCP extension

An opt-in local Ollama [failure-analysis integration](./failure-analysis.md)
classifies failures reaching `afterTest` and adds advisory Allure findings.
It preserves the original test status and does not process screenshots or
page dumps. Local model installation and explicit enablement are required.

The framework can be maintained without AI tooling. Two workspace custom
agents provide guidance for generation and framework-aware development;
the local MCP server exposes approved source discovery and run plans.
Neither replaces the existing runner or automatically proves generated code.

See the [MCP agent technical guide](./mcp-agent-technical-documentation.md)
for setup, five tool contracts, permissions, and limitations.
Keep live-device approval separate from requests to create or explain tests.
There is currently no ACCELQ integration or measured Appium-versus-ACCELQ
productivity benchmark in this repository.
