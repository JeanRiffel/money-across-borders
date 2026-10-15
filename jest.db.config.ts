// Real, migrated Postgres only: npm run db:migrate && npm run test:db.
// Kept separate so npm test continues to need no services.
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__/infra/persistence/postgresql'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 20000,
  maxWorkers: 1,
};
