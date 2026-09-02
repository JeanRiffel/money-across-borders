# Resilience patterns

This project demonstrates a small set of distributed-systems resilience patterns around two kinds of
unreliable operation: a synchronous call to an external HTTP provider, and asynchronous RabbitMQ message
processing. Both are implemented entirely in `infra/` — the application layer only ever sees a port
(`ExchangeRateProvider`) or a plain message handler, never a hint of which HTTP client, retry library, or
circuit-breaker implementation backs them. See the "Resilience" bullet in [architecture.md](architecture.md)
for where each piece lives in the tree.

## Why timeout, retry, backoff, and circuit breaker are different concerns

It's tempting to fold these into one "resilience" blob, but they answer different questions and fail
independently if conflated:

- **Timeout** answers "how long am I willing to wait for one attempt?" — nothing to do with whether that
  attempt is retried afterward.
- **Retry** answers "given this attempt failed, is it worth trying again at all?" — a classification
  question (see below), independent of timing.
- **Backoff + jitter** answers "if I am retrying, how long do I wait first?" — spacing, not a retry/no-retry
  decision.
- **Circuit breaker** answers a different question entirely: "has this provider been failing enough,
  recently, that trying again at all is more likely to hurt than help?" It's a judgment about the
  *provider's* health across many calls, not about any one call.

Each is implemented as its own small piece (`resilient-http-client.ts` composes them via three separate
`cockatiel` policies) so each can be reasoned about, configured, and tested on its own.

## What's retried, and why (`retry-classifier.ts`)

`isRetryableError()` is a pure function, independent of `cockatiel`, the use case, and the transport:

| Failure | Retried? | Why |
|---|---|---|
| Timeout (`ExternalCallTimeoutError`) | Yes | The provider may simply have been slow this one time. |
| Connection failure / DNS failure | Yes | Same reasoning — likely transient. |
| HTTP 408, 429 | Yes | Request timeout / rate-limited — both are explicitly "try again". |
| HTTP 500, 502, 503, 504 | Yes | The classic transient server-side family. |
| HTTP 400, 401, 403, 404, 422, ... (any other 4xx) | **No** | A business/client error — the request itself is wrong; retrying sends the same wrong request again. |

Retrying a 4xx would silently mask a bug (a malformed request, bad auth) as a flaky network — the issue this
project is built to demonstrate explicitly calls that out as a mistake to avoid.

Node's global `fetch()` throws a plain `TypeError` (with a `.cause.code` like `ECONNREFUSED`) for
connection-level failures rather than a distinct class, and — notably — that `TypeError` was observed
**failing `instanceof TypeError` checks under Jest's node test environment specifically** (a realm/vm-context
mismatch between the object `fetch()` constructs and the `TypeError` this module's own code references).
`retry-classifier.ts` duck-types on `.name`/`.message`/`.cause` instead of using `instanceof` for exactly
this reason — a lesson learned from this feature's own test suite, not a hypothetical.

## Why jitter

