// routes/admin.js — maintenance endpoints. Kept unauthenticated for the demo per
// the Phase 4 contract; in production this would sit behind an admin guard.
const express = require("express");
const db = require("../db");

const router = express.Router();

// POST /api/admin/refresh -> recompute the top_by_genre materialized view
router.post("/refresh", async (req, res) => {
  try {
    await db.query("REFRESH MATERIALIZED VIEW top_by_genre");
    res.json({ status: "ok", refreshed: "top_by_genre" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
