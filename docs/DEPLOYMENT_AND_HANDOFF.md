# Deployment and handoff

This repository is not a deployment artifact. For local use copy `.env.example`, select a writable SQLite path, run `npm run build`, then run the compiled server with Node 24. Do not use `src/baseline/` as an entry point.

Handoff checklist: run `npm ci --no-fund`, `npm run typecheck`, `npm test`, `npm run build`, and `npm audit`; review the limitations; configure authentication and signature verification before exposure; define backup, migrations, monitoring, secret rotation, stale-processing lease/reconciliation, provider `orderId` idempotency support, real-network `AbortSignal` cancellation, and durable workflow/outbox ownership where appropriate.