Exponential backoff alone (`attempt 1 → base`, `attempt 2 → base×2`, `attempt 3 → base×4`, ...) is
deterministic: if many clients hit a timeout at the same moment (e.g. the provider just recovered from an
outage and everyone's first retry lands on the same tick), their *retries* also land in lock-step, producing
a synchronized retry storm right as the provider is trying to recover — a thundering herd. `backoff.ts`
(`computeBackoffDelayMs`) adds a bounded random jitter **on top of** the exponential delay (never
subtracted, so jitter only ever spreads retries further apart, never brings them closer together) to
desynchronize concurrent retriers. It's a pure function with an injectable random source specifically so its
bounds are testable without flaky, real-random assertions.

## Circuit breaker

`resilient-http-client.ts` wraps the retrying call sequence — not each individual attempt — in a circuit
breaker (`ConsecutiveBreaker`), so one logical `fetchJson()` call (win or lose after all its own retries)
counts as one success/failure toward the breaker's threshold:

```
CLOSED --(N consecutive failures)--> OPEN --(reset timeout elapses)--> HALF_OPEN
   ^                                                                        |
   |-------------------- probe succeeds ---------------------------------- |
   |                                                                        v
   +-------------------------------- probe fails --------------------> OPEN
```

- **CLOSED**: calls go through normally; failures increment a counter.
- **OPEN**: calls are rejected immediately (`CircuitOpenError`) without ever reaching the provider — the
  point of the breaker: stop making a struggling provider's day worse, and stop paying the latency cost of
  a call that's likely to fail anyway.
- **HALF_OPEN**: after `CIRCUIT_BREAKER_RESET_TIMEOUT_MS`, exactly one probe call is allowed through. If it
  succeeds, the breaker closes; if it fails, it reopens.

State transitions are logged (`logger.info`, `{ provider, state }`) and exposed as the
`circuit_breaker_state` Prometheus gauge (0=closed, 1=open, 2=half_open), labeled by `provider`.

## Configuration

Read once at process start by `infra/resilience/resilience-config.ts` (see `.env.example` for the full list
with defaults): `HTTP_TIMEOUT_MS`, `RETRY_MAX_ATTEMPTS`, `RETRY_BASE_DELAY_MS`, `RETRY_MAX_DELAY_MS`,
`RETRY_JITTER_MS`, `CIRCUIT_BREAKER_FAILURE_THRESHOLD`, `CIRCUIT_BREAKER_RESET_TIMEOUT_MS`. Tests never
mutate `process.env` for this — `createResilientHttpClient({ config: {...} })` accepts a per-client override
so timing stays deterministic and fast without any module-reload gymnastics (see
`resilient-http-client.test.ts`).

Note: `RETRY_MAX_ATTEMPTS` is the **total** number of attempts (first try included) — `cockatiel`'s own
`maxAttempts` option counts retries only (total = maxAttempts + 1), so `resilient-http-client.ts` translates
between the two; see its comment at the `retry()` call site.

## The FX provider demo

`ExchangeRateProvider` (`application/shared/exchange/`) already existed as this project's FX port —
`SendRemittanceUseCase` depends on it and knows nothing about HTTP, retries, or circuit breakers.
`MockExchangeRateProvider` (a static in-process rate table) remains the default implementation, so this
feature changes nothing about production behavior unless explicitly opted into.

`HttpExchangeRateProvider` (`infra/exchange/`) is a second implementation of the same port that performs a
real HTTP GET, wrapped by `resilient-http-client.ts`. Since adding a real paid FX API is an explicit
non-goal, it talks to `fake-fx-server.ts` — a small, deterministic local HTTP server (`npm run
demo:fake-fx-server`) that can script `success`, `429`, `500`/`502`/`503`, `400`/`404`, `timeout`, or
`connection-failure` responses per request (via an `X-Simulate` header, or a per-test scripted queue — see
its own tests). Switch it on with:

```
FX_PROVIDER=http
FX_PROVIDER_URL=http://localhost:4010   # wherever `npm run demo:fake-fx-server` is listening
```

## RabbitMQ retry + DLQ (`account.created`)

`account-created-consumer.ts` extends the existing `account.created` flow (Transactional Outbox →
`outbox-relay.ts` → RabbitMQ, see [adr/0002](adr/0002-transactional-outbox.md)) with explicit failed-message
handling, entirely inside this one consumer — the outbox/relay pair, and the RabbitMQ-vs-Kafka choice per
event (see [adr/0004](adr/0004-rabbitmq-vs-kafka.md)), are unchanged.

Topology (`rabbitmq-retry-topology.ts`), three durable queues:

```
account.created  --(processing fails)-->  account.created.retry
      ^                                   (TTL = backoff delay, per message)
      |                                          |
      +------------ TTL expires, broker dead-letters it back --------+

account.created.retry  --(retries exhausted)-->  account.created.dlq
```

- `account.created` — the real work queue; the consumer subscribes here.
- `account.created.retry` — a parking-lot queue nothing consumes directly. Every message published here
  carries a per-message TTL (the `expiration` property, computed by the *same* `computeBackoffDelayMs()`
  the HTTP resilience layer uses — deliberately reused rather than a second, separate formula) and this
  queue's `x-dead-letter-exchange`/`x-dead-letter-routing-key` arguments point back at `account.created`. RabbitMQ
  moves the message back on its own once the TTL expires — no polling/sleeping process implements the delay.
- `account.created.dlq` — a true dead end for messages that exhausted `RABBITMQ_MAX_RETRIES`; nothing
  republishes out of it automatically. Meant for operator inspection (e.g. the management UI), not automated
  draining.

The retry count travels as an `x-retry-count` **message header**, incremented by the consumer on each
failure — not in-memory state, so it survives a consumer process restart (a fresh process reads the same
header off the message and continues counting correctly). Every outcome — success, retried, or moved to the
DLQ — **acks** the original delivery; a failure never acks it as if the *business* operation succeeded, but
it also isn't left unacked/requeued by RabbitMQ's own redelivery, since this consumer is the one deciding
where the message goes next (retry queue or DLQ) rather than relying on native nack/requeue semantics.

Retry/DLQ metrics: `rabbitmq_message_retries_total` and `rabbitmq_dlq_messages_total` (Prometheus counters,
labeled by `queue`).

## At-least-once delivery and the idempotent consumer

RabbitMQ (like essentially every message broker) delivers **at least once**, never exactly once — a
redelivery after a consumer crashes just after acting but before acking is a normal, expected occurrence,
not a bug. This project does **not** claim exactly-once processing anywhere.

`outbox-relay.ts` sets the AMQP `messageId` property to the outbox row's own id when it first publishes
`account.created` — a stable identifier for one logical event that survives every redelivery and every
retry-queue round trip (the consumer forwards it verbatim when it republishes to `.retry`/`.dlq`, rather than
minting a new one). `account-created-consumer.ts` uses that id as the key for a claim/process/save-or-release
guard against the **existing** Redis-backed `IdempotencyRepository` (the same port `IdempotentDecorator`
uses for the HTTP layer's account/wallet/remittance idempotency — see
[adr/0003](adr/0003-redis-backed-idempotency.md)) — no new datastore, per the issue's explicit ask:

- `claim(messageId)` — if this delivery is the first to see this event, proceed; if another delivery already
  claimed it, check whether it finished:
  - already saved a result → this is a duplicate of a completed event; **ack without repeating the side
    effect**.
  - still in flight (no result saved yet) → another delivery (or another consumer instance) is actively
    handling it right now; ack this duplicate rather than process it concurrently. The in-flight claim's own
    TTL (`RedisIdempotencyRepository`'s `CLAIM_TTL_SECONDS`) is what eventually clears a truly abandoned
    claim, same as it does for the HTTP-facing decorator.
- On success, `save()` marks the event done (24h TTL, same as every other use of this repository) so a later
  duplicate delivery is recognized and skipped.
- On failure, `release()` frees the claim before handing off to the retry/DLQ decision, so the *next*
  delivery of the same event (after the retry-queue TTL, same `messageId`) is allowed to actually attempt
  processing again instead of permanently reading as "in flight".

A message with no `messageId` (e.g. hypothetically published by something other than `outbox-relay.ts`) is
processed best-effort, without a dedupe guard — the same behavior this consumer had before this feature
existed.

## What this project guarantees, and what it deliberately does not

**Guaranteed:**
- A transient HTTP failure (timeout, connection failure, 408/429/5xx) is retried up to `RETRY_MAX_ATTEMPTS`
  times with exponential backoff and bounded jitter; a business/client 4xx is never retried.
- Sustained provider failures trip a circuit breaker that stops sending traffic to it until a probe
  succeeds.
- A failed `account.created` processing attempt is retried up to `RABBITMQ_MAX_RETRIES` times (broker-native
  delay via TTL + dead-letter-exchange, retry count in message metadata, survives a consumer restart) before
  landing in a DLQ; it is never silently dropped.
- A duplicate delivery of an `account.created` event that already completed does not repeat its side effect.

**Deliberately not guaranteed:**
- Exactly-once delivery or processing — RabbitMQ is at-least-once; duplicates are handled, not prevented.
- Distributed circuit-breaker state across multiple API instances — each process's breaker is independent
  (an explicit non-goal for this feature).
- Idempotency for a concurrent in-flight duplicate specifically (as opposed to a duplicate of an already-
  *completed* event) — that duplicate is skipped rather than retried alongside the original, which means if
  the original delivery is the one that ultimately fails, this consumer relies on the in-flight claim's TTL
  expiring before anything retries it again.
- Anything about `remittance.completed`/Kafka or the outbox/relay pair's own retry behavior — unchanged by
  this feature; see [adr/0002](adr/0002-transactional-outbox.md) and
  [adr/0004](adr/0004-rabbitmq-vs-kafka.md) for what they already guarantee.
