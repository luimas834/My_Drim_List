// sql/make-admin.js — promote a registered user to admin.
//
//   npm run db:make-admin -- someone@example.com
//   node sql/make-admin.js someone@example.com --revoke
//
// Admin is required by the maintenance routes (POST /api/admin/refresh and
// /api/admin/bulk-drop) and therefore by the buttons on the /demo page. Register
// through the UI first, then run this against that email.
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const revoke = process.argv.includes("--revoke");
const email = args[0];

if (!email) {
  console.error("Usage: npm run db:make-admin -- <email> [--revoke]");
  process.exit(1);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Create backend/.env first.");
    process.exit(1);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const { rows } = await db.query(
    `UPDATE users SET is_admin = $2 WHERE email = $1
     RETURNING user_id, username, email, is_admin`,
    [email, !revoke]
  );

  if (!rows[0]) {
    const known = await db.query(`SELECT email FROM users ORDER BY user_id LIMIT 10`);
    console.error(`No user with email "${email}".`);
    if (known.rows.length) {
      console.error("Registered emails:");
      known.rows.forEach((r) => console.error(`  - ${r.email}`));
    } else {
      console.error("No users registered yet — sign up in the app first.");
    }
    await db.end();
    process.exit(1);
  }

  const u = rows[0];
  await db.end();
  console.log(
    `${u.username} <${u.email}> is ${u.is_admin ? "now an admin" : "no longer an admin"}.`
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
