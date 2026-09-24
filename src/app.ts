import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { chargeWithRetry } from './retry.js';
import { OrderStore } from './store.js';
import type { OrderProvider } from './types.js';

const eventSchema = z.object({ eventId: z.string().min(1), orderId: z.string().min(1), amountCents: z.number().int().positive() }).strict();

export function createApp(store: OrderStore, provider: OrderProvider, timeoutMs = 50) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.post('/webhooks/orders', async (req: Request, res: Response) => {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid webhook payload' });
    let claim: 'claimed' | 'processing' | 'duplicate' | 'conflict' | undefined;
    try {
      claim = store.claim(parsed.data);
      if (claim === 'conflict') return res.status(409).json({ error: 'idempotency identity conflict' });
      if (claim === 'processing') return res.status(202).json({ status: 'processing', eventId: parsed.data.eventId });
      if (claim === 'duplicate') return res.status(200).json({ status: 'duplicate', eventId: parsed.data.eventId });
      await chargeWithRetry(provider, parsed.data, timeoutMs);
      store.complete(parsed.data);
      return res.status(201).json({ status: 'created', eventId: parsed.data.eventId });
    } catch {
      if (claim === 'claimed') store.release(parsed.data.eventId);
      return res.status(500).json({ error: 'unable to process order' });
    }
  });
  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : 500;
    if (status === 413) return res.status(413).json({ error: 'request body too large' });
    if (status === 400) return res.status(400).json({ error: 'invalid JSON body' });
    return res.status(500).json({ error: 'unable to process order' });
  });
  return app;
}
