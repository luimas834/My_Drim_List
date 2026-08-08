// sql/seed.js — populate the catalogue from the Jikan (MyAnimeList) API.
//
//   node sql/seed.js                       5 pages of anime, episodes for all of them
//   node sql/seed.js --pages=3             fewer anime
//   node sql/seed.js --episodes=none       catalogue only, skip episodes
//   node sql/seed.js --episodes=20         episodes for the first 20 anime only
//   node sql/seed.js --max-episodes=100    cap per-anime episodes (long runners)
//   node sql/seed.js --force-episodes      re-fetch episodes even if already present
//
// Everything here is idempotent: anime upsert on the unique mal_id, bridge rows
// use ON CONFLICT DO NOTHING, and episodes are keyed on (anime_id, episode_number).
// Re-running never duplicates, and by default it skips anime whose episodes are
// already stored — so an interrupted run resumes instead of starting over.
//
// Note on images: we store the cover URL, not the image. See README.
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- CLI options
function flag(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

const OPTS = {
  pages: parseInt(flag("pages", "5"), 10),
  episodes: flag("episodes", "all"), // "all" | "none" | a number
  maxEpisodes: parseInt(flag("max-episodes", "400"), 10),
  forceEpisodes: process.argv.includes("--force-episodes"),
};

// Jikan asks for ~3 requests/second. We stay well under it; a course project has
// no reason to be rude to a free API.
const THROTTLE_MS = 1200;

// ------------------------------------------------------------- Jikan fetching
const MAX_TRIES = 6;

// Retry on anything transient: network blips, 429 rate limiting, and 5xx.
// Jikan is a free API that returns 502/503/504 fairly regularly under load —
// those are its problem, not ours, and they clear in seconds. Failing the whole
// run on one of them wastes a ten-minute job.
async function jikan(url, tries = 0) {
  const backoff = async (why) => {
    const wait = 2000 * Math.pow(2, tries); // 2s, 4s, 8s, 16s, 32s
    console.log(`\n    ${why} — retry ${tries + 1}/${MAX_TRIES} in ${wait / 1000}s`);
    await sleep(wait);
    return jikan(url, tries + 1);
  };

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    if (tries < MAX_TRIES) return backoff(`network error (${e.message})`);
    throw new Error(`network error for ${url}: ${e.message}`);
  }

  if (res.status === 404) return null; // some titles genuinely have no episode list

  if ((res.status === 429 || res.status >= 500) && tries < MAX_TRIES) {
    return backoff(`Jikan ${res.status}`);
  }

  if (!res.ok) throw new Error(`Jikan ${res.status} for ${url}`);

  // A 200 with a truncated body throws here; treat it as transient too.
  try {
    return await res.json();
  } catch (e) {
    if (tries < MAX_TRIES) return backoff("malformed JSON response");
    throw new Error(`bad JSON from ${url}: ${e.message}`);
  }
}

// ------------------------------------------------------------------- Upserts
async function upsertAnime(a) {
  const { rows } = await db.query(
    `INSERT INTO anime (mal_id, title, synopsis, cover_image, episode_count, status,
                        score, mal_score, aired_from, aired_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)
     ON CONFLICT (mal_id) DO UPDATE
       SET title         = EXCLUDED.title,
           synopsis      = EXCLUDED.synopsis,
           cover_image   = EXCLUDED.cover_image,
           episode_count = EXCLUDED.episode_count,
           status        = EXCLUDED.status,
           mal_score     = EXCLUDED.mal_score
     RETURNING anime_id`,
    [
      a.mal_id,
      a.title,
      a.synopsis,
      a.images?.jpg?.large_image_url,
      a.episodes,
      a.status,
      a.score,
      a.aired?.from?.slice(0, 10) || null,
      a.aired?.to?.slice(0, 10) || null,
    ]
  );
  const animeId = rows[0].anime_id;

  // NOTE: score is seeded from MAL on first insert but NOT overwritten on
  // conflict — once users review an anime, trg_update_score owns that column.
  // mal_score keeps the original as the fallback for titles with no reviews.

  for (const g of a.genres || []) {
    const gid = (
      await db.query(
        `INSERT INTO genres(name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING genre_id`,
        [g.name]
      )
    ).rows[0].genre_id;
    await db.query(`INSERT INTO anime_genres VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
      animeId,
      gid,
    ]);
  }

  for (const s of a.studios || []) {
    const sid = (
      await db.query(
        `INSERT INTO studios(name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING studio_id`,
        [s.name]
      )
    ).rows[0].studio_id;
    await db.query(`INSERT INTO anime_studios VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
      animeId,
      sid,
    ]);
  }

  return animeId;
}

