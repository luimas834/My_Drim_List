//routes/social.js — following and notifications.
//self-follow is blocked by BOTH a CHECK constraint and the trg_self_follow trigger;
//notifications rows are written by triggers, never by this file.
const express = require("express");
const db = require("../db");
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
    console.error(e);
    res.status(500).json({ error: "Server error" });
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
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
