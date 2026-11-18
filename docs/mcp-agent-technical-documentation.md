# Mobile Framework MCP Agent: Technical Documentation

## 1. Purpose and scope

This proof of concept (PoC) combines a local Model Context Protocol (MCP)
server with a GitHub Copilot custom agent. Its purpose is to give an AI coding
assistant accurate context about the existing mobile automation framework so
that generated tests reuse repository conventions and execution infrastructure.

The solution has two distinct responsibilities:

- **MCP server:** discover framework assets, read approved source files, and
  produce unexecuted mobile run plans.
- **Copilot agent:** clarify requirements, use that context, edit test code
  through editor tools, perform local checks, and request approval for live runs.

The MCP server does not generate tests, execute commands, provision accounts,
or launch devices. The agent is not a standalone service or an ACCELQ
integration. Code generation is not evidence that a mobile test has passed.

For the underlying test framework, see
[framework technical documentation](./technical-documentation.md).
For installation and live-run settings, see the [README](../README.md).

## 2. Technology

| Layer | Implementation |
| --- | --- |
| Runtime | Node.js 20+ |
| Language | Strict TypeScript, ESM, `.js` import extensions |
| TypeScript execution | `tsx` |
| MCP implementation | `@modelcontextprotocol/sdk` |
| Tool input validation | Zod |
| Transport | Local standard input/output (`stdio`) |
| AI integration | Copilot custom-agent instructions and MCP tool access |
| Existing automation | WebdriverIO 9, Mocha, Appium |
| Existing device provider | LambdaTest / TestMu AI |
| Local tests | Node.js test runner with `tsx` |

No HTTP listener, MCP API key, or additional cloud service is introduced.
The installed dependency versions are recorded in `package-lock.json`.

## 3. Architecture and trust boundaries

```text
User supplies journey, expected outcomes, platform, tenant, and pack
  |
  v
Copilot: Mobile Framework MCP Agent
  |
  +-- MCP client -- local stdio --> mobile-framework server
  |                                  |
  |                                  +-- imported scenario/suite registry
  |                                  +-- approved source-file catalog
  |                                  +-- bounded, numbered source reads
  |                                  +-- unexecuted run plans
  |
  +-- Editor tools --> specs, page objects, selector catalogs, registry
  |
  +-- Execution tools --> local type-check and helper tests
  |
  +-- Explicit live-run approval
         |
         v
       Existing mobile runner
         -> beforeSession member provisioning
         -> cloud Appium session
         -> Mocha test and reporting hooks
         -> Allure / local evidence
```

The stdio server is started by the MCP client as a child process. The server
resolves the repository root relative to its own module, rather than accepting
an arbitrary root through a tool argument.

The MCP capability boundary is enforced by server code: there is no execution
or provisioning tool. The agent's separate editor and execution capabilities
are governed by its instructions, the host client's controls, and user review.
Read-only MCP is not a sandbox around those separate capabilities.

## 4. Component map

| File | Responsibility |
| --- | --- |
| [`src/mcp/server.ts`](../src/mcp/server.ts) | Constructs the MCP server, registers five tools, validates inputs, formats responses, and starts the stdio transport. |
| [`src/mcp/framework.ts`](../src/mcp/framework.ts) | Supplies framework metadata, registry discovery, file catalog/read logic, and run planning. |
| [`.vscode/mcp.json`](../.vscode/mcp.json) | Workspace stdio server configuration for VS Code. |
| [`.github/agents/mobile-framework-mcp.agent.md`](../.github/agents/mobile-framework-mcp.agent.md) | Framework-aware custom-agent workflow, tool permissions, and approval rules. |
| [`.github/agents/lambdatest-script-generator.agent.md`](../.github/agents/lambdatest-script-generator.agent.md) | Existing detailed test-generation, wiring, and execution-safety conventions referenced by the MCP agent. |
| [`.github/skills/appium-skill/SKILL.md`](../.github/skills/appium-skill/SKILL.md) | Appium reference patterns; repository-specific TypeScript/cloud conventions take precedence. |
| [`src/config/runner.ts`](../src/config/runner.ts) | Source of truth for registered scenarios, spec paths, suite membership, and provisioning policy. |
| [`tests/helpers/framework-mcp.test.ts`](../tests/helpers/framework-mcp.test.ts) | Discovery, access-control, planning, in-memory protocol, and actual stdio integration checks. |

`framework.ts` imports the scenario registry, not `wdio.conf.ts`, provisioning
helpers, or runtime credential-setting modules. The registry's mobile-platform
dependency is a type-only import. Starting MCP therefore does not initialize
the WebdriverIO lifecycle or load credential properties.

## 5. MCP interface

