// routes/anime.js — catalog browse/search/detail + trending + top-by-genre.
// Reads come from anime_card_view, the top_by_genre matview, and the trending query.
// IMPORTANT: /trending and /top are declared BEFORE /:id so they aren't captured by it.
const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/anime?page=&q=&genre=  -> paginated cards from anime_card_view
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    const params = [];
    const where = [];
    if (req.query.q) {
      params.push(`%${req.query.q}%`);
      where.push(`title ILIKE $${params.length}`);
    }
    if (req.query.genre) {
      params.push(`%${req.query.genre}%`);
      where.push(`genres ILIKE $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    params.push(limit);
    params.push(offset);
    const { rows } = await db.query(
      `SELECT * FROM anime_card_view
       ${whereSql}
       ORDER BY score DESC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
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
    console.error(e);
    res.status(500).json({ error: "Server error" });
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
    console.error(e);
    res.status(500).json({ error: "Server error" });
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
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
