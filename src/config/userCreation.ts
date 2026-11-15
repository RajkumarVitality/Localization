import { fileURLToPath } from 'node:url';
import { loadProperties } from './properties.js';

const fileProperties = loadProperties([
  fileURLToPath(new URL('../../user-creation.properties', import.meta.url))
]);

export const mobileEnvironments = ['ca-test', 'ca-dev', 'mdev', 'uat', 'mdev-9998'] as const;
export type MobileEnvironment = typeof mobileEnvironments[number];

export function userCreationProfilePrefix(environment: string): string {
  const profile = environment.toLowerCase();
  return profile === 'mdev-9998'
    ? 'VG_T9998_MDEV_'
    : `VG_${profile.toUpperCase().replaceAll('-', '_')}_`;
}

export function userCreationSetting(key: string): string | undefined {
  return process.env[key]?.trim() || fileProperties.get(key)?.trim() || undefined;
}

export function requiredUserCreationSetting(key: string): string {
  const value = userCreationSetting(key);
  if (!value) {
    throw new Error(`Missing required setting: ${key}. Provide it as an environment variable or in user-creation.properties.`);
  }
  return value;
}

export function configuredTenantNumber(): string {
  const prefix = userCreationProfilePrefix(userCreationSetting('VG_ENVIRONMENT') ?? 'mdev');
  return userCreationSetting(`${prefix}TENANT_NUMBER`) ?? '9998';
}
