export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // __tests__/infra/seed/integration/** needs a real, migrated Postgres
  // (same requirement as npm run test:integration) — see jest.seed.config.ts
  // and docs/seed.md's "Testes" section. Everything else under
  // __tests__/infra/seed/** is a plain unit test and stays in this suite.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/infra/seed/integration/'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
};
