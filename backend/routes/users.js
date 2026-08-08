const express = require("express");
const db = require("../db");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// GET /api/users/me/recommendations - auth required
router.get("/me/recommendations", auth, async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("DISCARD PLANS");
    const { rows } = await client.query("SELECT * FROM recommend_anime($1)", [req.userId]);
    res.json(rows);
  } catch (e) {
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// GET /api/users/me/history?after=&limit= - auth required
router.get("/me/history", auth, async (req, res) => {
  try {
    const after = parseInt(req.query.after, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || 10;
    const { rows } = await db.query("SELECT * FROM get_watch_history($1, $2, $3)", [req.userId, after, limit]);
    res.json(rows);
  } catch (e) {
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/me/activity?limit= - auth required
router.get("/me/activity", auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const { rows } = await db.query(
      `SELECT l.log_id, l.action_type, l.details, l.logged_at, a.title
       FROM activity_log l
       LEFT JOIN anime a ON a.anime_id = l.anime_id
       WHERE l.user_id = $1
       ORDER BY l.logged_at DESC, l.log_id DESC
       LIMIT $2`,
      [req.userId, limit]
    );
    res.json(rows);
  } catch (e) {
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/:id - no auth required
router.get("/:id", async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });
    const { rows } = await db.query(
      `SELECT u.user_id, u.username, u.profile_pic, u.bio, u.created_at,
              (SELECT COUNT(*)::INT FROM followers WHERE following_id = u.user_id) AS followers_count,
              (SELECT COUNT(*)::INT FROM followers WHERE follower_id = u.user_id) AS following_count
       FROM users u WHERE u.user_id = $1`,
      [userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/:id/stats - no auth required
router.get("/:id/stats", async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });
    // get_user_stats aggregates over watchlist, and COUNT(*) over no rows is 0,
    // not "no rows" — so the function returns a row of zeros for a user id that
    // does not exist and the 404 below could never fire. Gating on EXISTS makes
    // the result set genuinely empty for an unknown user, still in one query.
    const { rows } = await db.query(
      `SELECT s.* FROM get_user_stats($1) s
       WHERE EXISTS (SELECT 1 FROM users WHERE user_id = $1)`,
      [userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (e) {
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/:id/follow-status - auth required
router.get("/:id/follow-status", auth, async (req, res) => {
  try {
    const followingId = parseInt(req.params.id, 10);
    if (isNaN(followingId)) return res.status(400).json({ error: "Invalid user ID" });
    const { rows } = await db.query(
      "SELECT EXISTS(SELECT 1 FROM followers WHERE follower_id = $1 AND following_id = $2) AS is_following",
      [req.userId, followingId]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
