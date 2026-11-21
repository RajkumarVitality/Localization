# Appium failure-analysis agent

## Purpose and integration

The opt-in runtime analyzer in `src/utils/failureAnalysis.ts` uses a local
Ollama model to triage failed mobile tests. `wdio.conf.ts` calls it in
`afterTest`, after failure screenshot/page-source capture and before final
reporting. Passed tests and disabled analysis make no model requests.

The original test failure, assertions, screenshots, and status are preserved.
Analysis is advisory and does not retry the test, create defects, or change
Allure's failed/broken determination.

Independently of Ollama, failed tests check the captured Android page source
for the visible "Unsafe device detected" dialog and its security message.
When both are present, an observed failure reason is written to the execution
log and added to Allure as a step and **Observed failure reason** attachment.
The reason the device was flagged remains unknown; this does not bypass the
security check or change the test outcome. A missing page source is reported
explicitly. Existing reports are not rewritten.

## Local setup

Install Ollama separately using your organization's approved installation
method. Select a downloaded, local text model supported by your hardware and
Ollama's structured-output API. For example, on a machine with sufficient
memory:

```bash
ollama pull qwen2.5:7b
```

Downloading the model requires network access but does not require execution
logs. Serve it on loopback with cloud functionality disabled:

```bash
OLLAMA_NO_CLOUD=1 OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

If Ollama is already running as an application/service, configure those
settings on that service instead of starting another listener.
Use only a locally downloaded model. Model names containing `cloud` are
rejected, but this is not a substitute for configuring a trusted local server.

Set these **process environment variables** for the test worker:

| Variable | Behavior |
| --- | --- |
| `FAILURE_ANALYSIS_ENABLED` | Exact `true` enables analysis; disabled otherwise. |
| `FAILURE_ANALYSIS_MODEL` | Required local model name, for example `qwen2.5:7b`. |
| `FAILURE_ANALYSIS_TIMEOUT_MS` | Default `15000`; integer from `100` to `60000`. Includes response-body reading. |

These settings are not read from `lambdatest.properties`.
For an already authorized mobile run, prefix its existing command:

```bash
FAILURE_ANALYSIS_ENABLED=true \
FAILURE_ANALYSIS_MODEL=qwen2.5:7b \
FAILURE_ANALYSIS_TIMEOUT_MS=30000 \
npm run test:smoke
```

This mobile command provisions members and uses paid cloud sessions. Enabling
analysis does not grant authorization to run it. Preload/warm the model if
necessary; initial loading can exceed the analysis deadline.

Requests go only to `http://127.0.0.1:11434/api/chat`. Redirects are rejected.
No configurable remote AI endpoint or new dependency is introduced.

## Evidence and privacy boundary

The analyzer sends:

- Sanitized error message/stack: up to 6,000 characters.
- Sanitized recent framework execution log: up to 12,000 characters.
- Available platform, device, OS version, and app version.

`ExecutionReporter` retains a per-test, 32,000-character rolling memory buffer.
It is reset at test start and finish; analysis does not read arbitrary log files.
The framework execution log includes high-level actions and failures, not a
download of raw LambdaTest/Appium server logs.

Screenshots, page dumps, credentials files, member attachments, capabilities
objects, and backend response bodies are not supplied to the model.
Missing metadata is marked unavailable, not invented. App version is included
only when the existing session details actually contain it.

The hook supplies configured cloud/app secrets and profile authentication
values for exact-value redaction. Generic sanitization also removes common
credential fields, authorization values, URLs, emails, local user paths,
date strings, and long numeric identifiers. Model output is sanitized again.
Redaction is best-effort, not a guarantee of anonymization: do not log arbitrary
personal data or secrets, and use only a trusted local model/server.
The existing raw execution evidence has its original retention/access risks;
this feature does not retroactively sanitize all report artifacts.

## Classification contract

The model must return strict JSON with:

```json
{
  "category": "inconclusive",
  "probableCause": "The element did not become visible; the cause is uncertain.",
  "evidence": ["Element visibility failure in supplied error"],
  "confidence": 0.4,
  "recommendedInvestigation": [
    "Check the selector and app readiness against the failure evidence."
  ]
}
```

Allowed categories:

| Category | Meaning |
| --- | --- |
| `suspected_app_defect` | Evidence suggests application behavior; not a confirmed defect. |
| `automation_issue` | Evidence suggests test logic, locator, or test-data handling. |
| `environment_issue` | Evidence suggests device, network, backend, or infrastructure problems. |
| `inconclusive` | Available evidence cannot reliably distinguish causes. |

Confidence must be `0-1`; it is an uncalibrated model estimate, not a measured
probability. The schema bounds every narrative/list and rejects unknown fields.
The prompt treats evidence as untrusted data and discourages root-cause claims
from timeouts or missing elements alone. Schema validation cannot establish
factual correctness; review classifications before using them operationally.

## Allure outputs and errors

Open the failed test's attachments and select **AI Failure Analysis**.
The JSON-text attachment contains the validated analysis, engine, advisory
notice, and evidence scope. It is also saved with existing text artifacts.
Allure labels are:

| Label | Value |
| --- | --- |
| `ai_analysis_status` | `analyzed`, `configuration_error`, `unavailable`, `timeout`, or `invalid_response`. |
| `ai_failure_category` | Validated classification; only set after successful analysis. |

Label availability in views/filters depends on the Allure UI; this change adds
metadata, not a custom dashboard widget or Allure categories configuration.

Invalid configuration, missing model/service, non-success HTTP responses,
timeouts, and malformed/oversized model output are explicit status outcomes.
They produce a diagnostic attachment without a fabricated classification.
Responses are limited to 32 KiB. No automatic model-request retry occurs.
Raw provider error bodies are not reported because they could echo evidence.
An attachment/label reporting exception is logged without replacing the
original mobile failure.

This covers failed test bodies reaching `afterTest`. Provisioning failures
before session creation, session-start failures, and other hook failures are
not automatically analyzed by this integration.

## Copilot custom agent

Select **Appium Failure Analysis** in a host supporting workspace custom
agents. Its definition is
`.github/agents/appium-failure-analysis.agent.md`.
It provides read-only investigation of user-approved sanitized evidence and
relevant test code. It does not itself run Ollama or write Allure artifacts;
the runtime integration above provides automatic reporting.

## Local verification and limitations

```bash
node --import tsx --test tests/helpers/failure-analysis.test.ts tests/helpers/execution-reporter.test.ts
```

Checks use synthetic data and mocked model responses. They cover disabled
behavior, bounded/sanitized requests, schema rejection, deadlines, labels,
attachments, and preservation of original failures.
They do not prove model classification accuracy or a real device run.
Ollama was not installed or invoked during implementation; verify with an
approved local model before enabling the feature in shared jobs.

For CI, Ollama must run on the same runner machine. A self-hosted runner with
adequate memory and a preloaded local model is recommended. Cloud mobile devices
do not host the analyzer. Keep it disabled where Ollama is unavailable.
