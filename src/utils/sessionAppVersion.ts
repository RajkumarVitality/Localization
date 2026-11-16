interface AppVersionClient {
  execute(command: string, args: Record<string, unknown>): Promise<unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function readSessionAppVersion(
  client: AppVersionClient,
  platform: 'Android' | 'iOS',
  capabilities: unknown,
  configuredIdentifier?: string
): Promise<string> {
  const caps = record(capabilities);
  const sources = [caps, record(caps['LT:Options'])];
  for (const source of sources) {
    const version = text(source['appium:appVersion']) ?? text(source.appVersion);
    if (version) return version;
  }
  const key = platform === 'Android' ? 'appPackage' : 'bundleId';
  const identifier = sources
    .map(source => text(source[`appium:${key}`]) ?? text(source[key]))
    .find(value => value !== undefined) ?? text(configuredIdentifier);
  if (!identifier) {
    throw new Error(`App package/bundle ID was not returned by the session. Set ${
      platform === 'Android' ? 'ANDROID_APP_PACKAGE' : 'IOS_BUNDLE_ID'
    } to retrieve the installed app version.`);
  }
  if (platform === 'Android') {
    const result = await client.execute('mobile: shell', {
      command: 'dumpsys', args: ['package', identifier], timeout: 10_000
    });
    const output = text(result) ?? text(record(result).stdout);
    const version = output?.match(/^\s*versionName=([^\r\n]+)/m)?.[1]?.trim();
    if (version) return version;
    throw new Error(`Android package metadata did not contain versionName for ${identifier}.`);
  }
  const apps = record(await client.execute('mobile: listApps', {
    applicationType: 'User',
    returnAttributes: ['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion']
  }));
  const version = text(record(apps[identifier]).CFBundleShortVersionString);
  if (version) return version;
  throw new Error(`iOS app metadata did not contain CFBundleShortVersionString for ${identifier}.`);
}
