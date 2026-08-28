/**
 * Static pools of obviously-fictitious names/words, sampled by
 * DeterministicRng instead of a fixtures library (see deterministic-rng.ts's
 * doc comment for why). None of these are real people — see docs/seed.md's
 * "Segurança" section.
 */

export const FIRST_NAMES: readonly string[] = [
  'Ana',
  'Bruno',
  'Carla',
  'Diego',
  'Elena',
  'Fabio',
  'Gabriela',
  'Hugo',
  'Isabela',
  'Joao',
  'Karina',
  'Lucas',
  'Mariana',
  'Nicolas',
  'Olivia',
  'Pedro',
  'Quintino',
  'Rafaela',
  'Samuel',
  'Tatiana',
  'Ursula',
  'Vitor',
  'Wanda',
  'Xavier',
  'Yasmin',
  'Zeca',
  'Amelia',
  'Benjamin',
  'Clara',
  'Daniel',
];

export const LAST_NAMES: readonly string[] = [
  'Silva',
  'Souza',
  'Costa',
  'Pereira',
  'Oliveira',
  'Rodrigues',
  'Almeida',
  'Nascimento',
  'Carvalho',
  'Araujo',
  'Ribeiro',
  'Martins',
  'Barbosa',
  'Rocha',
  'Dias',
  'Monteiro',
  'Cardoso',
  'Teixeira',
  'Correia',
  'Moreira',
];

// A `.test` TLD-shaped domain, reserved by RFC 2606 for exactly this purpose
// (documentation/examples), so it can never collide with a real mailbox.
export const EMAIL_DOMAINS: readonly string[] = [
  'seed.test',
  'moneyacrossborders.test',
  'fixtures.test',
];

/** SEED-prefixed synthetic document id — never a real CPF/SSN/passport shape. */
export function fakeDocumentId(rngUuidFragment: string): string {
  return `SEED-DOC-${rngUuidFragment.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}
