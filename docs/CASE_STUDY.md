# Case study

This synthetic incident starts with an AI/vibe-coded webhook endpoint that handled one valid request. The rescue preserves the bad code in `src/baseline/` solely to make the defects reproducible. The shipped entry point is `src/server.ts`; baseline code is never imported there.

The result is a small, inspectable handoff: boundary validation, a durable database claim before any provider call, event ID payload binding plus one active/completed `orderId` operation, provider idempotency keyed by `orderId`, transaction rollback, retry classification, cooperative abort deadlines, error hygiene, and deterministic regression tests. `eventId` remains transport identity; `orderId` is business-operation identity for this one-charge-per-order endpoint. It intentionally does not claim crash recovery is complete: production requires stale-processing reconciliation and may require a durable workflow/outbox.
