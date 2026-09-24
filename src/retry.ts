import { ProviderError } from './provider.js';
import type { OrderEvent, OrderProvider } from './types.js';

export const MAX_ATTEMPTS = 2;

export function isTransient(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return false;
  return error.transient || error.status === 408 || error.status === 429 || (error.status !== undefined && error.status >= 500);
}

export async function chargeWithRetry(provider: OrderProvider, order: OrderEvent, timeoutMs = 50): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    // This is a cooperative abort deadline. A production adapter must translate
    // AbortSignal into cancellation of its underlying network operation.
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await provider.charge(order, controller.signal);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === MAX_ATTEMPTS) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
