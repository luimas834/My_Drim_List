//routes/watchlist.js — user watchlist management.
//all routes protected by auth middleware; user id read from req.userId.
//database triggers automatically update completion status, finished_at date, and activity_log.
const express = require("express");
const db = require("../db");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

//GET /api/watchlist/me — get current user watchlist joined with anime card view
router.get("/me", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT w.watchlist_id, w.user_id, w.anime_id, w.status, w.episodes_watched,
              w.user_score, w.started_at, w.finished_at, w.updated_at,
              ac.title, ac.cover_image, ac.score AS anime_score, ac.episode_count,
              ac.status AS anime_status, ac.genres, ac.studios
       FROM watchlist w
       JOIN anime_card_view ac ON ac.anime_id = w.anime_id
       WHERE w.user_id = $1
       ORDER BY w.updated_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//POST /api/watchlist — add or update anime status in watchlist (upsert)
router.post("/", auth, async (req, res) => {
  try {
    const { anime_id, status } = req.body;
    if (!anime_id || !status) {
      return res.status(400).json({ error: "anime_id and status are required" });
    }
    const { rows } = await db.query(
      `INSERT INTO watchlist (user_id, anime_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, anime_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
       RETURNING *`,
      [req.userId, anime_id, status]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23514") return res.status(400).json({ error: "Invalid status value" });
    if (e.code === "23503") return res.status(404).json({ error: "Anime not found" });
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//PATCH /api/watchlist/:animeId — partial update of watchlist entry
router.patch("/:animeId", auth, async (req, res) => {
  try {
    const { animeId } = req.params;
    const { status, episodes_watched, user_score } = req.body;

    const setClauses = [];
    const params = [req.userId, animeId];

    if (status !== undefined) {
      params.push(status);
      setClauses.push(`status = $${params.length}`);
    }
    if (episodes_watched !== undefined) {
      params.push(episodes_watched);
      setClauses.push(`episodes_watched = $${params.length}`);
    }
    if (user_score !== undefined) {
      params.push(user_score);
      setClauses.push(`user_score = $${params.length}`);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: "No update fields provided" });
    }

    const queryText = `
      UPDATE watchlist
      SET ${setClauses.join(", ")}
      WHERE user_id = $1 AND anime_id = $2
      RETURNING *
    `;

    const { rows } = await db.query(queryText, params);
    if (!rows[0]) {
      return res.status(404).json({ error: "Watchlist entry not found" });
    }

    res.json(rows[0]);
  } catch (e) {
    if (e.code === "23514") return res.status(400).json({ error: "Invalid status, score, or episode count" });
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//DELETE /api/watchlist/:animeId — delete watchlist entry (triggers review cleanup)
router.delete("/:animeId", auth, async (req, res) => {
  try {
    const { animeId } = req.params;
    const { rows } = await db.query(
      `DELETE FROM watchlist
       WHERE user_id = $1 AND anime_id = $2
       RETURNING *`,
      [req.userId, animeId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Watchlist entry not found" });
    }

    res.json({ message: "Deleted successfully", watchlist: rows[0] });
  } catch (e) {
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
