// sql/seed-anilist.js — fallback catalogue source.
//
//   node sql/seed-anilist.js                  ~150 anime with episodes
//   node sql/seed-anilist.js --pages=2        fewer
//   node sql/seed-anilist.js --episodes=none  catalogue only
//
// Same destination tables and the same idempotency rules as seed.js, different
// upstream. Jikan is a free MyAnimeList scraper and goes down; AniList is a
// separate service with its own infrastructure, so the two failing at once is
// unlikely. Having a second source means a dead API is an inconvenience rather
// than a blocked project.
//
// AniList is GraphQL over a single POST endpoint, no API key for public reads,
// and rate limits at 90 requests/minute — we stay well under.
//
// One difference worth knowing: AniList exposes an episode COUNT and, for many
// titles, a list of streaming episode titles, but not a clean per-episode index
// the way Jikan does. Where real titles are unavailable we generate
// "Episode N" rows so the discussion threads still have something to hang off.
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENDPOINT = "https://graphql.anilist.co";
const THROTTLE_MS = 800;
const MAX_TRIES = 6;

function flag(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

const OPTS = {
  pages: parseInt(flag("pages", "10"), 10), // 50 per page -> ~500 anime
  perPage: parseInt(flag("per-page", "50"), 10),
  episodes: flag("episodes", "all"),
  maxEpisodes: parseInt(flag("max-episodes", "400"), 10),
};

const QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ANIME, sort: SCORE_DESC, format_in: [TV, MOVIE, OVA, ONA], isAdult: false) {
      idMal
      title { romaji english }
      description(asHtml: false)
      coverImage { large }
      episodes
      status
      averageScore
      startDate { year month day }
      endDate { year month day }
      genres
      studios(isMain: true) { nodes { name } }
      streamingEpisodes { title }
    }
  }
}`;

async function anilist(page, tries = 0) {
  const backoff = async (why) => {
    const wait = 2000 * Math.pow(2, tries);
    console.log(`\n    ${why} — retry ${tries + 1}/${MAX_TRIES} in ${wait / 1000}s`);
    await sleep(wait);
    return anilist(page, tries + 1);
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { page, perPage: OPTS.perPage } }),
    });
  } catch (e) {
    if (tries < MAX_TRIES) return backoff(`network error (${e.message})`);
    throw new Error(`network error: ${e.message}`);
  }

  if ((res.status === 429 || res.status >= 500) && tries < MAX_TRIES) {
    return backoff(`AniList ${res.status}`);
  }
  if (!res.ok) throw new Error(`AniList ${res.status}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error(`AniList: ${json.errors[0].message}`);
  return json.data.Page;
}

// ------------------------------------------------------------ normalisation
const toDate = (d) =>
  d?.year ? `${d.year}-${String(d.month || 1).padStart(2, "0")}-${String(d.day || 1).padStart(2, "0")}` : null;

// AniList scores are 0-100, ours are 0-10 to match the MAL scale already in use
const toScore = (n) => (typeof n === "number" ? Math.round((n / 10) * 100) / 100 : null);

const STATUS = {
  FINISHED: "Finished Airing",
  RELEASING: "Currently Airing",
  NOT_YET_RELEASED: "Not yet aired",
  CANCELLED: "Cancelled",
  HIATUS: "On Hiatus",
};

const stripHtml = (s) =>
  s ? s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() : null;

// ------------------------------------------------------------------ upserts
async function upsertAnime(m) {
  const title = m.title?.english || m.title?.romaji;
  if (!title || !m.idMal) return null; // mal_id is our upsert key; skip without it

  const score = toScore(m.averageScore);

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
      m.idMal,
      title.slice(0, 255),
      stripHtml(m.description),
      m.coverImage?.large || null,
      m.episodes,
      STATUS[m.status] || m.status,
      score,
      toDate(m.startDate),
      toDate(m.endDate),
    ]
  );
  const animeId = rows[0].anime_id;

  for (const name of m.genres || []) {
    const gid = (
      await db.query(
        `INSERT INTO genres(name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING genre_id`,
        [name.slice(0, 50)]
      )
    ).rows[0].genre_id;
    await db.query(`INSERT INTO anime_genres VALUES ($1,$2) ON CONFLICT DO NOTHING`, [animeId, gid]);
  }

  for (const s of m.studios?.nodes || []) {
    const sid = (
      await db.query(
        `INSERT INTO studios(name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING studio_id`,
        [s.name.slice(0, 100)]
      )
    ).rows[0].studio_id;
    await db.query(`INSERT INTO anime_studios VALUES ($1,$2) ON CONFLICT DO NOTHING`, [animeId, sid]);
  }

  return { animeId, media: m };
}

