// sql/setup.js — one-command database setup.
//
// Runs every .sql file in this folder against DATABASE_URL, in order. Uses the
// `pg` driver rather than shelling out to psql, so a machine only needs Node and
// a reachable PostgreSQL — no psql client install, no per-OS path differences.
//
//   node sql/setup.js              run every migration in order
//   node sql/setup.js --dry-run    list what would run, touch nothing
//   node sql/setup.js --from=06    skip 01-05, keep your data
//   node sql/setup.js --only=07    run one file only
//
// 01_schema.sql begins with DROP TABLE ... CASCADE, so a full run is destructive
// by design: it is both "set up" and "reset". Everything after it is written
// with CREATE OR REPLACE / IF NOT EXISTS, so re-running those is safe.
//
// --from and --only exist for exactly that reason: when a later migration adds
// views or functions and you do not want to lose the catalogue and the accounts
// you have already set up, apply just the new file.
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

async function main() {
  const files = migrationFiles();

  if (!files.length) {
    console.error(
      ONLY || FROM
        ? `No migration matched --only=${ONLY || ""}${FROM ? `--from=${FROM}` : ""}`
        : `No migration files found in ${SQL_DIR}`
    );
    process.exit(1);
  }

  console.log(`Found ${files.length} migration(s):`);
  files.forEach((f) => console.log(`  - ${f}`));

  if (files.some((f) => f.startsWith("01"))) {
    console.log("\n⚠  01_schema.sql drops every table — all existing data will be lost.");
    console.log("   To apply only newer migrations instead: --from=06 or --only=07");
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing was executed.");
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("\nDATABASE_URL is not set. Create backend/.env first (see .env.example).");
    process.exit(1);
  }

  // A single connection, not a pool: migrations must run in order on one session.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log(`\nConnected. Applying migrations...\n`);

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
