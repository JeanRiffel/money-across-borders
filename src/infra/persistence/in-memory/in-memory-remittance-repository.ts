import { Remittance } from "../../../domain/remittance/entities/remittance"
import { RemittanceRepository } from "../../../domain/remittance/repository/remittance-repository"
import { RemittanceId } from "../../../domain/remittance/value-objects/remittance-id-value-object"

export class InMemoryRemittanceRepository implements RemittanceRepository {
  private remittances: Remittance[] = []

  async save(remittance: Remittance): Promise<void> {
    const index = this.remittances.findIndex(r => r.getId().equals(remittance.getId()))
    if (index === -1) {
      this.remittances.push(remittance)
    } else {
      this.remittances[index] = remittance
    }
  }

  async findById(remittanceId: RemittanceId): Promise<Remittance | null> {
    return this.remittances.find(r => r.getId().equals(remittanceId)) ?? null
  }
}
