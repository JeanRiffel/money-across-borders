import { QueryResult, QueryResultRow } from 'pg';

// Structural type both `Pool` and `PoolClient` satisfy — lets every
// concurrency-lab repository below accept either a plain `pool` (each call
// gets its own connection and autocommits — fine for the atomic-update and
// idempotency demos, which need no explicit transaction) or one checked-out
// `PoolClient` (needed whenever several statements must share one
// connection/transaction — the pessimistic-lock and optimistic-concurrency
// demos). Kept deliberately this thin: "something with .query(sql, params)",
// not a query builder — see the "No ORM" / "SQL First" constraints this
// laboratory was built under.
export type QueryExecutor = {
  query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
};
