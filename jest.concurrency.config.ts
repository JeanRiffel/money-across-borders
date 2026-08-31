// Separate from jest.config.ts on purpose: `npm test` never touches
// Postgres (see AGENTS.md "Commands"), and these tests need a real,
// reachable, migrated one — same convention as npm run test:integration
// (Cucumber) being its own command instead of folded into the Jest suite.
// Run: npm run db:migrate && npm run test:concurrency
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/__tests__/concurrency"],
  testMatch: ["**/__tests__/concurrency/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  testTimeout: 20000,
  // Concurrency tests hold real locks/transactions open across connections
  // within a file (pessimistic-lock, isolation-levels) — running test files
  // themselves in parallel adds nothing here and only makes lock-wait
  // timing noisier to reason about.
  maxWorkers: 1,
};
