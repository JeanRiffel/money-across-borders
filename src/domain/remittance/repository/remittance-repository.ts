import { Remittance } from '../entities/remittance';
import { RemittanceId } from '../value-objects/remittance-id-value-object';

export interface RemittanceRepository {
  save(remittance: Remittance): Promise<void>;
  findById(remittanceId: RemittanceId): Promise<Remittance | null>;
}
