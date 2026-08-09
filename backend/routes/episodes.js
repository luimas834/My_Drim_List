//routes/episodes.js — per-episode discussion threads.
//no business logic here: the edit flag and the reply notifications are database
//triggers (06_discussions.sql), and the feed is a PL/pgSQL function. Ownership is
//enforced in the SQL WHERE clause, not with a "is this mine?" pre-check.
const express = require("express");
const db = require("../db");
const fail = require("../lib/fail");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

//GET /api/episodes/recent-discussions?limit= — site-wide activity feed
//declared before the parameterised routes so it is never captured by them
router.get("/recent-discussions", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const { rows } = await db.query("SELECT * FROM get_recent_discussions($1)", [limit]);
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

//PATCH /api/episodes/discussions/:discussionId — edit your own comment
//trg_discussion_edit_flag stamps is_edited/edited_at, and only when the text
//actually changed
router.patch("/discussions/:discussionId", auth, async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "comment is required" });
    }

    const { rows } = await db.query(
      `UPDATE episode_discussions
       SET comment = $3
       WHERE discussion_id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.discussionId, req.userId, comment.trim()]
    );

    //no row means it does not exist or belongs to someone else — same answer either way
    if (!rows[0]) return res.status(404).json({ error: "Comment not found" });

    res.json(rows[0]);
  } catch (e) {
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    return fail(res, e);
  }
});

//DELETE /api/episodes/discussions/:discussionId — remove your own comment
router.delete("/discussions/:discussionId", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM episode_discussions
       WHERE discussion_id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.discussionId, req.userId]
    );

    if (!rows[0]) return res.status(404).json({ error: "Comment not found" });

    res.json({ message: "Deleted successfully", discussion: rows[0] });
  } catch (e) {
    return fail(res, e);
  }
});

//GET /api/episodes/:episodeId/discussions — comments on an episode, oldest first
router.get("/:episodeId/discussions", async (req, res) => {
  try {
    const episodeId = parseInt(req.params.episodeId, 10);
    if (Number.isNaN(episodeId)) return res.status(400).json({ error: "Invalid episode id" });

    const { rows } = await db.query(
      `SELECT d.discussion_id, d.episode_id, d.user_id, d.comment,
              d.is_edited, d.edited_at, d.created_at,
              u.username
       FROM episode_discussions d
       JOIN users u ON u.user_id = d.user_id
       WHERE d.episode_id = $1
       ORDER BY d.created_at ASC, d.discussion_id ASC`,
      [episodeId]
    );
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

//POST /api/episodes/:episodeId/discussions — comment on an episode
//fires trg_notify_discussion, which notifies everyone already in the thread
router.post("/:episodeId/discussions", auth, async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "comment is required" });
    }

    const { rows } = await db.query(
      `INSERT INTO episode_discussions (episode_id, user_id, comment)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.episodeId, req.userId, comment.trim()]
    );

    //return the username too so the client can render without a second request
    const { rows: withUser } = await db.query(
      `SELECT d.discussion_id, d.episode_id, d.user_id, d.comment,
              d.is_edited, d.edited_at, d.created_at, u.username
       FROM episode_discussions d
       JOIN users u ON u.user_id = d.user_id
       WHERE d.discussion_id = $1`,
      [rows[0].discussion_id]
    );

    res.status(201).json(withUser[0]);
  } catch (e) {
    //the FK to episodes is what tells us the episode does not exist
    if (e.code === "23503") return res.status(404).json({ error: "Episode not found" });
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    return fail(res, e);
  }
});

module.exports = router;
