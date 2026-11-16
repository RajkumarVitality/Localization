import { DynatraceUtil } from './DynatraceUtil.js';
import type { MobilePlatform } from '../config/mobileSessionInit.js';

const queryTimeoutMs = 30_000;

export function dynatraceSessionQuery(platform: MobilePlatform): string {
  const osName = platform === 'iOS' ? 'iOS' : 'Android';
  return `fetch user.sessions
| filter dt.system.bucket != "default_synthetic_user_sessions"
| sort isNull(start_time) desc, start_time desc
| fields id = concat(dt.rum.session.id, toString(start_time)),
    dt.rum.session.id, start_time,
    user.identifier = coalesce(user.identifier, dt.rum.user_tag),
    frontend.name, geo.country.iso_code, characteristics.has_replay, browser.name,
    duration_minutes = toDouble(duration) / toDouble(1min),
    navigation_count, user_interaction_count, app.version, dt.rum.user_type,
    error.has_crash, os.name, os.version, device.type, browser.version,
    browser.window.height, browser.window.width, client.ip, client.isp,
    device.screen.height, device.screen.width, end_reason, end_time,
    hasErrors = error.count > 0, error.count, error.anr_count,
    error.csp_violation_count, error.exception_count, error.http_4xx_count,
    error.http_5xx_count, instance_id, request_count, page_summary_count,
    view_summary_count, user_action_count, characteristics.is_bounce
| filter in(frontend.name, {"GTB_-_Central_App"})
| filter matchesValue(dt.rum.user_type, "real_user")
| filter matchesValue(os.name, "${osName}")
| sort isNull(characteristics.is_bounce) asc, characteristics.is_bounce desc
| limit 1000
| fields dt.rum.session.id,
    start_time = formatTimestamp(start_time, format: "HH:mm:ss"),
    end_time = formatTimestamp(end_time, format: "HH:mm:ss"),
    app.version, os.name, os.version, duration_minutes, frontend.name,
    geo.country.iso_code, error.count, navigation_count, user_action_count`;
}

interface QueryResponse {
  state?: string;
  requestToken?: string;
  result?: { records?: unknown[]; metadata?: unknown };
}

export async function fetchDynatraceSessions(
  start: Date, end: Date, platform: MobilePlatform, token: string
): Promise<{ records: unknown[]; metadata: unknown }> {
  if (!token.trim()) throw new Error('DYNATRACE_ACCESS_TOKEN is required when Dynatrace reporting is enabled.');
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error('Dynatrace execution time range is invalid.');
  }
  const sessionsUrl = new URL(DynatraceUtil.generateSessionsUrl(start, end, platform));
  if (sessionsUrl.protocol !== 'https:' || sessionsUrl.username || sessionsUrl.password) {
    throw new Error('Dynatrace sessions URL must use HTTPS without credentials.');
  }
  const base = sessionsUrl.origin;
  const deadline = Date.now() + queryTimeoutMs;
  const headers = { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' };
  async function request(url: URL, init: RequestInit): Promise<QueryResponse> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Dynatrace query timed out.');
    const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(remaining) });
    if (!response.ok) throw new Error(`Dynatrace query returned HTTP ${response.status}.`);
    return await response.json() as QueryResponse;
  }

  let response = await request(new URL('/platform/storage/query/v1/query:execute', base), {
    method: 'POST',
    body: JSON.stringify({
      query: dynatraceSessionQuery(platform),
      defaultTimeframeStart: start.toISOString(),
      defaultTimeframeEnd: end.toISOString(),
      requestTimeoutMilliseconds: 1000
    })
  });
  const requestToken = response.requestToken;
  while (response.state === 'NOT_STARTED' || response.state === 'RUNNING') {
    if (!requestToken) throw new Error('Dynatrace returned a pending query without a request token.');
    const poll = new URL('/platform/storage/query/v1/query:poll', base);
    poll.searchParams.set('request-token', requestToken);
    poll.searchParams.set('request-timeout-milliseconds', '1000');
    response = await request(poll, { method: 'GET' });
    if (response.state === 'NOT_STARTED' || response.state === 'RUNNING') {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  if (response.state !== 'SUCCEEDED' || !Array.isArray(response.result?.records)) {
    throw new Error(`Dynatrace query did not succeed (state: ${response.state ?? 'unknown'}).`);
  }
  return { records: response.result.records, metadata: response.result.metadata };
}

interface DynatraceReporter {
  log(message: string): void;
  captureTextArtifact(label: string, content: string): Promise<string | undefined>;
}

export async function reportDynatraceSessions(
  reporter: DynatraceReporter,
  addLink: (url: string, name?: string) => Promise<void>,
  start: Date,
  end: Date,
  platform: MobilePlatform,
  token?: string,
  osVersion?: string,
  deviceName?: string
): Promise<void> {
  const url = DynatraceUtil.generateSessionsUrl(start, end, platform, osVersion, deviceName);
  reporter.log(`Dynatrace sessions for this execution window (may include other sessions): ${url}`);
  await addLink(url, 'Open Dynatrace sessions');
  if (token === undefined) return;
  const { records, metadata } = await fetchDynatraceSessions(start, end, platform, token);
  reporter.log(`Dynatrace RUM sessions: ${records.length} (time-window match; not necessarily this test's session).`);
  for (const record of records) reporter.log(`Dynatrace RUM session: ${JSON.stringify(record)}`);
  if (metadata !== undefined) reporter.log(`Dynatrace query metadata: ${JSON.stringify(metadata)}`);
  const content = JSON.stringify({ start: start.toISOString(), end: end.toISOString(), platform, sessionsUrl: url, records, metadata }, null, 2);
  const artifact = await reporter.captureTextArtifact('dynatrace-sessions', content);
  if (!artifact) throw new Error('Failed to attach Dynatrace sessions to the report.');
}
