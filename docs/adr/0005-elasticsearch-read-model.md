# 0005 — Elasticsearch as a CQRS read model for remittance search

## Status

Accepted

## Context

`GET /remittances` needs to search/filter remittances (by sender/recipient account, status, etc.) in ways
that don't map cleanly onto the transactional schema's access patterns (`remittances` is indexed for
sender/recipient id lookups, not free-form search/filter combinations), and shouldn't add read load or
locking pressure to the same Postgres tables the write path (`SendRemittanceUseCase`) depends on for
correctness.

## Decision

`GET /remittances` (`SearchRemittancesUseCase`) reads exclusively from Elasticsearch via
`RemittanceSearchIndex` (`ElasticsearchRemittanceSearchIndex`) — never from Postgres. The index is kept in
sync by the Kafka-consuming indexer worker (`npm run worker:remittance-indexer`, see
[0004](0004-rabbitmq-vs-kafka.md)), which indexes each `remittance.completed` event as it arrives.
`PostgresRemittanceRepository` remains the source of truth for writes; Elasticsearch is a denormalized,
eventually-consistent projection, not a second copy of record. Unlike `EventPublisher`'s "must not throw"
contract, `RemittanceSearchIndex.search()` is allowed to throw — a failed search should surface as a real
error to the caller, there's no meaningful silent-empty-result substitute for a search endpoint.

## Alternatives considered

- **Query Postgres directly for `GET /remittances`**, with dedicated indexes for the needed filters.
  Rejected as the long-term direction for this project specifically because it's meant to demonstrate a CQRS
  read side, not because Postgres itself couldn't serve simple filters — for a system with much heavier
  search/filter requirements this trade-off could reasonably go the other way.
- **Synchronous dual-write** (write to Postgres and Elasticsearch in the same request). Rejected — couples
  the write path's latency and failure mode to Elasticsearch's availability, exactly what the non-fatal,
  eventually-consistent design here is meant to avoid.

## Consequences

- `GET /remittances` depends on Elasticsearch being reachable and the indexer worker having actually
  processed the relevant event — if Elasticsearch is down, the endpoint errors (by design, see above); if the
  indexer lags or drops an event, a just-completed remittance may not show up in search results immediately,
  or at all if that one Kafka message was never successfully indexed (the indexer catches and logs its own
  indexing failures rather than crashing, so a bad message is dropped, not retried forever). This lag/gap is
  accepted for a read model — see `docs/infrastructure.md`'s Elasticsearch bullet.
- The index/mapping is created lazily on first `index()`/`search()` call — there's no formal migration runner
  for it the way `migrations/*.sql` covers Postgres.
- `accountId` is a required query parameter on `GET /remittances`'s HTTP side specifically because there's no
  per-resource authorization layer yet (see [docs/invariants.md](../invariants.md)'s closing note) — requiring
  it at least stops the endpoint from defaulting to "every remittance in the system."