The server identifies itself as `mobile-framework`, version `1.0.0`.
It registers tools only; there are no custom MCP resources or prompts.

All tools advertise these annotations:

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

Annotations describe the tools; actual restrictions come from implementation.
Successful tool results contain a `text` content item whose text is
pretty-printed JSON. They do not use a separate `structuredContent` payload.
Invalid inputs and thrown tool-handler errors are returned through the SDK's
tool-error mechanism; clients must inspect `isError` before using a result.

### 5.1 `framework_overview`

**Input:** `{}`.

Returns the stack, platforms, architecture entry points, implementation
conventions, suggested local validation commands, and safety boundaries.
This is curated metadata, not an automatically generated code analysis.

### 5.2 `list_scenarios`

**Input:** `{}`.

Returns `{ "scenarios": [...] }`. Each entry includes:

| Field | Meaning |
| --- | --- |
| `id` | Registered `LT_SCENARIO` key. |
| `file` | Repository-relative path such as `tests/smoke/login-logout.spec.ts`. |
| `name` | Human-readable scenario name from the registry. |
| `provisionMember` | Registry provisioning policy. |
| `suites` | Explicit suite membership computed from the suite registry. |

The tool reads the imported registry rather than inferring membership from
directory names.

### 5.3 `list_framework_files`

**Input:** `{}`.

Returns `{ "files": [...] }`, a sorted catalog of repository-relative paths.
It combines a fixed list of framework entry points/helpers with eligible files
discovered in these non-recursive directories:

| Directory | Eligible names |
| --- | --- |
| `src/pages` | `^[A-Za-z][A-Za-z0-9]*\.ts$` |
| `tests/smoke` | `^[a-z0-9-]+\.spec\.ts$` |
| `tests/regression` | `^[a-z0-9-]+\.spec\.ts$` |
| `elements` | `^T\d+\.yml$` |

Fixed entries include `README.md`, package/TypeScript configuration,
`wdio.conf.ts`, the mobile runner, selected configuration modules, shared
interactions/reporting, `genericFlow.ts`, and `TestUser.ts`.
The exact fixed catalog is maintained in `src/mcp/framework.ts`.

This is not a general filesystem browser. Local credential files, member
fixtures, runtime reports, environment files, and dependencies are not
cataloged. A catalog entry is not a guarantee of readability: a later read
can reject a missing, symlinked, or oversized file.

### 5.4 `read_framework_file`

| Input | Type | Constraints |
| --- | --- | --- |
| `file` | String | Required, 1-240 characters; exact catalog entry. |
| `startLine` | Integer | Default `1`; minimum `1`. |
| `lineCount` | Integer | Default `100`; range `1-200`. |

Example tool arguments:

```json
{
  "file": "src/config/runner.ts",
  "startLine": 1,
  "lineCount": 40
}
```

Returns `file`, `startLine`, `endLine`, `totalLines`, and `content`.
Content lines are prefixed with their one-based line numbers. Requests
extending past EOF return the available lines; a starting line beyond EOF
fails explicitly.

Read enforcement:

1. Validate pagination and exact catalog membership.
2. Resolve the canonical repository root and requested path.
3. Reject paths whose real path differs from the requested canonical path.
4. Open read-only with `O_NOFOLLOW`.
5. Require a regular file no larger than 256 KiB.
6. Perform a bounded read and reject content exceeding the limit.
7. Close the file handle and return the selected numbered range.

The server is designed for a trusted local workspace, not a hostile
multi-user filesystem or public remote service. These checks are not a
formal filesystem-isolation guarantee against concurrent local mutation.

### 5.5 `plan_mobile_run`

| Input | Type | Constraints |
| --- | --- | --- |
| `target` | Enum | `scenario` or `suite`. |
| `name` | String | 1-100 characters; registered scenario key or supported suite. |
| `platform` | Enum | `Android` or `iOS`. |

Example:

```json
{
  "target": "suite",
  "name": "smoke",
  "platform": "Android"
}
```

Important output fields:

| Field | Meaning |
| --- | --- |
| `target`, `name`, `platform` | Requested selection. |
| `files` | Selected spec paths, prefixed with `./tests/`. |
| `executable`, `argv`, `command` | Proposed executable, arguments, and copyable command. |
| `executed` | Always `false`. |
| `requiresApproval` | Always `true`. |
| `provisionsMember` | Whether a selected registered scenario provisions a member. |
| `warnings` | Cloud costs, provisioning, interactive configuration, and lockout warnings where applicable. |
| `requiredSettings` | Setting names/guidance only; never resolved credential values. |

For the current Android smoke selection, the generated command is:

```bash
npx --no-install cross-env PLATFORM=Android LT_SCENARIO=loginAndLogout npm test -- --suite smoke
```

