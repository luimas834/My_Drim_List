// sql/restore.js — load the committed catalogue dump into a fresh database.
//
//   node sql/restore.js
//
// Pure Node: reads backend/sql/data/seed_data.sql and executes it. No psql, no
// pg_restore, no internet. On a new machine the whole setup is:
//
//   createdb mdl && npm run db:setup && npm run db:restore
//
// Two things worth knowing about how this runs:
//
// 1. It runs inside a single transaction, so a failure rolls the whole thing
//    back rather than leaving you half-seeded.
// 2. It sets session_replication_role = replica for the duration, which
//    suspends triggers and FK checks. That matters: our triggers fire on
//    INSERT, and restoring rows in dependency order while eleven triggers run
//    is both slow and, in some cases, wrong. This requires a superuser
//    connection — the default local `postgres` role is one.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const DUMP = path.join(__dirname, "data", "seed_data.sql");

async function main() {
  if (!fs.existsSync(DUMP)) {
    console.error(
      `No dump found at ${DUMP}\n\n` +
        "Either:\n" +
        "  - someone with a seeded database runs `npm run db:dump` and commits the file, or\n" +
        "  - you seed from the API yourself: `npm run db:seed` (needs internet, takes a few minutes)"
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Create backend/.env first.");
    process.exit(1);
  }

  const sql = fs.readFileSync(DUMP, "utf8");
  const inserts = (sql.match(/^INSERT INTO/gm) || []).length;
  console.log(`Restoring ${inserts} rows from seed_data.sql ...`);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  let suspendedTriggers = false;
  try {
    await db.query("BEGIN");

    try {
      await db.query("SET session_replication_role = replica");
      suspendedTriggers = true;
    } catch (e) {
      console.warn(
        "  note: could not suspend triggers (needs a superuser role). " +
          "Continuing with triggers live — this is slower but usually fine."
      );
    }

    await db.query(sql);

    if (suspendedTriggers) await db.query("SET session_replication_role = DEFAULT");

    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    await db.end();
    console.error("\nRestore failed and was rolled back:\n  " + e.message);
    console.error(
      "\nIf this says a relation does not exist, run `npm run db:setup` first.\n" +
        "If it says a key already exists, the catalogue is already loaded — " +
        "run `npm run db:setup` to reset, then restore again."
    );
    process.exit(1);
  }

  // The matview is empty until it is built from the data we just inserted.
  console.log("Refreshing top_by_genre ...");
  await db.query("REFRESH MATERIALIZED VIEW top_by_genre");

  const counts = await db.query(
    `SELECT (SELECT count(*) FROM anime)    AS anime,
            (SELECT count(*) FROM genres)   AS genres,
            (SELECT count(*) FROM studios)  AS studios,
            (SELECT count(*) FROM episodes) AS episodes`
  );
  const c = counts.rows[0];

  await db.end();

  console.log(
    `\nRestored: ${c.anime} anime, ${c.genres} genres, ${c.studios} studios, ${c.episodes} episodes.`
  );
  console.log("Next: npm run db:make-admin -- your@email.com   (after you register)");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
