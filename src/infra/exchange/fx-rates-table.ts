// Simulated market rates, quoted as "units of currency per 1 USD". Mocked
// and static for this showcase — a real adapter would call a live FX rate
// API. Shared by MockExchangeRateProvider (in-process, synchronous) and
// fake-fx-server.ts (an actual local HTTP server used to exercise
// HttpExchangeRateProvider's resilience layer) so both mocked FX paths quote
// the same numbers.
export const RATES_PER_USD: Record<string, number> = {
  USD: 1,
  BRL: 5.2,
  EUR: 0.92,
  GBP: 0.79,
};

export function computeRate(baseCode: string, quoteCode: string): number | undefined {
  const baseRatePerUsd = RATES_PER_USD[baseCode];
  const quoteRatePerUsd = RATES_PER_USD[quoteCode];
  if (baseRatePerUsd === undefined || quoteRatePerUsd === undefined) return undefined;
  return quoteRatePerUsd / baseRatePerUsd;
}
