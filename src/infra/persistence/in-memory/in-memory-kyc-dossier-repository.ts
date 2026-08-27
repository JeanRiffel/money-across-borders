import {
  KycDossier,
  KycDossierRepository,
} from '../../../application/compliance/repositories/kyc-dossier-repository';

export class InMemoryKycDossierRepository implements KycDossierRepository {
  private dossiers: KycDossier[] = [];

  async save(dossier: KycDossier): Promise<void> {
    const index = this.dossiers.findIndex((d) => d.kycProfileId === dossier.kycProfileId);
    if (index === -1) {
      this.dossiers.push(dossier);
    } else {
      this.dossiers[index] = dossier;
    }
  }

  getSavedDossiers(): ReadonlyArray<KycDossier> {
    return this.dossiers;
  }
}
