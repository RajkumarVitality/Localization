import { setting } from './mobileSessionInit.js';
import { userCreationSetting } from './userCreation.js';

const diagnosticFields = new Set([
  'error', 'errors', 'message', 'description', 'detail', 'title', 'code',
  'errorcode', 'errormessage', 'errordescription', 'validationerrors'
]);

export async function provisioningFailure(
  response: Response,
  message: string,
  privateValues: Array<string | number> = []
): Promise<Error> {
  const secrets = [...privateValues.map(String), setting('APP_PASSWORD') ?? ''];
  for (const profile of ['MDEV', 'T9998_MDEV', 'CA_TEST', 'CA_DEV', 'UAT']) {
    for (const suffix of ['API_BEARER_TOKEN', 'API_BASIC_AUTH']) {
      const value = userCreationSetting(`VG_${profile}_${suffix}`);
      if (value) secrets.push(value, value.replace(/^(Basic|Bearer)\s+/i, ''));
    }
  }
  const redact = (value: string): string => {
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
      value = value.split(secret).join('[REDACTED]');
    }
    return value
      .replace(/\b(?:Bearer|Basic)\s+\S+/gi, '[REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED]')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[REDACTED]')
      .replace(/\b\d{5,}\b/g, '[REDACTED]')
      .replace(/\b(?:password|token|authorization|secret|cookie)\b\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/gi, '[REDACTED]')
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  };
  const diagnostics = (value: unknown, depth = 0): unknown => {
    if (depth > 6) return '[omitted]';
    if (typeof value === 'string') return redact(value).slice(0, 512);
    if (Array.isArray(value)) return value.slice(0, 10).map(item => diagnostics(item, depth + 1));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .filter(([key]) => diagnosticFields.has(key.toLowerCase()))
        .map(([key, item]) => [key, diagnostics(item, depth + 1)]));
    }
    return '[omitted]';
  };

  // Only expose diagnostic JSON fields; gateways can echo entire requests in errors.
  const reader = response.body?.getReader();
  if (!reader) return new Error(`${message} Server response: [empty].`);
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) return new Error(`${message} Server response: [body read timed out].`);
      if (done) break;
      length += value.byteLength;
      if (length > 16_384) {
        await reader.cancel();
        return new Error(`${message} Server response: [oversized body omitted].`);
      }
      chunks.push(value);
    }
  } catch (cause) {
    return new Error(`${message} Server response could not be read.`, { cause });
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return new Error(`${message} Server response: [empty].`);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    return new Error(`${message} Server response: [non-JSON body omitted].`);
  }
  const detail = body && typeof body === 'object' && !Array.isArray(body)
    ? JSON.stringify(diagnostics(body))
    : '[non-object body omitted]';
  return new Error(`${message} Server response: ${detail.slice(0, 2048)}${detail.length > 2048 ? ' [truncated]' : ''}`);
}
