/** SYNTHETIC INTENTIONALLY FLAWED BASELINE — NEVER DEPLOY OR IMPORT FROM THE SERVER. */
import type { OrderEvent, OrderProvider } from '../types.js';

export class FlawedBaseline {
  public orders: OrderEvent[] = [];
  constructor(private readonly provider: OrderProvider) {}
  async receive(payload: unknown): Promise<void> {
    const event = payload as OrderEvent; // no boundary validation
    if (!this.orders.some((x) => x.eventId === event.eventId)) {
      await Promise.resolve(); // check-then-write race window
      this.orders.push(event); // duplicate side effect
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { await this.provider.charge(event, new AbortController().signal); return; } catch { /* retries every failure; no timeout */ }
    }
  }
  expose(error: unknown) { return String(error); } // raw internal detail leakage
}
