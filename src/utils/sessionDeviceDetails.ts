export interface SessionDeviceDetails {
  readonly sessionId: string;
  readonly udid?: string;
  readonly osName?: string;
  readonly osVersion?: string;
  readonly deviceName?: string;
  readonly appVersion?: string;
}

export let sessionDeviceDetails: Readonly<SessionDeviceDetails> | undefined;

export function sessionTimeLogLine(createdAt: Date, event: 'Create' | 'End'): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const month = createdAt.toLocaleString('en-GB', { month: 'short' });
  return `Session ${event} Time: ${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}:${pad(createdAt.getSeconds())} | ${pad(createdAt.getDate())} ${month} ${createdAt.getFullYear()}`;
}

export function captureSessionDeviceDetails(
  sessionId: string, capabilities: unknown, sessionApiDeviceName?: string, appVersion?: string
): Readonly<SessionDeviceDetails> {
  const caps = record(capabilities);
  const options = record(caps['LT:Options']);
  function value(...keys: string[]): string | undefined {
    for (const source of [caps, options]) {
      for (const key of keys) {
        const candidate = source[key];
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      }
    }
    return undefined;
  }
  const udid = value('appium:udid', 'udid', 'deviceUDID', 'deviceUDId');
  const osName = value('platformName', 'appium:platformName');
  const version = value('appium:platformVersion', 'platformVersion');
  sessionDeviceDetails = Object.freeze({
    sessionId,
    ...(appVersion ? { appVersion } : {}),
    udid,
    osName,
    osVersion: version && osName && !version.toLowerCase().startsWith(`${osName.toLowerCase()} `)
      ? `${osName} ${version}` : version,
    ...(sessionApiDeviceName ? { deviceName: sessionApiDeviceName } : {})
  });
  return sessionDeviceDetails;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function sessionDeviceLogLines(details: SessionDeviceDetails): string[] {
  const lines = [
    `App Version: ${details.appVersion ?? 'unavailable (app metadata could not be retrieved)'}`,
    `Device UDID: ${details.udid ?? 'unavailable (not returned by session)'}`,
    `Device OS name: ${details.osName ?? 'unavailable (not returned by session)'}`,
    `Device OS version: ${details.osVersion ?? 'unavailable (not returned by session)'}`,
    `Device name: ${details.deviceName ?? 'unavailable (not returned by session)'}`
  ];
  return lines;
}
