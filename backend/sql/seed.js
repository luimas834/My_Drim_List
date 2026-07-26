// Node 18+ has global fetch. Otherwise: npm i node-fetch  and import it.
const { Pool } = require("pg");
require("dotenv").config();

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Polite fetch with backoff. Retries on 429 (rate limit) AND transient 5xx
// (Jikan's gateway occasionally 502/503/504s), plus network errors.
async function jikan(url, tries = 0) {
  try {
    // MAL's origin is flaky; Jikan serves a STALE cache only for the identity
    // (no-compression) cache key. undici defaults to "gzip, deflate, br", which
    // misses that cache and 504s. Sending an empty Accept-Encoding matches curl
    // and hits the stale cache. (Harmless when the origin is healthy.)
    const res = await fetch(url, {
      headers: {
        "User-Agent": "MDL-seed/1.0",
        "Accept": "application/json",
        "Accept-Encoding": "",
      },
    });
    if ((res.status === 429 || res.status >= 500) && tries < 10) {
      await sleep(2000 * (tries + 1));
      return jikan(url, tries + 1);
    }
    if (!res.ok) throw new Error(`Jikan ${res.status} for ${url}`);
    return res.json();
  } catch (e) {
    if (tries < 10) {                // transient network error: back off and retry
      await sleep(2000 * (tries + 1));
      return jikan(url, tries + 1);
    }
    throw e;
  }
}

async function upsertAnime(a) {
  const { rows } = await db.query(
    `INSERT INTO anime (mal_id, title, synopsis, cover_image, episode_count, status, score,
                        aired_from, aired_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (mal_id) DO UPDATE SET score = EXCLUDED.score
     RETURNING anime_id`,
    [a.mal_id, a.title, a.synopsis, a.images?.jpg?.large_image_url, a.episodes,
     a.status, a.score, a.aired?.from?.slice(0,10) || null, a.aired?.to?.slice(0,10) || null]
  );
  const animeId = rows[0].anime_id;

  for (const g of a.genres || []) {
    const gid = (await db.query(
      `INSERT INTO genres(name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING genre_id`, [g.name]
    )).rows[0].genre_id;
    await db.query(`INSERT INTO anime_genres VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                   [animeId, gid]);
  }
  for (const s of a.studios || []) {
    const sid = (await db.query(
      `INSERT INTO studios(name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING studio_id`, [s.name]
    )).rows[0].studio_id;
    await db.query(`INSERT INTO anime_studios VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                   [animeId, sid]);
  }
  return animeId;
}

async function seedEpisodes(malId, animeId) {
  const data = await jikan(`https://api.jikan.moe/v4/anime/${malId}/episodes`);
  for (const ep of data.data || []) {
    await db.query(
      `INSERT INTO episodes(anime_id, episode_number, title, aired_on)
       VALUES ($1,$2,$3,$4) ON CONFLICT (anime_id, episode_number) DO NOTHING`,
      [animeId, ep.mal_id, ep.title, ep.aired?.slice(0,10) || null]
    );
  }
}

async function main() {
  const seeded = [];
  for (let page = 1; page <= 5; page++) {          // ~125 anime
    console.log(`Fetching top anime page ${page}...`);
    try {
      const json = await jikan(`https://api.jikan.moe/v4/top/anime?page=${page}`);
      for (const a of json.data) {
        const id = await upsertAnime(a);
        seeded.push({ malId: a.mal_id, animeId: id });
      }
    } catch (e) {
      // MAL's origin is intermittently down; skip a dead page rather than abort
      // the whole run. Re-running the script later (idempotent upserts) fills gaps.
      console.warn(`page ${page} failed, skipping: ${e.message}`);
    }
    await sleep(1200);
  }

  console.log("Seeding episodes for first 20 anime...");
  for (const s of seeded.slice(0, 20)) {           // episodes are heavy — subset only
    try { await seedEpisodes(s.malId, s.animeId); } catch (e) { console.warn(e.message); }
    await sleep(1200);
  }

  console.log(`Done. Seeded ${seeded.length} anime.`);
  await db.query("REFRESH MATERIALIZED VIEW top_by_genre;").catch(() => {});
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
