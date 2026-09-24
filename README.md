# API Rescue Case Study

A synthetic rescue of a TypeScript order webhook that looked fine on a happy path but was unsafe under duplicate delivery, failures, and malformed input. It represents no customer, production deployment, revenue, SLA, or benchmark.

## Client fit

Relevant proof for AI-generated / vibe-coded application rescue, webhook/API reliability work, duplicate-side-effect bugs, retry/timeout failures, concurrency defects, missing validation, transaction-boundary problems, and test/CI stabilization.

## What broke and why it mattered

The isolated **synthetic intentionally flawed baseline** accepted arbitrary payloads, had a check-then-write race, repeated ordinary 4xx failures, had no per-attempt timeout, and exposed raw errors. A replayed webhook could therefore create a second order-side record; retries and error responses made failures noisier and less safe.

## Root cause and change

The rescue moves validation to the HTTP boundary, durably claims one order operation in SQLite *before* the provider call, then transactionally creates the order and completes its event. `eventId` is transport/webhook delivery identity; for this synthetic one-charge-per-order endpoint, `orderId` is the stable business-operation and provider-idempotency identity. Only 5xx, 408, 429, and explicitly transient non-HTTP errors retry. Public failures are generic.

See [the root-cause analysis](docs/ROOT_CAUSE_ANALYSIS.md), [before/after evidence](docs/BEFORE_AFTER.md), and [architecture](docs/ARCHITECTURE.md).

## Reproduce and validate

Requires Node 24.

```sh
npm ci --no-fund
npm run typecheck
npm test
npm run build
npm audit
```

On Windows where `npm.ps1` is blocked, `npm.cmd` is equivalent. No private cache path is required.

The tests named `SYNTHETIC INTENTIONALLY FLAWED BASELINE` pass by asserting known-bad behavior. They are evidence, not approval of the baseline. The fixed route is `POST /webhooks/orders` with `eventId`, `orderId`, and positive integer `amountCents`; `GET /health` returns service status.

## Limitations

This is a local educational case study. The per-attempt deadline is cooperative cancellation, not an unconditional hard kill: production adapters must honor `AbortSignal` by cancelling their real network request. A crash can leave a processing claim; production needs a stale-processing lease/reconciliation policy, a provider with `orderId` idempotency-key support, and, where appropriate, a durable workflow/outbox. See [security and limitations](docs/SECURITY_AND_LIMITATIONS.md).
