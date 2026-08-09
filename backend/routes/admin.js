// routes/admin.js — maintenance endpoints.
//
// These reach straight into the database: one rebuilds a materialized view, the
// other mass-updates watchlist rows. Both are now behind requireAdmin — a
// verified JWT whose user has is_admin set. Previously they were open to anyone
// who could reach the port, which was fine for a local demo and indefensible
// anywhere else.
//
// Grant yourself access after registering:
//   npm run db:make-admin -- your@email.com
const express = require("express");
const db = require("../db");
const fail = require("../lib/fail");
const requireAdmin = require("../middleware/adminMiddleware");

const router = express.Router();

// POST /api/admin/refresh -> recompute the top_by_genre materialized view
router.post("/refresh", requireAdmin, async (req, res) => {
  try {
    await db.query("REFRESH MATERIALIZED VIEW top_by_genre");
    res.json({ status: "ok", refreshed: "top_by_genre" });
  } catch (e) {
    return fail(res, e);
  }
});

// POST /api/admin/bulk-drop -> CALL bulk_drop_inactive(months)
router.post("/bulk-drop", requireAdmin, async (req, res) => {
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
    return fail(res, e);
  }
});

module.exports = router;
