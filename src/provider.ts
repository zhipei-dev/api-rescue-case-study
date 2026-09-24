import type { OrderEvent, OrderProvider } from './types.js';

export class ProviderError extends Error {
  constructor(public readonly status: number | undefined, message: string, public readonly transient = false) {
    super(message);
    this.name = 'ProviderError';
  }
}

type Outcome = 'ok' | 'delay-ok' | '500' | '400' | 'hang' | 'network';
/** Test-only adapter modelling a provider using order.orderId as idempotency key. */
export class DeterministicMockProvider implements OrderProvider {
  public attempts = 0;
  public sideEffectCount = 0;
  private readonly succeededOrderIds = new Set<string>();
  constructor(private readonly script: Outcome[] = ['ok'], private readonly delayMs = 15) {}

  async charge(order: OrderEvent, signal: AbortSignal): Promise<void> {
    this.attempts += 1;
    if (this.succeededOrderIds.has(order.orderId)) return;
    const outcome = this.script[Math.min(this.attempts - 1, this.script.length - 1)];
    if (outcome === 'delay-ok') await this.delay(signal);
    if (outcome === 'ok' || outcome === 'delay-ok') { this.succeededOrderIds.add(order.orderId); this.sideEffectCount += 1; return; }
    if (outcome === '500') throw new ProviderError(500, 'synthetic provider failure', true);
    if (outcome === '400') throw new ProviderError(400, 'synthetic invalid card detail', false);
    if (outcome === 'network') throw new ProviderError(undefined, 'synthetic connection reset', true);
    await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new ProviderError(undefined, 'synthetic timeout', true)), { once: true }));
  }
  private delay(signal: AbortSignal) { return new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, this.delayMs); signal.addEventListener('abort', () => { clearTimeout(timer); reject(new ProviderError(undefined, 'synthetic timeout', true)); }, { once: true }); }); }
}
