# Root-cause analysis

| Failure | Root cause | Corrective control |
| --- | --- | --- |
| Duplicate order | check-then-write in memory and event-only identity | durable SQLite `processing` claim with unique `order_id` before provider call |
| Cross-worker race | in-process coordination cannot coordinate workers | primary-key claim and busy timeout across SQLite connections |
| External duplicate charge | SQLite cannot atomically commit a provider call | provider must receive stable `orderId` as its idempotency key |
| Invalid input | unchecked cast | Zod `safeParse` before work |
| Retry storm | all failures treated alike | explicit transient classifier, max 2 |
| Hung call | no cancellation boundary | cooperative `AbortController` abort deadline per attempt; adapter cancels real I/O |
| Detail leak | raw `Error` string response | fixed public 500 response |

`eventId` identifies a webhook delivery. `orderId` identifies the one chargeable business operation in this synthetic endpoint. The claim transaction returns a public conflict for a reused event ID with changed payload or a new event ID for an already active/completed order; neither case reaches the provider. The completion transaction inserts the order and marks the claimed event completed together. On provider or completion failure the route releases its processing claim so redelivery can retry; after completion failure, a new event ID can safely complete because the provider also deduplicates by `orderId`. This does not solve crash recovery: production also needs a stale-processing lease/reconciliation process, provider idempotency support, and potentially a durable workflow/outbox.
