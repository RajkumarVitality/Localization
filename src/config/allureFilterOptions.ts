import { mobileEnvironments, userCreationProfilePrefix, userCreationSetting } from './userCreation.js';

export function allureFilterOptions(
  setting: (key: string) => string | undefined = userCreationSetting
): Array<{ environment: string; tenant?: string }> {
  return mobileEnvironments.map(environment => {
    const tenant = setting(`${userCreationProfilePrefix(environment)}TENANT_NUMBER`)?.trim();
    if (tenant && !/^\d+$/.test(tenant)) {
      throw new Error(`Invalid tenant number configured for ${environment}.`);
    }
    return { environment, tenant: tenant || undefined };
  });
}
