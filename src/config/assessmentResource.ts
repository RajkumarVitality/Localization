import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { configuredTenantNumber } from './userCreation.js';

interface AssessmentQuestion {
  Name: string;
  Type: string;
  Values?: string[];
}

interface AssessmentSection {
  Name: string;
  Questions: AssessmentQuestion[];
}

export interface AssessmentDocument {
  'Mental health assessment': {
    Count: number;
    Sections: AssessmentSection[];
  };
}

export function assessmentResourceUrl(resourceName: string): URL {
  if (!resourceName.trim()) {
    throw new TypeError('Assessment resource name must not be blank');
  }
  const tenantNumber = configuredTenantNumber();
  if (!/^\d+$/.test(tenantNumber)) {
    throw new TypeError(`Invalid assessment tenant number: ${tenantNumber}`);
  }
  return new URL(`../../tests/fixtures/T${tenantNumber}/${path.basename(resourceName)}`, import.meta.url);
}

export async function loadAssessmentResource(resourceName: string): Promise<AssessmentDocument> {
  return JSON.parse(await readFile(assessmentResourceUrl(resourceName), 'utf8')) as AssessmentDocument;
}
