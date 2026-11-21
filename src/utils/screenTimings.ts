import { executionReporter } from './ExecutionReporter.js';

export function instrumentScreen(prototype: object, screenName: string): void {
  for (const name of Object.getOwnPropertyNames(prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor || typeof descriptor.value !== 'function') continue;
    const original: (...args: never[]) => Promise<unknown> = descriptor.value;
    Object.defineProperty(prototype, name, {
      ...descriptor,
      value: function (this: unknown, ...args: never[]) {
        return executionReporter.timeStep(`${screenName}.${name}`, () => original.apply(this, args));
      }
    });
  }
}
