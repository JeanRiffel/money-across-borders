import { EventPublisher } from "../../application/shared/events/event-publisher"

// Mirrors the rest of the codebase's InMemory* fakes (InMemoryAccountRepository,
// InMemoryComplianceChecker, ...): records what was published instead of
// actually sending anything, so use-case tests can assert an event fired
// without needing a real broker. Also doubles as CreateAccountUseCase's
// default constructor argument (see its comment) for callers — like the
// existing unit test — that construct it without wiring an EventPublisher
// at all: publishing into an array that's simply never inspected is a safe,
// genuinely no-op default, not just a stand-in.
export class InMemoryEventPublisher implements EventPublisher {
  private published: Array<{ topic: string; payload: Record<string, unknown> }> = []

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    this.published.push({ topic, payload })
  }

  getPublishedEvents(): ReadonlyArray<{ topic: string; payload: Record<string, unknown> }> {
    return this.published
  }
}