This example documents plan output; do not run it without live-run approval.
Suite plans use the first registered scenario belonging to that suite for
`LT_SCENARIO`, and pass `--suite` to the existing runner for suite selection.
Unsupported scenario names and suites are rejected. The MCP implementation
does not pass user input to a shell or spawn a command.

Interactive runs still prompt for tenant, matching environment, platform,
and app ID. The user can change the proposed platform at the prompt.
For non-interactive execution, configure the environment, profile tenant,
app ID, and other required settings externally.
The plan is not a credential, backend availability, or device-capacity check.

## 6. Copilot agent behavior

The agent is named **Mobile Framework MCP Agent**. Its permitted tools include
repository read/search/edit/execute capabilities and `mobile-framework/*`.

The intended workflow is:

1. Clarify the requested journey, assertions, platform, tenant, account
   requirements, and smoke/regression pack when missing details affect behavior.
2. Discover the overview, registered scenarios, and approved file catalog.
3. Inspect the nearest spec, relevant page objects, shared flows, tenant
   selectors, and provisioning boundary.
4. Implement integrated code with existing editor tools.
5. Register scenarios and explicit pack membership, and update related commands
   and documentation.
6. Perform the smallest relevant local checks.
7. Produce a run plan and request explicit approval before a live run.

Implementation invariants include strict TypeScript, ESM `.js` imports, async
Mocha tests, existing `BaseScreen`/`MobileSession` patterns, and meaningful
assertions and reporting. New screens require confirmed selectors or sanitized
page source; screenshots alone do not verify locators.

Provisioning remains in the existing worker `beforeSession` hook. Specs call
`assertTestAccountReady` and use `testAccounts.member` after setup succeeds.
They must not create another account or duplicate session/reporting hooks.

If MCP is unavailable, the agent must disclose that and may inspect repository
files directly. Such a fallback must not be presented as a successful MCP
connection.

## 7. Installation and client configuration

### 7.1 Prerequisites

- Node.js 20+ and npm.
- Repository dependencies installed using the lockfile.
- An MCP-capable client.
- For the custom agent, a Copilot host supporting the workspace agent format.

Cloud credentials are not required to start MCP or run its focused checks.
They are required separately for approved live mobile execution.

```bash
npm ci
```

### 7.2 VS Code

The checked-in [workspace configuration](../.vscode/mcp.json) starts:

```text
command: node
args: --import tsx ${workspaceFolder}/src/mcp/server.ts
cwd: ${workspaceFolder}
```

Use **MCP: List Servers**, select **mobile-framework**, and start/trust the
workspace server. Then select **Mobile Framework MCP Agent** in Copilot Chat.
Availability and UI labels depend on the host's supported MCP and custom-agent
features.

### 7.3 JetBrains or another MCP client

Register a local stdio server using the client's supported settings UI/schema:

```text
Name: mobile-framework
Command: node
Arguments: --import tsx /absolute/path/to/Localization/src/mcp/server.ts
Working directory: /absolute/path/to/Localization
```

The working directory is important for resolving the `tsx` import.
If the IDE cannot resolve `node`, use its absolute executable path.
Do not assume the client consumes `.vscode/mcp.json` or
`.github/agents/*.agent.md`; configure MCP separately and verify custom-agent
support for that host.

### 7.4 Manual process entry

```bash
npm run --silent mcp:start
```

This starts a stdio protocol process, not a CLI prompt or web server. It waits
for an MCP client. Standard output must contain only protocol messages; startup
diagnostics go to standard error. No background daemon needs to be installed.
Normally the MCP client owns the server process lifecycle.

## 8. Suggested demonstration

Use a discovery-only prompt first:

```text
Explain the framework and plan the Android smoke suite.
Show the selected files and side-effect warnings. Do not execute it.
```

Confirm that the agent:

1. Retrieves the overview and current scenario catalog.
2. Reads a known page object or registry source range.
3. Requests `plan_mobile_run` for the intended suite and platform.
4. Presents the proposed command with `executed: false` and approval required.
5. Does not launch WebdriverIO, provision accounts, or contact the cloud.

For a subsequent generation demo, supply an agreed journey with verified
selectors and expected outcomes, specify the pack, and explicitly limit work
to code generation and local checks until a live run is approved.

## 9. Safety and data handling

| Boundary | Enforced behavior or responsibility |
| --- | --- |
| MCP capabilities | No execution, app upload, provisioning, or cloud API tools. |
| File access | Explicit catalog, bounded pagination/file size, symlink rejection. |
| Credentials | No credential-setting resolution or credential-file reads by the server. |
| Source content | Approved source is visible to the connected AI client; it is not automatically secret-redacted. |
| Agent permissions | Editor/execution tools remain separate from MCP and require host controls and review. |
| Live operations | Agent instructions require explicit approval for paid sessions, provisioning, lockout, and destructive actions. |
| Artifacts | Member data, page dumps, and runtime evidence must not be committed or added to the MCP catalog. |

