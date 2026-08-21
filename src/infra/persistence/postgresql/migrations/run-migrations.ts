// Applies every *.sql file in this directory against POSTGRES_* (see
// .env.example), in filename order. Both migrations here are already
// idempotent (CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING), so this
// is safe to re-run against an already-migrated database — run it once
// before `npm run dev`/`npm start` against a fresh one (see CLAUDE.md).
import fs from "node:fs"
import path from "node:path"
import { pool } from "../../../config/database/postgresql/pg"

const MIGRATIONS_DIR = __dirname

async function run(): Promise<void> {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith(".sql"))
    .sort()

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
    console.log(`Applying ${file}...`)
    await pool.query(sql)
  }

  console.log(`✓ Applied ${files.length} migration(s)`)
  await pool.end()
}

run().catch((error) => {
  console.error("✗ Migration failed:", error)
  process.exit(1)
})
