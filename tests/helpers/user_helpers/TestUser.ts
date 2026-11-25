import {
  calculateVitalityStatus,
  captureLoginEvents,
  createPartyCore,
  deleteUserInstruction,
  enrolUser,
  getUserInstruction,
  loginUser,
  printUserDetails,
  processEvents,
  registerUser
} from '../../../src/config/API-to-Create-New-User.js';
import { requiredSetting } from '../../../src/config/mobileSessionInit.js';
import { configuredTenantNumber, mobileEnvironments, requiredUserCreationSetting, userCreationProfilePrefix, userCreationSetting } from '../../../src/config/userCreation.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarios } from '../../../src/config/runner.js';

let member: string | undefined;

export interface TestAccountDetails {
  readonly partyId: number;
  readonly insurerCode: string;
  readonly dateOfBirth: string;
  readonly memberUsername: string;
}

let accountDetails: Readonly<TestAccountDetails> | undefined;
let provisioningTimings: string[] = [];

export function getProvisioningTimings(): readonly string[] {
  return [...provisioningTimings];
}

export const testAccounts = {
  get member(): string {
    if (!member) {
      throw new Error('The member account has not been provisioned. User creation must succeed in beforeSession before accessing it.');
    }
    return member;
  },
  get details(): Readonly<TestAccountDetails> {
    if (!accountDetails) {
      throw new Error('The member account details have not been provisioned.');
    }
    return accountDetails;
  }
};

export function assertTestAccountReady(): void {
  void testAccounts.member;
}

