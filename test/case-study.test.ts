import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { FlawedBaseline } from '../src/baseline/flawed.js';
import { DeterministicMockProvider } from '../src/provider.js';
import { OrderStore } from '../src/store.js';

const event = { eventId: 'evt-001', orderId: 'ord-001', amountCents: 1200 };
const stores: OrderStore[] = [];
const directories: string[] = [];
afterEach(() => { stores.splice(0).forEach((store) => store.close()); directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });

function fixture(script: ConstructorParameters<typeof DeterministicMockProvider>[0] = ['ok'], timeout = 50, store = new OrderStore()) {
  stores.push(store); const provider = new DeterministicMockProvider(script);
  return { app: createApp(store, provider, timeout), store, provider };
}
async function request(app: ReturnType<typeof createApp>, body: unknown, raw = false) {
  const server = app.listen(0);
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('test server unavailable');
    return await fetch(`http://127.0.0.1:${address.port}/webhooks/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? String(body) : JSON.stringify(body) });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

describe('SYNTHETIC INTENTIONALLY FLAWED BASELINE — known-bad reproduction, never deploy', () => {
  it('baseline duplicate race creates duplicate records', async () => {
    const base = new FlawedBaseline(new DeterministicMockProvider(['ok'])); await Promise.all([base.receive(event), base.receive(event)]); expect(base.orders).toHaveLength(2);
  });
  it('baseline retries ordinary 4xx but stops retrying after a success', async () => {
    const failing = new DeterministicMockProvider(['400']); await new FlawedBaseline(failing).receive(event); expect(failing.attempts).toBe(2);
    const succeeding = new DeterministicMockProvider(['ok']); await new FlawedBaseline(succeeding).receive(event); expect(succeeding.attempts).toBe(1);
  });
});

describe('fixed webhook API', () => {
  it('returns health', async () => { const { app } = fixture(); const server = app.listen(0); const address = server.address() as import('node:net').AddressInfo; const response = await fetch(`http://127.0.0.1:${address.port}/health`); await new Promise<void>((resolve) => server.close(() => resolve())); expect(await response.json()).toEqual({ status: 'ok' }); });
  it('persists a delivery once and explains completed duplicates', async () => { const { app, store, provider } = fixture(); expect((await request(app, event)).status).toBe(201); expect((await request(app, event)).status).toBe(200); expect(store.orderCount()).toBe(1); expect(store.eventStatus(event.eventId)).toBe('completed'); expect(provider.sideEffectCount).toBe(1); });
  it('rejects a reused eventId with a different orderId before another provider side effect', async () => {
    const { app, provider } = fixture(); expect((await request(app, event)).status).toBe(201);
    const response = await request(app, { ...event, orderId: 'ord-other' });
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: 'idempotency identity conflict' }); expect(provider.sideEffectCount).toBe(1);
  });
  it('rejects a reused eventId with a different amountCents before another provider side effect', async () => {
    const { app, provider } = fixture(); expect((await request(app, event)).status).toBe(201);
    expect((await request(app, { ...event, amountCents: 1300 })).status).toBe(409); expect(provider.sideEffectCount).toBe(1);
  });
  it('rejects a different eventId for a completed order before another provider side effect', async () => {
    const { app, provider } = fixture(); expect((await request(app, event)).status).toBe(201);
    expect((await request(app, { ...event, eventId: 'evt-other' })).status).toBe(409); expect(provider.sideEffectCount).toBe(1);
  });
  it('returns processing for same-process concurrent duplicate without a second charge', async () => { const { app, store, provider } = fixture(['delay-ok'], 100); const responses = await Promise.all([request(app, event), request(app, event)]); expect(responses.map((r) => r.status).sort()).toEqual([201, 202]); expect(store.orderCount()).toBe(1); expect(provider.sideEffectCount).toBe(1); });
  it('uses a durable claim across two SQLite connections', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orders-')); directories.push(dir); const path = join(dir, 'nested', 'orders.sqlite');
    const first = new OrderStore(path); const second = new OrderStore(path); stores.push(first, second); const provider = new DeterministicMockProvider(['delay-ok']);
    const responses = await Promise.all([request(createApp(first, provider, 100), event), request(createApp(second, provider, 100), event)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 202]); expect(first.orderCount()).toBe(1); expect(first.eventCount()).toBe(1); expect(first.eventStatus(event.eventId)).toBe('completed'); expect(provider.sideEffectCount).toBe(1);
  });
  it('allows only one concurrent business operation for different eventIds across SQLite connections', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orders-')); directories.push(dir); const path = join(dir, 'orders.sqlite');
    const first = new OrderStore(path); const second = new OrderStore(path); stores.push(first, second); const provider = new DeterministicMockProvider(['delay-ok']);
    const responses = await Promise.all([request(createApp(first, provider, 100), event), request(createApp(second, provider, 100), { ...event, eventId: 'evt-other' })]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]); expect(first.orderCount()).toBe(1); expect(provider.sideEffectCount).toBe(1);
  });
  it('releases a failed local completion and redelivery preserves one provider side effect', async () => {
    let fail = true; const store = new OrderStore(':memory:', () => { if (fail) { fail = false; throw new Error('synthetic sqlite failure'); } }); const { app, provider } = fixture(['ok'], 50, store);
    expect((await request(app, event)).status).toBe(500); expect(store.orderCount()).toBe(0); expect(store.eventCount()).toBe(0);
    expect((await request(app, event)).status).toBe(201); expect(store.orderCount()).toBe(1); expect(provider.attempts).toBe(2); expect(provider.sideEffectCount).toBe(1);
  });
  it('safely completes a different-event redelivery after local completion failure with one provider side effect', async () => {
    let fail = true; const store = new OrderStore(':memory:', () => { if (fail) { fail = false; throw new Error('synthetic sqlite failure'); } }); const { app, provider } = fixture(['ok'], 50, store);
    expect((await request(app, event)).status).toBe(500); expect(store.eventCount()).toBe(0);
    const redelivery = { ...event, eventId: 'evt-redelivery' };
    expect((await request(app, redelivery)).status).toBe(201); expect(store.orderCount()).toBe(1); expect(store.eventStatus(redelivery.eventId)).toBe('completed'); expect(provider.sideEffectCount).toBe(1);
  });
  it('rejects semantic malformed payload', async () => { const { app, store } = fixture(); expect((await request(app, { eventId: 'x' })).status).toBe(400); expect(store.orderCount()).toBe(0); });
  it('returns generic JSON for malformed JSON syntax', async () => { const { app } = fixture(); const response = await request(app, '{not json', true); expect(response.status).toBe(400); const body = await response.text(); expect(body).toContain('invalid JSON body'); expect(body).not.toContain('<html'); expect(body).not.toContain('SyntaxError'); });
  it('bounds oversized JSON requests', async () => { const { app } = fixture(); const response = await request(app, { eventId: 'x', orderId: 'y', amountCents: 1, padding: 'x'.repeat(33 * 1024) }); expect(response.status).toBe(413); expect((await response.text())).not.toContain('<html'); });
  it('retries transient failure then succeeds', async () => { const { app, provider } = fixture(['500', 'ok']); expect((await request(app, event)).status).toBe(201); expect(provider.attempts).toBe(2); });
  it('does not retry ordinary 4xx', async () => { const { app, provider } = fixture(['400']); expect((await request(app, event)).status).toBe(500); expect(provider.attempts).toBe(1); });
  it('bounds a hanging attempt with timeout', async () => { const { app, provider } = fixture(['hang', 'hang'], 5); expect((await request(app, event)).status).toBe(500); expect(provider.attempts).toBe(2); });
  it('returns generic public 500 with no provider detail or stack', async () => { const { app } = fixture(['400']); const response = await request(app, event); const body = await response.text(); expect(body).toContain('unable to process order'); expect(body).not.toContain('synthetic invalid card'); expect(body).not.toContain('ProviderError'); });
  it('rolls back complete transaction with no partial order', () => { const store = new OrderStore(); stores.push(store); store.claim(event); expect(() => store.complete(event, () => { throw new Error('synthetic sqlite failure'); })).toThrow(); expect(store.orderCount()).toBe(0); expect(store.eventStatus(event.eventId)).toBe('processing'); });
  it('creates a fresh nested SQLite parent path', () => { const dir = mkdtempSync(join(tmpdir(), 'orders-')); directories.push(dir); const store = new OrderStore(join(dir, 'a', 'b', 'orders.sqlite')); stores.push(store); expect(store.claim(event)).toBe('claimed'); });
});
