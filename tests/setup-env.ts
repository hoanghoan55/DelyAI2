// Loads .env for tests when present; absent file must never fail the suite.
try {
  process.loadEnvFile(process.cwd() + '/.env')
} catch {
  // no .env in this environment — credentials-gated tests will skip
}
