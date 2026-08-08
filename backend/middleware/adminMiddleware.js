// adminMiddleware — require a verified JWT whose user is flagged is_admin.
//
// Deliberately re-reads is_admin from the database rather than trusting a claim
// baked into the token: tokens live for 7 days, so a role revoked today would
// otherwise keep working until next week. One indexed primary-key lookup is a
// cheap price for that.
//
// Grant the flag with:  npm run db:make-admin -- someone@example.com
const auth = require("./authMiddleware");
const db = require("../db");

function requireAdmin(req, res, next) {
  // reuse the JWT verification rather than reimplementing it
  auth(req, res, async () => {
    try {
      const { rows } = await db.query("SELECT is_admin FROM users WHERE user_id = $1", [
        req.userId,
      ]);
      if (!rows[0]) return res.status(401).json({ error: "Invalid or expired token" });
      if (!rows[0].is_admin) {
        return res.status(403).json({
          error: "Admin only. Grant access with: npm run db:make-admin -- <your email>",
        });
      }
      req.isAdmin = true;
      next();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}

module.exports = requireAdmin;