// Jikan paginates episodes 100 at a time. The old version only ever read page 1,
// so anything longer than 100 episodes was silently truncated.
async function seedEpisodes(malId, animeId) {
  let page = 1;
  let stored = 0;

  while (stored < OPTS.maxEpisodes) {
    const json = await jikan(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`);
    if (!json || !json.data || json.data.length === 0) break;

    for (const [i, ep] of json.data.entries()) {
      if (stored >= OPTS.maxEpisodes) break;
      // On this endpoint Jikan's mal_id IS the episode number. Fall back to a
      // running count if it is ever missing.
      const number = ep.mal_id ?? (page - 1) * 100 + i + 1;
      await db.query(
        `INSERT INTO episodes(anime_id, episode_number, title, aired_on)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (anime_id, episode_number) DO NOTHING`,
        [animeId, number, ep.title, ep.aired?.slice(0, 10) || null]
      );
      stored++;
    }

    if (!json.pagination?.has_next_page) break;
    page++;
    await sleep(THROTTLE_MS);
  }

  return stored;
}

async function alreadyHasEpisodes(animeId) {
  const { rows } = await db.query(
    `SELECT EXISTS(SELECT 1 FROM episodes WHERE anime_id = $1) AS present`,
    [animeId]
  );
  return rows[0].present;
}

// ---------------------------------------------------------------------- main
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Create backend/.env first.");
    process.exit(1);
  }

  console.log(
    `Seeding: ${OPTS.pages} page(s) of anime, episodes=${OPTS.episodes}, ` +
      `cap ${OPTS.maxEpisodes}/anime${OPTS.forceEpisodes ? ", forcing re-fetch" : ""}\n`
  );

  const seeded = [];
  const failedPages = [];

  for (let page = 1; page <= OPTS.pages; page++) {
    process.stdout.write(`anime page ${page}/${OPTS.pages} ... `);
    let json;
    try {
      json = await jikan(`https://api.jikan.moe/v4/top/anime?page=${page}`);
    } catch (e) {
      // One page that will not load must not throw away the pages that did.
      // Everything already inserted is committed; re-running picks up the rest.
      console.log(`FAILED (${e.message})`);
      failedPages.push(page);
      continue;
    }
    if (!json?.data?.length) {
      console.log("no data, stopping");
      break;
    }
    for (const a of json.data) {
      const id = await upsertAnime(a);
      seeded.push({ malId: a.mal_id, animeId: id, title: a.title });
    }
    console.log(`${json.data.length} titles`);
    await sleep(THROTTLE_MS);
  }

  if (!seeded.length) {
    console.error(
      "\nNo anime were seeded — every request to Jikan failed.\n" +
        "This is almost always the API being down or rate limiting, not your setup.\n" +
        "Check https://api.jikan.moe/v4/anime/1 in a browser, then run db:seed again.\n" +
        "Already-inserted rows are kept, so re-running resumes rather than restarting."
    );
    await db.end();
    process.exit(1);
  }

  console.log(`\nCatalogue: ${seeded.length} anime upserted.`);
  if (failedPages.length) {
    console.log(`  ${failedPages.length} page(s) failed: ${failedPages.join(", ")} — re-run to fill them in.`);
  }
  console.log("");

  // ------------------------------------------------------------- episodes
  if (OPTS.episodes === "none") {
    console.log("Skipping episodes (--episodes=none).");
  } else {
    const limit =
      OPTS.episodes === "all" ? seeded.length : Math.min(parseInt(OPTS.episodes, 10), seeded.length);

    const targets = seeded.slice(0, limit);
    console.log(`Episodes for ${targets.length} anime. This is the slow part.\n`);

    let done = 0;
    let skipped = 0;
    let totalEpisodes = 0;

    for (const s of targets) {
      done++;
      const prefix = `  [${String(done).padStart(3)}/${targets.length}] ${s.title.slice(0, 45)}`;

      if (!OPTS.forceEpisodes && (await alreadyHasEpisodes(s.animeId))) {
        console.log(`${prefix} — already stored, skipping`);
        skipped++;
        continue;
      }

      try {
        const n = await seedEpisodes(s.malId, s.animeId);
        totalEpisodes += n;
        console.log(`${prefix} — ${n} episodes`);
      } catch (e) {
        // One bad title must not kill a ten-minute run.
        console.warn(`${prefix} — FAILED: ${e.message}`);
      }
      await sleep(THROTTLE_MS);
    }

    console.log(
      `\nEpisodes: ${totalEpisodes} inserted, ${skipped} anime skipped (already had them).`
    );
  }

  // The matview is built from anime + scores, so it is stale the moment we seed.
  await db.query("REFRESH MATERIALIZED VIEW top_by_genre").catch((e) => {
    console.warn("Could not refresh top_by_genre:", e.message);
  });

  const summary = await db.query(
    `SELECT (SELECT count(*) FROM anime)    AS anime,
            (SELECT count(*) FROM genres)   AS genres,
            (SELECT count(*) FROM studios)  AS studios,
            (SELECT count(*) FROM episodes) AS episodes,
            (SELECT count(DISTINCT anime_id) FROM episodes) AS anime_with_episodes`
  );
  const c = summary.rows[0];

  console.log(
    `\nDone. ${c.anime} anime, ${c.genres} genres, ${c.studios} studios, ` +
      `${c.episodes} episodes across ${c.anime_with_episodes} titles.`
  );
  console.log("Tip: `npm run db:dump` now, and commit it — teammates skip all of this.");

  await db.end();
}

main().catch(async (e) => {
  console.error("\nSeed failed:", e.message);
  await db.end().catch(() => {});
  process.exit(1);
});
