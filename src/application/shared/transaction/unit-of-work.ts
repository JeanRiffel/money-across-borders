// Lets a use case wrap a sequence of repository writes in one atomic unit —
// all commit together, or a thrown error rolls all of them back. Kept as a
// port (like the other src/application/shared/* interfaces) so use cases
// stay dependent on an abstraction, not on Postgres specifically; the
// in-memory implementation is a no-op passthrough for tests.
export interface UnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>
}
