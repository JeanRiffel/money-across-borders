import { UnitOfWork } from '../../../application/shared/transaction/unit-of-work';

// The in-memory registry has no real transaction/rollback concept — every
// InMemory*Repository mutates a plain array in place, so there's nothing to
// commit or roll back. This passthrough exists purely so use cases that take
// a UnitOfWork (e.g. SendRemittanceUseCase) can still be constructed against
// the in-memory stack in tests, unchanged.
export class InMemoryUnitOfWork implements UnitOfWork {
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}
