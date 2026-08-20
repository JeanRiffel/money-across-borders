import { AccountId } from '../account/value-objects/account-id-value-object'

/**
 * Reserved account id owning the system's per-currency treasury wallets.
 * Treasury wallets are the FX/fee counterparty that keeps every currency's
 * ledger entries balanced independently (see LedgerService) — they are not a
 * real customer account, just a fixed anchor id used for seeding/lookup.
 */
export const TREASURY_ACCOUNT_ID = AccountId.from('11111111-1111-4111-8111-111111111111')
