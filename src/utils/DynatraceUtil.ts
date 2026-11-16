import type { MobilePlatform } from '../config/mobileSessionInit.js';

export class DynatraceUtil {
  private static readonly sessionsUrl =
    'https://zeb49325.apps.dynatrace.com/ui/apps/dynatrace.classic.session.segmentation/ui/user-sessions';

  private static localIsoTimestamp(date: Date): string {
    const pad = (value: number): string => String(value).padStart(2, '0');
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
      `${sign}${pad(offsetHours)}:${pad(offsetMinutes)}`;
  }

  static generateSessionsUrl(
    startTime: Date, endTime: Date, platform: MobilePlatform, osVersion?: string, deviceName?: string
  ): string {
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || startTime >= endTime) {
      throw new Error('Dynatrace execution time range is invalid.');
    }
    const url = new URL(this.sessionsUrl);
    const filterStartTime = new Date(endTime.getTime() - 5 * 60 * 1000);
    url.searchParams.set(
      'gtf',
      `${this.localIsoTimestamp(filterStartTime)} to ${this.localIsoTimestamp(endTime)}`
    );
    url.searchParams.append('filter', 'app:GTB \u254d Central App');
    url.searchParams.append('filter', 'appType:Mobile');
    url.searchParams.append('filter', `osFamily:${platform}`);
    url.searchParams.append('filter', `device:${deviceName ?? ''}`);

    if (osVersion?.trim()) {
      const version = osVersion.trim().replace(/^(android|ios)\s+/i, '');
      url.searchParams.append('filter', `osVersion:${platform} ${version}`);
    }
    return url.toString();
  }
}