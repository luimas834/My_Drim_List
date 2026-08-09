// routes/anime.js — catalog browse/search/detail + trending + top-by-genre.
// Reads come from anime_card_view, the top_by_genre matview, and the trending query.
// IMPORTANT: /trending and /top are declared BEFORE /:id so they aren't captured by it.
const express = require("express");
const db = require("../db");
const fail = require("../lib/fail");

const router = express.Router();

// Sort keys are interpolated into the SQL, so they can never come from user
// input directly — this whitelist is the only way a sort clause is produced.
// Every option ends with anime_id to keep paging stable when values tie.
const SORTS = {
  score: "acv.score DESC NULLS LAST, acv.anime_id",
  popularity: "acv.member_count DESC, acv.score DESC NULLS LAST, acv.anime_id",
  newest: "acv.aired_from DESC NULLS LAST, acv.anime_id",
  oldest: "acv.aired_from ASC NULLS LAST, acv.anime_id",
  title: "acv.title ASC, acv.anime_id",
  episodes: "acv.episode_count DESC NULLS LAST, acv.anime_id",
  reviews: "acv.review_count DESC, acv.score DESC NULLS LAST, acv.anime_id",
};

// GET /api/anime?page=&q=&genre=&studio=&year=&status=&sort=
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const offset = (page - 1) * limit;
    const orderBy = SORTS[req.query.sort] || SORTS.score;

    const params = [];
    const where = [];
    if (req.query.q) {
      // Two index types for two query shapes, OR'd together:
      //   - the GIN tsvector handles whole words, stemming and synopsis text,
      //     so "attack titan" finds Attack on Titan
      //   - the GIN trigram index on title handles partial input, so "narut"
      //     matches while the user is still typing. Full-text alone cannot:
      //     "narut" is not a word, so it stems to nothing and matches nothing
      params.push(req.query.q);
      where.push(`acv.anime_id IN (
        SELECT a2.anime_id FROM anime a2
        WHERE a2.search_vector @@ websearch_to_tsquery('english', $${params.length})
           OR a2.title ILIKE '%' || $${params.length} || '%'
      )`);
    }
    if (req.query.year) {
      params.push(parseInt(req.query.year, 10));
      where.push(`acv.year = $${params.length}`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      where.push(`acv.status = $${params.length}`);
    }
    if (req.query.studio) {
      // Same EXISTS-against-the-bridge pattern as the genre filter, using
      // idx_anime_studios_s. anime_card_view exposes studios as a STRING_AGG,
      // which is fine to display and useless to filter on.
      params.push(req.query.studio);
      where.push(`EXISTS (
        SELECT 1
        FROM anime_studios ast
        JOIN studios st ON st.studio_id = ast.studio_id
        WHERE ast.anime_id = acv.anime_id
          AND st.name = $${params.length}
      )`);
    }
    if (req.query.genre) {
      // Was: genres ILIKE '%Action%' against the view's STRING_AGG output. That
      // reads a comma-joined string, so it could never use idx_anime_genres_g,
      // and it substring-matched — filtering on "Drama" also returned anything
      // tagged "Psychological Drama". Testing membership against the bridge
      // table instead is both exact and indexed.
      params.push(req.query.genre);
      where.push(`EXISTS (
        SELECT 1
        FROM anime_genres ag
        JOIN genres g ON g.genre_id = ag.genre_id
        WHERE ag.anime_id = acv.anime_id
          AND g.name = $${params.length}
      )`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    params.push(limit);
    params.push(offset);
    // COUNT(*) OVER() is a window function evaluated over the full filtered set
    // *before* LIMIT/OFFSET are applied, so every returned row carries the total
    // number of matches. That gives the client a real page count without a
    // second round trip and without the two queries disagreeing under concurrent
    // writes. The cost is the same scan the filter already needed.
    const { rows } = await db.query(
      `SELECT acv.*, COUNT(*) OVER() AS total_count
       FROM anime_browse_view acv
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/genres  -> the genre list, for filter dropdowns.
// Previously the client derived this from the top_by_genre matview, which only
// contains genres that have at least one scored anime — so a genre with no
// reviews yet was unfilterable.
router.get("/genres", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT g.genre_id, g.name, COUNT(ag.anime_id)::INT AS anime_count
       FROM genres g
       LEFT JOIN anime_genres ag ON ag.genre_id = g.genre_id
       GROUP BY g.genre_id
       HAVING COUNT(ag.anime_id) > 0
       ORDER BY g.name`
    );
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/search?q=&limit=  -> ranked full-text search, for the search box
router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30);
    const { rows } = await db.query("SELECT * FROM search_anime($1, $2)", [q, limit]);
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/random -> one random anime, for the "surprise me" button.
// TABLESAMPLE is faster but approximate and can return nothing on a small
// table; at this catalogue size ORDER BY random() is honest and instant.
router.get("/random", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT anime_id FROM anime WHERE score IS NOT NULL ORDER BY random() LIMIT 1`
    );
    if (!rows[0]) return res.status(404).json({ error: "Catalogue is empty" });
    res.json(rows[0]);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/years -> release years with counts, for the filter dropdown
router.get("/years", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM get_catalogue_years()");
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/statuses -> distinct airing statuses present in the catalogue
router.get("/statuses", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT status, COUNT(*)::INT AS anime_count
       FROM anime WHERE status IS NOT NULL
       GROUP BY status ORDER BY anime_count DESC`
    );
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/studios  -> studio list with aggregates, for filters and browsing
router.get("/studios", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT studio_id, name, anime_count, avg_score, best_score, total_episodes
       FROM studio_card_view
       WHERE anime_count > 0
       ORDER BY anime_count DESC, name`
    );
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/studios/top?limit=&min= -> ranked leaderboard
router.get("/studios/top", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const min = parseInt(req.query.min, 10) || 2;
    const { rows } = await db.query("SELECT * FROM get_top_studios($1, $2)", [limit, min]);
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/studios/:studioId -> one studio's full catalogue
router.get("/studios/:studioId", async (req, res) => {
  try {
    const studioId = parseInt(req.params.studioId, 10);
    if (Number.isNaN(studioId)) return res.status(400).json({ error: "Invalid studio id" });

    const [studioQ, animeQ] = await Promise.all([
      db.query("SELECT * FROM studio_card_view WHERE studio_id = $1", [studioId]),
      db.query("SELECT * FROM get_studio_anime($1)", [studioId]),
    ]);

    if (!studioQ.rows[0]) return res.status(404).json({ error: "Studio not found" });
    res.json({ ...studioQ.rows[0], anime: animeQ.rows });
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/trending  -> watchers-this-week multi-join aggregation
router.get("/trending", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.anime_id, a.title, a.cover_image,
              COUNT(DISTINCT w.user_id) AS watchers_this_week,
              ROUND(AVG(r.score)::numeric,2) AS avg_score,
              STRING_AGG(DISTINCT g.name, ', ') AS genres
       FROM anime a
       LEFT JOIN watchlist w ON w.anime_id=a.anime_id AND w.updated_at > NOW() - INTERVAL '7 days'
       LEFT JOIN reviews r   ON r.anime_id=a.anime_id
       LEFT JOIN anime_genres ag ON ag.anime_id=a.anime_id
       LEFT JOIN genres g    ON g.genre_id=ag.genre_id
       GROUP BY a.anime_id ORDER BY watchers_this_week DESC LIMIT 20`
    );
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/top?genre=  -> pre-ranked rows from the top_by_genre matview (rnk <= 10)
router.get("/top", async (req, res) => {
  try {
    const params = [];
    let genreFilter = "";
    if (req.query.genre) {
      params.push(req.query.genre);
      genreFilter = `AND genre = $${params.length}`;
    }
    const { rows } = await db.query(
      `SELECT genre_id, genre, anime_id, title, cover_image, score, rnk
       FROM top_by_genre
       WHERE rnk <= 10 ${genreFilter}
       ORDER BY genre, rnk`,
      params
    );
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/:id/similar?limit= -> "more like this", by genre/studio overlap
router.get("/:id/similar", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 24);
    const { rows } = await db.query("SELECT * FROM get_similar_anime($1, $2)", [id, limit]);
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/:id/score-distribution -> ten buckets, always all ten
router.get("/:id/score-distribution", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { rows } = await db.query("SELECT * FROM get_score_distribution($1)", [id]);
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

// GET /api/anime/:id  -> anime row + nested genres/studios/episodes arrays
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const animeQ = await db.query(`SELECT * FROM anime WHERE anime_id = $1`, [id]);
    if (!animeQ.rows[0]) return res.status(404).json({ error: "Anime not found" });

    const [genresQ, studiosQ, episodesQ, discussionQ] = await Promise.all([
      db.query(
        `SELECT g.genre_id, g.name FROM genres g
         JOIN anime_genres ag ON ag.genre_id = g.genre_id
         WHERE ag.anime_id = $1 ORDER BY g.name`,
        [id]
      ),
      db.query(
        `SELECT s.studio_id, s.name FROM studios s
         JOIN anime_studios ast ON ast.studio_id = s.studio_id
         WHERE ast.anime_id = $1 ORDER BY s.name`,
        [id]
      ),
      // episode_card_view carries comment_count and last_comment_at, so the
      // whole season's discussion activity arrives with the episode list
      // instead of one extra request per episode
      db.query(
        `SELECT episode_id, episode_number, title, aired_on,
                comment_count, last_comment_at
         FROM episode_card_view WHERE anime_id = $1 ORDER BY episode_number`,
        [id]
      ),
      db.query(`SELECT * FROM get_anime_discussion_stats($1)`, [id]),
    ]);

    res.json({
      ...animeQ.rows[0],
      genres: genresQ.rows,
      studios: studiosQ.rows,
      episodes: episodesQ.rows,
      discussion_stats: discussionQ.rows[0] || {
        total_comments: 0,
        episodes_with_comments: 0,
        participants: 0,
      },
    });
  } catch (e) {
    return fail(res, e);
  }
});

module.exports = router;