// AniList has no per-episode endpoint. Generate rows from the episode count,
// using real streaming titles where the counts line up.
async function seedEpisodes(animeId, m) {
  const total = Math.min(m.episodes || 0, OPTS.maxEpisodes);
  if (!total) return 0;

  const streamed = m.streamingEpisodes || [];
  const useReal = streamed.length === m.episodes;

  for (let n = 1; n <= total; n++) {
    const title = useReal ? streamed[n - 1]?.title?.slice(0, 255) : null;
    await db.query(
      `INSERT INTO episodes(anime_id, episode_number, title, aired_on)
       VALUES ($1,$2,$3,NULL)
       ON CONFLICT (anime_id, episode_number) DO NOTHING`,
      [animeId, n, title || `Episode ${n}`]
    );
  }
  return total;
}

// ---------------------------------------------------------------------- main
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Create backend/.env first.");
    process.exit(1);
  }

  console.log(
    `Seeding from AniList: ${OPTS.pages} page(s) x ${OPTS.perPage}, episodes=${OPTS.episodes}\n`
  );

  const seeded = [];
  const failedPages = [];

  for (let page = 1; page <= OPTS.pages; page++) {
    process.stdout.write(`page ${page}/${OPTS.pages} ... `);
    let data;
    try {
      data = await anilist(page);
    } catch (e) {
      console.log(`FAILED (${e.message})`);
      failedPages.push(page);
      continue;
    }

    let n = 0;
    for (const m of data.media || []) {
      const result = await upsertAnime(m);
      if (result) {
        seeded.push(result);
        n++;
      }
    }
    console.log(`${n} titles`);

    if (!data.pageInfo?.hasNextPage) break;
    await sleep(THROTTLE_MS);
  }

  if (!seeded.length) {
    console.error(
      "\nNo anime were seeded — every request to AniList failed too.\n" +
        "Two independent APIs failing points at your own network: a proxy, a firewall,\n" +
        "or DNS. Try: curl -v https://graphql.anilist.co"
    );
    await db.end();
    process.exit(1);
  }

  console.log(`\nCatalogue: ${seeded.length} anime upserted.`);
  if (failedPages.length) console.log(`  pages failed: ${failedPages.join(", ")} — re-run to fill in.`);

  if (OPTS.episodes === "none") {
    console.log("\nSkipping episodes (--episodes=none).");
  } else {
    const limit =
      OPTS.episodes === "all" ? seeded.length : Math.min(parseInt(OPTS.episodes, 10), seeded.length);
    console.log(`\nGenerating episodes for ${limit} anime (no extra requests — counts are already fetched).`);

    let total = 0;
    for (const s of seeded.slice(0, limit)) {
      total += await seedEpisodes(s.animeId, s.media);
    }
    console.log(`  ${total} episode rows.`);
  }

  await db.query("REFRESH MATERIALIZED VIEW top_by_genre").catch((e) =>
    console.warn("Could not refresh top_by_genre:", e.message)
  );

  const c = (
    await db.query(
      `SELECT (SELECT count(*) FROM anime)    AS anime,
              (SELECT count(*) FROM genres)   AS genres,
              (SELECT count(*) FROM studios)  AS studios,
              (SELECT count(*) FROM episodes) AS episodes`
    )
  ).rows[0];

  console.log(
    `\nDone. ${c.anime} anime, ${c.genres} genres, ${c.studios} studios, ${c.episodes} episodes.`
  );
  console.log("Run `npm run db:verify` next, then `npm run db:dump` to share it.");

  await db.end();
}

main().catch(async (e) => {
  console.error("\nSeed failed:", e.message);
  await db.end().catch(() => {});
  process.exit(1);
});
