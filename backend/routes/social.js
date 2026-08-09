//routes/social.js — following and notifications.
//self-follow is blocked by BOTH a CHECK constraint and the trg_self_follow trigger;
//notifications rows are written by triggers, never by this file.
const express = require("express");
const db = require("../db");
const fail = require("../lib/fail");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

//POST /api/users/:id/follow — follow a user (fires the new_follower notification)
router.post("/users/:id/follow", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `INSERT INTO followers (follower_id, following_id)
       VALUES ($1, $2)
       RETURNING *`,
      [req.userId, req.params.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    //SELF_FOLLOW: raised by the BEFORE INSERT trigger
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    if (e.code === "23514") return res.status(400).json({ error: "You cannot follow yourself" });
    if (e.code === "23505") return res.status(409).json({ error: "Already following this user" });
    if (e.code === "23503") return res.status(404).json({ error: "User not found" });
    return fail(res, e);
  }
});

//DELETE /api/users/:id/follow — unfollow a user
router.delete("/users/:id/follow", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM followers
       WHERE follower_id = $1 AND following_id = $2
       RETURNING *`,
      [req.userId, req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ error: "You are not following this user" });

    res.json({ message: "Unfollowed successfully", follow: rows[0] });
  } catch (e) {
    return fail(res, e);
  }
});

//GET /api/notifications — my notifications, newest first
router.get("/notifications", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT notification_id, user_id, type, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC, notification_id DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (e) {
    return fail(res, e);
  }
});

//GET /api/notifications/unread-count — for the navbar badge.
//COUNT with a WHERE beats fetching every notification and filtering in the
//client, which is what the navbar would otherwise have to do on every page.
router.get("/notifications/unread-count", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*)::INT AS unread
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.userId]
    );
    res.json(rows[0]);
  } catch (e) {
    return fail(res, e);
  }
});

//PATCH /api/notifications/read-all — mark every unread notification of mine read.
//One statement for the whole set; the WHERE clause is the authorisation.
router.patch("/notifications/read-all", auth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.userId]
    );
    res.json({ marked_read: rowCount });
  } catch (e) {
    return fail(res, e);
  }
});

//PATCH /api/notifications/:id/read — mark one of my notifications as read
router.patch("/notifications/:id/read", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE notification_id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.userId]
    );

    //no row means it does not exist or belongs to someone else
    if (!rows[0]) return res.status(404).json({ error: "Notification not found" });

    res.json(rows[0]);
  } catch (e) {
    return fail(res, e);
  }
});

module.exports = router;
