# Architecture

```mermaid
flowchart LR
  C[Webhook delivery] --> V[Zod validation]
  V -->|invalid| R400[Public 400]
  V --> C[SQLite durable claim: eventId + unique orderId]
  C -->|completed| D[200 duplicate]
  C -->|processing| Q[202 processing]
  C -->|identity conflict| R409[Public 409]
  C -->|claimed| P[Provider: orderId idempotency key, cooperative abort deadline + retry]
  P --> T[SQLite transaction: order + completed]
  T --> R[201 created]
  P --> E[Generic public 500]
```

`webhook_events.event_id` is the unique transport-delivery identity and `webhook_events.order_id` is unique for the active/completed business operation. A matching event is processing/duplicate according to status; a changed payload under that event ID, or another event ID for the order, is a deterministic public 409 and does not call the provider. Only a newly claimed operation calls the provider; completion atomically inserts the order and marks its event `completed`. The provider contract must use `orderId` as its idempotency key because SQLite cannot atomically commit an external side effect. Its `AbortSignal` deadline is cooperative, so production adapters must map it to actual network cancellation. The mock has no network implementation. Crash recovery still needs stale-claim leasing/reconciliation and, where suitable, a durable workflow/outbox.
