const express = require("express");
const db = require("../db");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// GET /api/users?q=&sort=&page= - the user directory.
// Following someone previously required already knowing their profile URL,
// which made the entire social half of the app undiscoverable.
const USER_SORTS = {
  active: "stats.total DESC NULLS LAST, u.user_id",
  newest: "u.created_at DESC, u.user_id",
  followers: "followers_count DESC, u.user_id",
  name: "u.username ASC",
};

router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 50);
    const offset = (page - 1) * limit;
    const orderBy = USER_SORTS[req.query.sort] || USER_SORTS.active;

    const params = [];
    let whereSql = "";
    if (req.query.q) {
      params.push(`%${req.query.q}%`);
      whereSql = `WHERE u.username ILIKE $${params.length}`;
    }

    params.push(limit, offset);
    const { rows } = await db.query(
      `SELECT u.user_id, u.username, u.profile_pic, u.bio, u.created_at,
              (SELECT COUNT(*)::INT FROM followers WHERE following_id = u.user_id) AS followers_count,
              (SELECT COUNT(*)::INT FROM followers WHERE follower_id  = u.user_id) AS following_count,
              stats.total     AS anime_count,
              stats.completed AS completed_count,
              stats.episodes  AS episodes_watched,
              COUNT(*) OVER() AS total_count
       FROM users u
       -- LATERAL lets the existing PL/pgSQL function run once per user row and
       -- have its columns join in, instead of reimplementing the aggregation here
       LEFT JOIN LATERAL get_user_stats(u.user_id) stats ON TRUE
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/users/me - edit your own profile.
// bio and profile_pic have been columns since the first migration and there was
// no way to set either of them.
router.patch("/me", auth, async (req, res) => {
  try {
    const { bio, profile_pic, username } = req.body;

    const setClauses = [];
    const params = [req.userId];

    if (bio !== undefined) {
      params.push(bio === "" ? null : bio);
      setClauses.push(`bio = $${params.length}`);
    }
    if (profile_pic !== undefined) {
      params.push(profile_pic === "" ? null : profile_pic);
      setClauses.push(`profile_pic = $${params.length}`);
    }
    if (username !== undefined) {
      const name = String(username).trim();
      if (name.length < 2 || name.length > 50) {
        return res.status(400).json({ error: "Username must be 2-50 characters" });
      }
      params.push(name);
      setClauses.push(`username = $${params.length}`);
    }

    if (!setClauses.length) return res.status(400).json({ error: "No update fields provided" });

    const { rows } = await db.query(
      `UPDATE users SET ${setClauses.join(", ")}
       WHERE user_id = $1
       RETURNING user_id, username, email, profile_pic, bio, is_admin, created_at`,
      params
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "That username is taken" });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

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

// GET /api/users/:id/watchlist?status= - anyone's list, publicly.
// A tracker where you cannot look at what other people are watching is missing
// the point. Same join as /watchlist/me, but keyed on the requested user rather
// than req.userId — and it never exposes anything private, because a watchlist
// has nothing private in it.
router.get("/:id/watchlist", async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

    const params = [userId];
    let statusSql = "";
    if (req.query.status) {
      params.push(req.query.status);
      statusSql = `AND w.status = $${params.length}`;
    }

    const { rows } = await db.query(
      `SELECT w.watchlist_id, w.anime_id, w.status, w.episodes_watched, w.user_score,
              w.started_at, w.finished_at, w.updated_at,
              ac.title, ac.cover_image, ac.score AS anime_score,
              ac.episode_count, ac.genres, ac.studios
       FROM watchlist w
       JOIN anime_card_view ac ON ac.anime_id = w.anime_id
       WHERE w.user_id = $1 ${statusSql}
       ORDER BY w.updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/:id/reviews - everything this user has reviewed
router.get("/:id/reviews", async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });
    const { rows } = await db.query(
      `SELECT r.review_id, r.anime_id, r.body, r.score, r.helpful_count,
              r.is_edited, r.edited_at, r.created_at,
              a.title, a.cover_image
       FROM reviews r
       JOIN anime a ON a.anime_id = r.anime_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/:id/followers - who follows this user
// followers is a self-referential M:N, so both directions are the same table
// read from opposite ends: followers joins on follower_id, following on
// following_id. That symmetry is the whole point of the design.
router.get("/:id/followers", async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });
    const { rows } = await db.query(
      `SELECT u.user_id, u.username, u.profile_pic, u.bio, f.followed_at
       FROM followers f
       JOIN users u ON u.user_id = f.follower_id
       WHERE f.following_id = $1
       ORDER BY f.followed_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/:id/following - who this user follows
router.get("/:id/following", async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });
    const { rows } = await db.query(
      `SELECT u.user_id, u.username, u.profile_pic, u.bio, f.followed_at
       FROM followers f
       JOIN users u ON u.user_id = f.following_id
       WHERE f.follower_id = $1
       ORDER BY f.followed_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (e) {
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
