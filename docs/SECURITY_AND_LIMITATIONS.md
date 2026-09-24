# Security and limitations

No real provider, credential, customer data, or external API is used. Public errors are intentionally generic; detailed server logging is deliberately out of scope for this compact case study.

Before production use, add webhook signature verification, authentication/authorization, rate limiting, encrypted secret management, structured redacted logs, metrics, migrations/backups, retention policy, provider reconciliation, and a durable cross-process workflow design. This app durably claims `processing` before the provider call: `eventId` is transport identity, while `orderId` is the one-charge-per-order business-operation identity and required provider idempotency key. The per-attempt `AbortSignal` is a cooperative abort deadline, not a hard kill; the production adapter must map it to real network cancellation. That still cannot cover a crash between systems: add stale-processing leases/reconciliation and, where appropriate, a durable workflow/outbox.
