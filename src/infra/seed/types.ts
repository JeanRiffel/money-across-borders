/**
 * Plain, DB-row-shaped types used across the seed pipeline. Deliberately NOT
 * the domain entities (User, Account, Wallet, ...): generating ~10k-100k+
 * rows through entity constructors + one repository.save() call each would
 * mean one round trip per row (see docs/seed.md's "Performance" section for
 * why that doesn't scale). Column names/types mirror
 * src/infra/persistence/postgresql/migrations/001_init_schema.sql exactly —
 * see persistence/batch-writer.ts for where these get inserted.
 */

export type ActivityProfile = 'heavy' | 'normal' | 'low';

export interface SeedUserRow {
  id: string;
  email: string;
  password_hash: string;
  status_id: number;
  created_at: Date;
}

export interface SeedAccountRow {
  id: string;
  user_id: string | null;
  status_id: number;
  created_at: Date;
}

export interface SeedWalletRow {
  id: string;
  account_id: string;
  currency: string;
  balance_minor_units: number;
  status_id: number;
  created_at: Date;
}

export interface SeedKycProfileRow {
  id: string;
  account_id: string;
  status_id: number;
  full_name: string;
  document_id: string;
  verified_at: Date | null;
  created_at: Date;
}

export interface SeedLedgerEntryRow {
  id: string;
  wallet_id: string;
  direction_id: number; // 1=DEBIT, 2=CREDIT (EntryDirection)
  amount_minor_units: number;
  currency: string;
  transaction_id: string;
  description: string;
  created_at: Date;
}

export interface SeedRemittanceRow {
  id: string;
  sender_account_id: string;
  recipient_account_id: string;
  source_wallet_id: string;
  destination_wallet_id: string;
  source_amount_minor_units: number;
  source_currency: string;
  fee_minor_units: number;
  fee_currency: string;
  converted_amount_minor_units: number;
  destination_currency: string;
  exchange_rate: number;
  status_id: number; // RemittanceStatus
  created_at: Date;
}

export interface SeedIdempotencyRecordRow {
  key: string;
  request_hash: string | null;
  response_body: unknown;
  status_code: number | null;
  created_at: Date;
}

/** A customer is exactly one User + one Account, matching CreateAccountUseCase. */
export interface SeedCustomer {
  accountId: string;
  userId: string;
  activityProfile: ActivityProfile;
  kycVerified: boolean;
  createdAt: Date;
}

/** In-memory wallet reference kept alongside its live balance during generation. */
export interface SeedWalletRef {
  id: string;
  accountId: string;
  currency: string;
  balance: number; // minor units — mutated in place as legs are generated
  createdAt: Date;
}

/**
 * The subset of pipeline state validation/report.ts needs to tally counts —
 * intentionally not the whole pipeline's working state (see run-seed.ts for
 * the rest, e.g. the currency/account lookup maps used only during
 * generation).
 */
export interface GenerationState {
  customers: SeedCustomer[];
  walletsById: Map<string, SeedWalletRef>;
  ledgerEntries: SeedLedgerEntryRow[];
  remittances: SeedRemittanceRow[];
  idempotencyRecords: SeedIdempotencyRecordRow[];
}

export interface ContentionIntent {
  senderAccountId: string;
  senderCurrency: string;
  recipientAccountId: string;
  recipientCurrency: string;
  amountMinorUnits: number;
  idempotencyKey: string;
}
