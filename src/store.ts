import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { OrderEvent } from './types.js';

export type ClaimResult = 'claimed' | 'processing' | 'duplicate' | 'conflict';

export class OrderStore {
  private readonly db: DatabaseSync;
  constructor(filename = ':memory:', private readonly beforeOrderInsert?: () => void) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA busy_timeout = 1000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, amount_cents INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('processing', 'completed')));
      CREATE TABLE IF NOT EXISTS orders (order_id TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL);`);
  }
  claim(event: OrderEvent): ClaimResult {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existingEvent = this.db.prepare('SELECT order_id, amount_cents, status FROM webhook_events WHERE event_id = ?').get(event.eventId) as { order_id: string; amount_cents: number; status: string } | undefined;
      if (existingEvent) {
        this.db.exec('COMMIT');
        if (existingEvent.order_id !== event.orderId || existingEvent.amount_cents !== event.amountCents) return 'conflict';
        return existingEvent.status === 'completed' ? 'duplicate' : 'processing';
      }
      const existingOrder = this.db.prepare('SELECT event_id FROM webhook_events WHERE order_id = ?').get(event.orderId);
      if (existingOrder) { this.db.exec('COMMIT'); return 'conflict'; }
      this.db.prepare("INSERT INTO webhook_events(event_id, order_id, amount_cents, status) VALUES (?, ?, ?, 'processing')")
        .run(event.eventId, event.orderId, event.amountCents);
      this.db.exec('COMMIT');
      return 'claimed';
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  complete(event: OrderEvent, beforeOrderInsert = this.beforeOrderInsert): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT status FROM webhook_events WHERE event_id = ?').get(event.eventId) as { status: string } | undefined;
      if (!row || row.status !== 'processing') throw new Error('event is not claimed for completion');
      beforeOrderInsert?.();
      this.db.prepare('INSERT INTO orders(order_id, amount_cents) VALUES (?, ?)').run(event.orderId, event.amountCents);
      this.db.prepare("UPDATE webhook_events SET status = 'completed' WHERE event_id = ?").run(event.eventId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  release(eventId: string): void { this.db.prepare("DELETE FROM webhook_events WHERE event_id = ? AND status = 'processing'").run(eventId); }
  hasEvent(eventId: string): boolean {
    return this.eventStatus(eventId) !== undefined;
  }
  eventStatus(eventId: string): 'processing' | 'completed' | undefined {
    return (this.db.prepare('SELECT status FROM webhook_events WHERE event_id = ?').get(eventId) as { status: 'processing' | 'completed' } | undefined)?.status;
  }
  orderCount() { return Number(this.db.prepare('SELECT count(*) AS count FROM orders').get()?.count ?? 0); }
  eventCount() { return Number(this.db.prepare('SELECT count(*) AS count FROM webhook_events').get()?.count ?? 0); }
  close() { this.db.close(); }
}
