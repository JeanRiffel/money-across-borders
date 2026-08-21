// Cucumber config for integration tests (features/). Separate from Jest,
// which covers unit tests against the in-memory repos (see CLAUDE.md).
// This suite exercises the real Express app + real Postgres end to end —
// see features/support/hooks.ts for how the app is built and torn down.
module.exports = {
  default: {
    requireModule: ['ts-node/register', 'tsconfig-paths/register'],
    require: ['features/support/**/*.ts', 'features/step-definitions/**/*.ts'],
    paths: ['features/**/*.feature'],
    format: ['progress-bar'],
    publishQuiet: true
  }
}
