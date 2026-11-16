const sessionApiBase = 'https://mobile-api.lambdatest.com/mobile-automation/api/v1/sessions/';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function findDeviceName(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = findDeviceName(item);
      if (name) return name;
    }
    return undefined;
  }

  const object = record(value);
  if (!object) return undefined;

  for (const key of ['device_name', 'deviceName', 'display_device_name', 'deviceDisplayName']) {
    const candidate = object[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  const device = object.device;
  if (typeof device === 'string' && device.trim()) return device.trim();
  const deviceObject = record(device);
  if (deviceObject) {
    for (const key of ['name', 'device_name', 'deviceName', 'model']) {
      const candidate = deviceObject[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  }

  for (const nested of Object.values(object)) {
    const name = findDeviceName(nested);
    if (name) return name;
  }
  return undefined;
}

export async function readLambdaTestSessionDeviceName(
  sessionId: string,
  username: string,
  accessKey: string,
  fetcher: typeof fetch = fetch
): Promise<string> {
  if (!sessionId.trim()) throw new Error('LambdaTest session ID is required.');
  if (!username.trim() || !accessKey.trim()) {
    throw new Error('LambdaTest username and access key are required to read session details.');
  }

  const url = new URL(encodeURIComponent(sessionId), sessionApiBase);
  const response = await fetcher(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${accessKey}`).toString('base64')}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    throw new Error(`LambdaTest session details returned HTTP ${response.status}.`);
  }

  const deviceName = findDeviceName(await response.json());
  if (!deviceName) {
    throw new Error('LambdaTest session details did not include a device name.');
  }
  return deviceName;
}
