import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { server } from '../../scripts/serve-allure-report.js';

class FakeOption {
  constructor(public text: string, public value: string) {}
}

class FakeElement {
  options: FakeOption[] = [];
  value = '';
  disabled = false;
  textContent = '';
  listeners = new Map<string, () => void>();

  addEventListener(event: string, listener: () => void): void {
    this.listeners.set(event, listener);
  }

  add(option: FakeOption): void {
    this.options.push(option);
  }

  replaceChildren(...options: FakeOption[]): void {
    this.options = options;
    this.value = options[0]?.value ?? '';
  }
}

test('report UI selects configured tenants and updates environment choices', async t => {
  const settings = {
    VG_MDEV_TENANT_NUMBER: '34',
    VG_UAT_TENANT_NUMBER: '34',
    VG_T9998_MDEV_TENANT_NUMBER: '9998',
    VG_CA_TEST_TENANT_NUMBER: '9998',
    VG_CA_DEV_TENANT_NUMBER: '9998'
  };
  const previous = new Map(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const page = await (await fetch(baseUrl)).text();
  const response = await fetch(`${baseUrl}/api/filter-options`);
  assert.equal(response.status, 200);
  const options = await response.json();
  const script = /<script>([\s\S]*?)<\/script>/.exec(page)?.[1];
  assert.ok(script);

  const elements = new Map(['filters', 'generate', 'status', 'report', 'tenant', 'environment']
    .map(name => [`#${name}`, new FakeElement()]));
  const tenant = elements.get('#tenant')!;
  const environment = elements.get('#environment')!;
  tenant.add(new FakeOption('All tenants', ''));
  runInNewContext(script, {
    document: { querySelector: (selector: string) => elements.get(selector) },
    Option: FakeOption,
    fetch: async () => ({ ok: true, json: async () => options })
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(tenant.options.map(option => option.value), ['', '34', '9998']);
  assert.equal(elements.get('#generate')!.disabled, false);

  tenant.value = '34';
  tenant.listeners.get('change')!();
  assert.deepEqual(environment.options.map(option => option.text), ['All environments', 'MDEV', 'UAT']);
  environment.value = 'uat';
  tenant.value = '9998';
  tenant.listeners.get('change')!();
  assert.deepEqual(environment.options.map(option => option.value), ['', 'ca-test', 'ca-dev', 'mdev-9998']);
  assert.equal(environment.value, '');
  tenant.value = '';
  tenant.listeners.get('change')!();
  assert.deepEqual(environment.options.map(option => option.value), ['', 'ca-test', 'ca-dev', 'mdev', 'uat', 'mdev-9998']);
});
