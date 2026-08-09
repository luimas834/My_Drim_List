// sql/setup.js — one-command database setup.
//
// Runs every .sql file in this folder against DATABASE_URL, in order. Uses the
// `pg` driver rather than shelling out to psql, so a machine only needs Node and
// a reachable PostgreSQL — no psql client install, no per-OS path differences.
//
//   node sql/setup.js              safe: build a new database, or update an existing one
//   node sql/setup.js --all        force, INCLUDING the destructive 01_schema.sql
//   node sql/setup.js --dry-run    list what would run, touch nothing
//   node sql/setup.js --from=06    start from a given migration
//   node sql/setup.js --only=07    run one file only
//
// 01_schema.sql begins with DROP TABLE ... CASCADE. Every other migration is
// written with CREATE OR REPLACE / IF NOT EXISTS, so re-running those is safe.
//
// So the default adapts: if the database is empty, run everything. If it already
// has an `anime` table, skip 01 and apply the rest. That means `db:setup` is the
// single command for both "set this up" and "I pulled and there are new
// migrations", and it can never silently destroy a seeded catalogue. Use --all
// when you actually want a clean rebuild.
//
// This exists because adding 07 and 08 both required remembering to run
// --only=NN by hand, and forgetting produced a runtime "relation does not
// exist" on a page that had been working.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const SQL_DIR = __dirname;
const DRY_RUN = process.argv.includes("--dry-run");

function flag(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : null;
}

const FROM = flag("from");
const ONLY = flag("only");
const ALL = process.argv.includes("--all") || process.argv.includes("--force");

// Numbered files run in filename order. seed.js is JS, not SQL, and runs separately.
function migrationFiles() {
  let files = fs
    .readdirSync(SQL_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();

  // Match on the leading number or any prefix: --only=07, --only=07_studios,
  // --only=07_studios.sql all select the same file.
  if (ONLY) files = files.filter((f) => f.startsWith(ONLY) || f === ONLY);
  if (FROM) files = files.filter((f) => parseInt(f, 10) >= parseInt(FROM, 10));

  return files;
}

// Is there already a schema here worth protecting?
async function schemaExists(client) {
  const { rows } = await client.query(
    `SELECT to_regclass('public.anime') IS NOT NULL AS present`
  );
  return rows[0].present;
}

async function main() {
  let files = migrationFiles();

  if (!files.length) {
    console.error(
      ONLY || FROM
        ? `No migration matched --only=${ONLY || ""}${FROM ? `--from=${FROM}` : ""}`
        : `No migration files found in ${SQL_DIR}`
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Create backend/.env first (see .env.example).");
    process.exit(1);
  }

  // A single connection, not a pool: migrations must run in order on one session.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Protect an existing catalogue unless a rebuild was explicitly asked for.
  const existing = await schemaExists(client);
  let skippedSchema = false;
  if (existing && !ALL && !ONLY && !FROM) {
    const before = files.length;
    files = files.filter((f) => !f.startsWith("01"));
    skippedSchema = files.length < before;
  }

  console.log(`Found ${files.length} migration(s) to apply:`);
  files.forEach((f) => console.log(`  - ${f}`));

  if (skippedSchema) {
    console.log(
      "\n  (existing database detected — 01_schema.sql skipped so your data survives.\n" +
        "   Everything else is CREATE OR REPLACE / IF NOT EXISTS, so this is safe to re-run.\n" +
        "   Use --all if you want a clean rebuild, which DROPS every table.)"
    );
  } else if (files.some((f) => f.startsWith("01"))) {
    console.log(
      existing
        ? "\n⚠  01_schema.sql DROPS every table — all existing data will be lost."
        : "\n  (empty database — building the schema from scratch.)"
    );
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing was executed.");
    await client.end();
    return;
  }

  console.log(`\nApplying...\n`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(SQL_DIR, file), "utf8");
    process.stdout.write(`  ${file} ... `);
    try {
      await client.query(sql);
      console.log("ok");
    } catch (e) {
      console.log("FAILED");
      console.error(`\n${file} failed:\n  ${e.message}`);
      if (e.position) console.error(`  at character ${e.position}`);
      if (e.hint) console.error(`  hint: ${e.hint}`);

      // Say plainly what did not run. Stopping at the first failure is correct —
      // later migrations may depend on this one — but silently leaving the rest
      // unapplied is how you end up with a half-migrated database and a
      // confusing "relation does not exist" at runtime.
      const remaining = files.slice(files.indexOf(file) + 1);
      if (remaining.length) {
        console.error(`\n  NOT applied because of this failure:`);
        remaining.forEach((f) => console.error(`    - ${f}`));
        console.error(`\n  Fix the error above, then run db:setup again.`);
      }

      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log("\nAll migrations applied.");
  console.log("Next: npm run db:seed   (populates anime from Jikan — needs internet)");
  console.log("  or: npm run db:restore (loads the committed dump — instant, offline)");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