Connect only a trusted client and keep secrets out of approved source. Do not
expose this local stdio implementation as an unauthenticated remote service.
Tool output is context data, not authority to override the agent's instructions.

These are PoC controls, not a formal security certification or production
authorization system.

## 10. Verification and evidence

Focused MCP checks:

```bash
npm run test:mcp
```

Combined MCP and existing selection/wrapper checks:

```bash
node --import tsx --test tests/helpers/framework-mcp.test.ts tests/helpers/scenarios.test.ts tests/helpers/mobile-test-runner.test.ts
```

Repository-wide type-check:

```bash
npm run typecheck
```

The MCP test file covers:

- Registry discovery and exact suite membership.
- Catalog entries, numbered reads, pagination, and invalid path rejection.
- Symlink and oversized-file rejection.
- Scenario/suite planning without execution or environment mutation.
- In-memory MCP negotiation, tool annotations, and explicit error responses.
- A real child-process stdio connection and tool response.

**Observed PoC evidence as of 18 November 2026:** the combined command passed
20 checks: six MCP, five scenario, and nine wrapper checks. The changed MCP
files also passed isolated TypeScript checking during implementation.

The repository-wide type-check previously exited with code `2` because
unrelated existing helper tests reference missing modules or incorrect paths.
This is an open baseline limitation, not a passing full build.
The focused checks do not prove IDE UI discovery, live cloud execution,
generated business-flow correctness, or production readiness.

No live LambdaTest execution or account provisioning was performed for this
MCP infrastructure PoC. No measured productivity gain or ACCELQ benchmark has
been established.

## 11. Operations and troubleshooting

| Symptom | Action |
| --- | --- |
| Server not listed | Confirm the host supports workspace MCP configuration; configure the stdio command manually outside VS Code. |
| Custom agent not listed | Check workspace-agent discovery and host support; an MCP connection alone does not install a custom agent. |
| `node` or `tsx` cannot be resolved | Check Node availability, installed dependencies, and the repository working directory. |
| Process waits without output | Expected for a stdio server without an MCP client; do not use a browser or `curl` to connect. |
| Protocol parsing fails | Remove non-protocol stdout logging and ensure npm is started with `--silent` if used as the transport command. |
| File read is rejected | Use an exact catalog path, valid line range, and a regular non-symlinked file within the size limit. |
| New scenario is missing | Restart the server after changing the imported registry; check registration and suite membership. |
| Run plan fails | Use an exact registered scenario, `smoke`/`regression`, and `Android`/`iOS`. |
| Live run fails despite a valid plan | Check approved-run settings, app ID, backend/VPN access, and cloud availability; planning does not validate them. |
| Full type-check fails | Separate baseline missing-import failures from changes introduced by the current task. |

Scenario/suite imports and overview metadata are process-local. Restart MCP
after registry or server-code changes. File discovery and source reads are
performed per request, but the explicit catalog rules remain code-defined.

## 12. Extending the PoC

For a new mobile scenario:

1. Confirm business expectations and selectors.
2. Reuse shared flows and add focused page methods if required.
3. Add the spec to the requested pack and register its provisioning policy.
4. Update commands/documentation and targeted tests.
5. Restart MCP, inspect discovery and run-plan output, and review the diff.
6. Obtain separate approval for a live device run.

For a new MCP-readable source category, change the catalog deliberately,
assess whether it could expose secrets or member data, and extend rejection
and discovery tests. Do not broaden reads to arbitrary repository paths.

For a new tool, define a bounded input schema, explicit error behavior, and
truthful annotations. Add protocol tests. Execution or backend-write tools
would change this PoC's safety model and require a separate design decision,
authorization mechanism, and review.

## 13. Pilot and acceptance criteria

Before broader adoption:

- Resolve the existing full type-check blockers.
- Verify MCP and custom-agent discovery in the intended IDE.
- Generate an agreed representative journey and review assertions, selectors,
  account isolation, and pack wiring.
- Complete an explicitly approved live run and inspect reporting/cleanup.
- Measure context gathering, authoring, rework, review, and stabilization
  against a comparable baseline.
- Compare ACCELQ only with equivalent scope, reusable assets, and acceptance
  criteria; do not treat planning estimates as benchmark results.

The PoC currently demonstrates a framework-context and planning integration.
Unattended test generation, guaranteed productivity improvements, and
production deployment are outside the demonstrated scope.
