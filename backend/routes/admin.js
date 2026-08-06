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

// POST /api/admin/bulk-drop -> CALL bulk_drop_inactive(months)
router.post("/bulk-drop", async (req, res) => {
  try {
    const months = req.body.months !== undefined ? parseInt(req.body.months, 10) : 6;
    const client = await db.pool.connect();
    let notice = null;
    const onNotice = (m) => { notice = m.message; };
    client.on("notice", onNotice);
    try {
      await client.query("CALL bulk_drop_inactive($1)", [months]);
      res.json({ status: "ok", notice });
    } finally {
      client.removeListener("notice", onNotice);
      client.release();
    }
  } catch (e) {
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
