import { DeterministicRng } from '../rng/deterministic-rng';

/**
 * Spreads generated events over a lookback window instead of stamping
 * everything "now" (see AGENTS.md request section 9 — period queries,
 * pagination, reporting, Elasticsearch, and event processing all need
 * non-degenerate timestamps to be worth testing). Hour-of-day is weighted
 * toward business hours rather than uniform, which is the only "plausible
 * concentration" this seed claims — day-of-week is left uniform to keep the
 * model simple and auditable.
 */
const HOUR_BUCKETS: readonly { value: [number, number]; weight: number }[] = [
  { value: [0, 6], weight: 0.05 },
  { value: [7, 8], weight: 0.1 },
  { value: [9, 11], weight: 0.25 },
  { value: [12, 13], weight: 0.1 },
  { value: [14, 17], weight: 0.3 },
  { value: [18, 21], weight: 0.15 },
  { value: [22, 23], weight: 0.05 },
];

/** A random Date within [now - dateRangeDays, now], skewed toward business hours. */
export function randomTimestampInRange(
  rng: DeterministicRng,
  now: Date,
  dateRangeDays: number
): Date {
  const dayOffsetMs = rng.nextInt(0, dateRangeDays) * 24 * 60 * 60 * 1000;
  const candidate = new Date(now.getTime() - dayOffsetMs);
  candidate.setHours(weightedHour(rng), rng.nextInt(0, 59), rng.nextInt(0, 59), 0);
  return candidate > now ? now : candidate;
}

/** A random Date within [start, end] (falls back to `end` if start > end). */
export function randomTimestampBetween(rng: DeterministicRng, start: Date, end: Date): Date {
  if (start.getTime() >= end.getTime()) {
    return new Date(end);
  }
  const offset = rng.range(0, end.getTime() - start.getTime());
  return new Date(start.getTime() + offset);
}

function weightedHour(rng: DeterministicRng): number {
  const [from, to] = rng.weightedPick(HOUR_BUCKETS);
  return rng.nextInt(from, to);
}
