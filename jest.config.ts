export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  // __tests__/concurrency/ needs a real, migrated Postgres and has its own
  // command (npm run test:concurrency, jest.concurrency.config.ts) — kept
  // out of the default suite so `npm test` stays free of external services.
  // __tests__/infra/seed/integration/** needs a real, migrated Postgres
  // (same requirement as npm run test:integration) — see jest.seed.config.ts
  // and docs/seed.md's "Testes" section. Everything else under
  // __tests__/infra/seed/** is a plain unit test and stays in this suite.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/__tests__/concurrency/',
    '<rootDir>/__tests__/infra/seed/integration/',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
};
