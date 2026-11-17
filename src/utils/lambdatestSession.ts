const sessionApiBase = 'https://mobile-api.lambdatest.com/mobile-automation/api/v1/sessions/';
const sessionLookupAttempts = 4;
const sessionLookupRetryDelayMs = 500;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
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
  const headers = {
    Authorization: `Basic ${Buffer.from(`${username}:${accessKey}`).toString('base64')}`,
    Accept: 'application/json'
  };
  let response: Response;
  for (let attempt = 1; ; attempt++) {
    response = await fetcher(url, {
      headers,
      signal: AbortSignal.timeout(10_000)
    });
    if (response.status !== 404 || attempt === sessionLookupAttempts) break;
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, sessionLookupRetryDelayMs));
  }
  if (!response.ok) {
    throw new Error(`LambdaTest session details returned HTTP ${response.status}.`);
  }

  const sessionResponse = record(await response.json());
  const data = record(sessionResponse?.data);
  const deviceName = data?.device_name;
  if (typeof deviceName !== 'string' || !deviceName.trim()) {
    throw new Error('LambdaTest session details did not include a device name.');
  }
  return deviceName.trim();
}
