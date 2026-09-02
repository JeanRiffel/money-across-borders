# 0008 — Resilience layer: cockatiel, and a broker-native RabbitMQ retry/DLQ

## Status

Accepted

## Context

The project wanted to demonstrate, in code and tests, the standard resilience patterns for a synchronous
external-provider call (timeout, retry, exponential backoff+jitter, circuit breaker) and for asynchronous
RabbitMQ processing (retry, DLQ, idempotent consumer) — see [docs/resilience.md](../resilience.md) for the
full design. Two implementation choices needed deciding: what builds the HTTP-side resilience policies, and
how the RabbitMQ retry delay is actually implemented.

## Decision

**Library: `cockatiel`, confined to one file.** `resilient-http-client.ts` is the only module that imports
it; every other module depends on plain functions and this project's own error types
(`infra/resilience/errors.ts`). `cockatiel` was chosen over hand-rolling timeout/retry/circuit-breaker logic
because it's a small (~15KB), dependency-free, actively-maintained TypeScript library that already composes
all three concerns cleanly via `wrap()`, rather than three separate hand-maintained state machines. The
initially-installed major version (4.x) turned out to be ESM-only (`"type": "module"`, no CJS `main`), which
doesn't load under this project's canonical CommonJS toolchain (`ts-node`, Jest/`ts-jest` — see
[AGENTS.md](../../AGENTS.md)'s "Runtime" section) — pinned to `3.2.1` instead, the last version with a real
CJS `main` entry, same API surface.

**RabbitMQ retry delay: broker-native (dead-letter-exchange + per-message TTL), not an in-process sleep.**
`rabbitmq-retry-topology.ts` declares a `.retry` queue whose `x-dead-letter-exchange`/
`x-dead-letter-routing-key` point back at the main queue; the consumer republishes a failed message there
with `expiration` set to the computed backoff delay, and RabbitMQ moves it back to the main queue on its own
once that TTL elapses.

## Alternatives considered

- **Hand-rolled timeout/retry/circuit-breaker.** Considered instead of a library — every state transition
  would be under this project's own control, with no library-version compatibility risk. Rejected once
  `cockatiel` was confirmed to fit the CommonJS toolchain (after the 4.x→3.2.1 pin): three hand-maintained
  state machines is more surface area to keep correct than one well-tested library confined to a single
  file, for a showcase project whose point is demonstrating the *pattern*, not the state-machine
  implementation itself.
- **A sleeping/polling worker for the RabbitMQ retry delay** (mirroring `outbox-relay.ts`'s own poll loop).
  Rejected — it would need its own persistent "retry at" bookkeeping (a table or an in-memory timer list,
  the latter explicitly ruled out by the issue for exactly this reason: it doesn't survive a process
  restart), whereas the dead-letter-exchange approach gets a durable, broker-enforced delay for free from
  infrastructure the project already depends on.
- **`opossum`** (a circuit-breaker-only library) plus separate retry/backoff libraries. Rejected — would
  need three dependencies instead of one, and their circuit/retry state wouldn't compose through one
  library's own execution wrapper the way `cockatiel`'s policies do via `wrap()`.

## Consequences

- A new production dependency (`cockatiel@3.2.1`) — but isolated behind `resilient-http-client.ts`, so
  swapping it later (a different library, or a hand-rolled replacement) touches one file, not every caller.
- The RabbitMQ retry delay is only as precise as RabbitMQ's own per-queue TTL/dead-lettering, not a
  sub-millisecond in-process timer — acceptable; nothing here needs tighter precision than "roughly this
  many milliseconds later."
- `docs/resilience.md`'s own test suite surfaced a real cross-realm `instanceof TypeError` failure under
  Jest's node test environment (fetch's native error not sharing a prototype with the test module's own
  `TypeError`) — `retry-classifier.ts` duck-types on `.name` instead, a decision driven by an actual
  observed failure, not speculation; see that file's comment and
  [docs/resilience.md](../resilience.md#whats-retried-and-why-retry-classifierts).
