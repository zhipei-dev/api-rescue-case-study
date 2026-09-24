# Before / after evidence

| Scenario | Baseline evidence | Fixed evidence |
| --- | --- | --- |
| Duplicate race | baseline test asserts two records | durable claim returns processing/duplicate and one provider side effect |
| Identity conflict | no event/payload or business-operation binding | changed payload under an event ID and a new event ID for an existing order return 409 before provider work |
| Completion retry | no provider idempotency contract | redelivery, including a new event ID after released completion failure, has one `orderId`-keyed mock provider side effect |
| Malformed payload | unchecked cast reaches provider | HTTP 400 before store write |
| Ordinary 4xx | baseline makes two attempts | fixed makes one attempt |
| Timeout | no cancellation boundary | hang test uses cooperative abort deadlines; production adapter must cancel real I/O |
| Error response | raw error string | generic 500 asserts no provider detail |
| Transaction failure | no atomic guarantee | rollback test asserts zero event/order rows |

Run `npm.cmd test` to verify these statements. These are behavioral tests, not performance benchmarks.