async function provisioningStep<T>(
  environment: string,
  name: string,
  endpoint: string,
  action: () => Promise<T>,
  baseUrlKey: 'ZUUL_URL' | 'INTEGRATION_PLATFORM_BASE_URL' = 'INTEGRATION_PLATFORM_BASE_URL'
): Promise<T> {
  const prefix = userCreationProfilePrefix(environment);
  const tenant = requiredUserCreationSetting(`${prefix}TENANT_NUMBER`);
  const baseUrl = requiredUserCreationSetting(`${prefix}${baseUrlKey}`).replace(/\/+$/, '');
  const target = new URL(`${baseUrl}${endpoint.replace('{tenant}', tenant)}`);
  const resolvedEndpoint = `${target.origin}${target.pathname}`;
  const context = `[UserProvisioning][${environment}] ${name} | POST ${resolvedEndpoint}`;
  const started = Date.now();
  console.log(`${context} | START`);
  try {
    const result = await action();
    const status = result instanceof Response ? ` | HTTP ${result.status}` : '';
    const elapsed = Date.now() - started;
    provisioningTimings.push(`API: ${name} | SUCCESS${status} | ${elapsed} ms`);
    console.log(`${context} | SUCCESS${status} | ${elapsed} ms`);
    return result;
  } catch (error) {
    provisioningTimings.push(`API: ${name} | FAILED | ${Date.now() - started} ms`);
    console.error(
      `${context} | FAILED | ${Date.now() - started} ms | ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

export async function initializeTestAccountsForSpecs(specs: string[]): Promise<void> {
  member = undefined;
  provisioningTimings = [];
  if (specs.length !== 1) {
    throw new Error('Member provisioning requires exactly one spec per mobile worker.');
  }
  const specPath = specs[0].startsWith('file:') ? fileURLToPath(specs[0]) : specs[0];
  const definition = Object.values(scenarios).find(value => path.basename(value.file) === path.basename(specPath));
  if (!definition) {
    throw new Error(`No provisioning policy is registered for spec "${path.basename(specPath)}".`);
  }
  if (!definition.provisionMember) return;
  if (definition.file === scenarios['reset-password'].file) {
    if (configuredTenantNumber() !== '9998') throw new Error('Reset password requires tenant 9998 locators.');
    requiredUserCreationSetting('MAILINATOR_API_TOKEN');
  }
  if (
    definition.file === scenarios.lockout.file ||
    definition.file === scenarios['incorrect-password-once'].file
  ) {
    const incorrectPassword = requiredSetting('INCORRECT_APP_PASSWORD', 'APP_INCORRECT_PASSWORD');
    if (incorrectPassword === requiredSetting('APP_PASSWORD')) {
      throw new Error('INCORRECT_APP_PASSWORD must differ from APP_PASSWORD for incorrect-password scenarios.');
    }
  }
  console.log(`[UserProvisioning] Creating member before mobile session for ${path.basename(specPath)}.`);
  await initializeTestAccounts();
  console.log(`[UserProvisioning] Member ready for ${path.basename(specPath)}; mobile session may start.`);
}

export async function initializeTestAccounts(): Promise<void> {
  member = undefined;
  accountDetails = undefined;
  const environment = (userCreationSetting('VG_ENVIRONMENT') ?? 'mdev').toLowerCase();
  if (!mobileEnvironments.some(profile => profile === environment)) {
    throw new Error(`VG_ENVIRONMENT must be one of: ${mobileEnvironments.join(', ')}.`);
  }
  const prefix = userCreationProfilePrefix(environment);
  const loginPrefix = requiredUserCreationSetting(`${prefix}LOGIN_PREFIX`);
  requiredSetting('APP_PASSWORD');
  for (const key of ['ZUUL_URL', 'TENANT_NUMBER', 'INTEGRATION_PLATFORM_BASE_URL', 'EMAIL_DOMAIN', 'VITALITY_PRODUCT_KEY']) {
    requiredUserCreationSetting(`${prefix}${key}`);
  }
  requiredUserCreationSetting('configUserAgent');
  for (const key of ['API_BASIC_AUTH', 'API_BEARER_TOKEN']) {
    const value = requiredUserCreationSetting(`${prefix}${key}`).replace(/^(Basic|Bearer)\s+/i, '');
    if (!value || value === '******') {
      throw new Error(`Provide a valid ${prefix}${key} before provisioning the member account.`);
    }
  }
  const carrierPartyId = await provisioningStep(environment, 'Party creation',
    '/party-core-management/svc/{tenant}/createPartyCore/1', createPartyCore, 'ZUUL_URL');
  const user = await provisioningStep(environment, 'Enrolment',
    '/vitality-enrolment-services-service-1/1.0/svc/{tenant}/instructionBasedEnrolment',
    () => enrolUser(carrierPartyId));
  await provisioningStep(environment, 'Registration',
    '/tstc-integration-platform-services-service-v1/1.0/register', () => registerUser(user));
  await provisioningStep(environment, 'Vitality status calculation',
    '/vitality-manage-vitality-status-service-1/svc/{tenant}/calculateVitalityStatus/{membershipId}',
    () => calculateVitalityStatus(user.vitalityMembershipId), 'ZUUL_URL');
  //await loginUser(user.userName);
  const instructions = await provisioningStep(environment, 'Get user instructions',
    '/vitality-manage-user-service-1/svc/{tenant}/getUserInstruction',
    () => getUserInstruction(user.userName), 'ZUUL_URL');
  await provisioningStep(environment, 'Capture login events',
    '/vitality-manage-user-service-v1/1.0/svc/{tenant}/captureLoginEvents/{partyId}',
    () => captureLoginEvents(user.partyId, instructions.LOGIN_T_AND_C_ID));
  // Reward-event creation is disabled while tenant 34 rejects this request.
  // await provisioningStep(environment, 'Create reward event',
  //   '/vitality-manage-rewards-service/1.0/svc/{tenant}/processEventToCreateReward',
  //   () => processEventToCreateReward(user.partyId));
  await provisioningStep(environment, 'Process events',
    '/vitality-manage-events-service-v1/1.0/svc/{tenant}/processEvents', () => processEvents(user.partyId));
  await provisioningStep(environment, 'Delete onboarding instructions',
    '/vitality-manage-user-service-v1/1.0/svc/{tenant}/deleteUserInstruction',
    () => deleteUserInstruction(user.userName, instructions));
  printUserDetails(user);
  member = `${loginPrefix}${user.userName}`;
  accountDetails = Object.freeze({
    partyId: user.partyId,
    insurerCode: user.insurerCode,
    dateOfBirth: user.bornOn,
    memberUsername: member
  });
  console.log(`Member username: ${member}`);
}