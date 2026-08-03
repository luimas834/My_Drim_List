//routes/episodes.js — per-episode discussion threads.
const express = require("express");
const db = require("../db");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

//GET /api/episodes/:episodeId/discussions — comments on an episode, oldest first
router.get("/:episodeId/discussions", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.discussion_id, d.episode_id, d.user_id, d.comment, d.created_at,
              u.username
       FROM episode_discussions d
       JOIN users u ON u.user_id = d.user_id
       WHERE d.episode_id = $1
       ORDER BY d.created_at ASC, d.discussion_id ASC`,
      [req.params.episodeId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
