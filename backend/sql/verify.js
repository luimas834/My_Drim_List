// sql/verify.js — pre-demo health check for the database.
//
//   node sql/verify.js
//
// Confirms every object the project claims to have actually exists, and that
// there is data to demo with. Run this before the presentation instead of
// finding out live that the materialized view was never refreshed.
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const EXPECTED = {
  tables: [
    "activity_log", "anime", "anime_genres", "anime_studios", "episode_discussions",
    "episodes", "followers", "genres", "notifications", "review_votes", "reviews",
    "studios", "users", "watchlist",
  ],
  functions: [
    "get_user_stats", "recommend_anime", "get_watch_history", "get_recent_discussions",
  ],
  procedures: ["cast_helpful_vote", "bulk_drop_inactive"],
  views: ["anime_card_view", "episode_card_view"],
  matviews: ["top_by_genre"],
};

const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.log(`  ✗ ${m}`); failures++; };
let failures = 0;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Create backend/.env first.");
    process.exit(1);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const list = async (sql) => (await db.query(sql)).rows.map((r) => Object.values(r)[0]);

  console.log("\nSCHEMA OBJECTS");

  const tables = await list(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`
  );
  for (const t of EXPECTED.tables) {
    tables.includes(t) ? pass(`table ${t}`) : fail(`table ${t} MISSING`);
  }
  const extraTables = tables.filter((t) => !EXPECTED.tables.includes(t));
  if (extraTables.length) console.log(`  ℹ extra tables: ${extraTables.join(", ")}`);

  const routines = await list(
    `SELECT routine_name FROM information_schema.routines WHERE routine_schema='public'`
  );
  for (const f of EXPECTED.functions) {
    routines.includes(f) ? pass(`function ${f}`) : fail(`function ${f} MISSING`);
  }
  for (const p of EXPECTED.procedures) {
    routines.includes(p) ? pass(`procedure ${p}`) : fail(`procedure ${p} MISSING`);
  }

  const views = await list(`SELECT viewname FROM pg_views WHERE schemaname='public'`);
  for (const v of EXPECTED.views) {
    views.includes(v) ? pass(`view ${v}`) : fail(`view ${v} MISSING`);
  }

  const matviews = await list(`SELECT matviewname FROM pg_matviews WHERE schemaname='public'`);
  for (const v of EXPECTED.matviews) {
    matviews.includes(v) ? pass(`matview ${v}`) : fail(`matview ${v} MISSING`);
  }

  const triggers = await list(
    `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1`
  );
  triggers.length >= 11
    ? pass(`${triggers.length} triggers installed`)
    : fail(`only ${triggers.length} triggers (expected at least 11)`);

  console.log("\nDATA");

  const count = async (t) =>
    Number((await db.query(`SELECT count(*)::int AS c FROM ${t}`)).rows[0].c);

  const animeCount = await count("anime");
  animeCount > 0 ? pass(`anime: ${animeCount}`) : fail("anime table is EMPTY — run db:seed or db:restore");

  const epCount = await count("episodes");
  const animeWithEps = Number(
    (await db.query(`SELECT count(DISTINCT anime_id)::int AS c FROM episodes`)).rows[0].c
  );
  epCount > 0
    ? pass(`episodes: ${epCount} across ${animeWithEps}/${animeCount} anime`)
    : fail("no episodes — episode discussions will look empty");
  if (epCount > 0 && animeWithEps < animeCount * 0.5) {
    console.log(`  ℹ fewer than half of anime have episodes. Run: npm run db:seed -- --episodes=all`);
  }

  for (const t of ["genres", "studios", "users", "watchlist", "reviews"]) {
    console.log(`  ℹ ${t}: ${await count(t)}`);
  }

  const mv = Number((await db.query(`SELECT count(*)::int AS c FROM top_by_genre`)).rows[0].c);
  mv > 0
    ? pass(`top_by_genre has ${mv} rows`)
    : fail("top_by_genre is empty — run: REFRESH MATERIALIZED VIEW top_by_genre");

  console.log("\nDEMO READINESS");

  const admins = Number(
    (await db.query(`SELECT count(*)::int AS c FROM users WHERE is_admin`)).rows[0].c
  );
  admins > 0
    ? pass(`${admins} admin user(s) — /demo maintenance buttons will work`)
    : fail("no admin user — run: npm run db:make-admin -- your@email.com");

  const completed = Number(
    (await db.query(`SELECT count(*)::int AS c FROM watchlist WHERE status='completed'`)).rows[0].c
  );
  completed > 0
    ? pass(`${completed} completed watchlist entries — recommendations will return rows`)
    : fail("nothing completed — recommend_anime() will return empty");

  const shortAnime = (
    await db.query(
      `SELECT anime_id, title, episode_count FROM anime
       WHERE episode_count BETWEEN 1 AND 13
       ORDER BY score DESC NULLS LAST LIMIT 3`
    )
  ).rows;
  if (shortAnime.length) {
    console.log("\n  Good demo candidates (small episode counts):");
    shortAnime.forEach((a) =>
      console.log(`    #${a.anime_id}  ${a.title} (${a.episode_count} eps)`)
    );
  }

  await db.end();

  console.log(
    failures === 0
      ? "\nAll checks passed. You are demo-ready.\n"
      : `\n${failures} check(s) failed — see above.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nverify failed:", e.message);
  process.exit(1);
});
