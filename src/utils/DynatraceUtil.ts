import type { MobilePlatform } from '../config/mobileSessionInit.js';

export class DynatraceUtil {
  private static readonly sessionsUrl =
    'https://zeb49325.apps.dynatrace.com/ui/apps/dynatrace.classic.session.segmentation/ui/user-sessions';

  static generateSessionsUrl(
    startTime: Date, endTime: Date, platform: MobilePlatform, osVersion?: string, deviceName?: string
  ): string {
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || startTime >= endTime) {
      throw new Error('Dynatrace execution time range is invalid.');
    }
    const url = new URL(this.sessionsUrl);
    url.searchParams.set('gtf', `${startTime.toISOString()} to ${endTime.toISOString()}`);
    url.searchParams.append('filter', 'app:GTB \u254d Central App');
    url.searchParams.append('filter', 'appType:Mobile');
    url.searchParams.append('filter', `osFamily:${platform}`);
    //url.searchParams.append('filter', `device:${deviceName ?? ''}`);

    if (osVersion?.trim()) {
      const version = osVersion.trim().replace(/^(android|ios)\s+/i, '');
      url.searchParams.append('filter', `osVersion:${platform} ${version}`);
    }
    return url.toString();
  }
}