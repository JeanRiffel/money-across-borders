import { ValidationError } from '../../shared/errors';

// Length is counted in grapheme clusters (what the user sees as one
// character), so an emoji sequence like a family or a flag counts as 1.
// Postgres char_length counts code points instead, which is why this rule
// lives here rather than in a DB CHECK constraint.
const MAX_GRAPHEMES = 40;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export class WalletName {
  private constructor(private readonly value: string) {}

  // Normalizes before validating. NFC comes first, so a composed "é" and
  // "e" + combining accent store and compare as the same name (NFC, not
  // NFKC: ligatures and full-width forms are kept as typed). Whitespace
  // (including tabs, newlines and other Unicode spaces) is then trimmed and
  // collapsed, so only control characters that aren't whitespace are left
  // to reject. \s alone misses U+0085 (NEXT LINE), which Unicode classes as
  // both Cc and White_Space; \p{White_Space} alone misses U+FEFF, which \s
  // covers — so use both.
  static from(raw: string): WalletName {
    const value = raw
      .normalize('NFC')
      .replace(/[\s\p{White_Space}]+/gu, ' ')
      .trim();

    if (value.length === 0) {
      throw new ValidationError('Wallet name must not be empty');
    }
    if (/\p{Cc}/u.test(value)) {
      throw new ValidationError('Wallet name must not contain control characters');
    }
    if (Array.from(segmenter.segment(value)).length > MAX_GRAPHEMES) {
      throw new ValidationError(`Wallet name must be at most ${MAX_GRAPHEMES} graphemes long`);
    }

    return new WalletName(value);
  }

  getValue(): string {
    return this.value;
  }

  // Case-insensitive, matching the (account_id, lower(name)) uniqueness rule.
  equals(other: WalletName): boolean {
    return this.value.toLowerCase() === other.value.toLowerCase();
  }

  toString(): string {
    return this.value;
  }
}
