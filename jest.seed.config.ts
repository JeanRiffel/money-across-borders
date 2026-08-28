// Runs only __tests__/infra/seed/integration/** — the seed tests that need a
// real, migrated Postgres (same requirement as `npm run test:integration`),
// which is why they're excluded from the default `npm test` run (see
// jest.config.ts's testPathIgnorePatterns and docs/seed.md's "Testes"
// section). Invoke via `npm run test:seed`.
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__/infra/seed/integration'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
