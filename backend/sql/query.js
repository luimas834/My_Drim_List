// sql/query.js — run ad-hoc SQL against the project database.
//
//   npm run db:sql -- "SELECT user_id, username, is_admin FROM users"
//   npm run db:sql -- "SELECT * FROM get_user_stats(1)"
//   npm run db:sql                      (no argument: prints a menu of useful queries)
//   npm run db:sql -- --list            same menu
//   npm run db:sql -- --q=users         run a named query from the menu
//
// Why this exists rather than "just use psql": bare `psql mdl` connects as your
// operating-system username, which is usually not a PostgreSQL role — you get
// `FATAL: role "yourname" does not exist`. This reads DATABASE_URL from
// backend/.env, exactly like the app does, so it connects the same way the app
// connects. No role guessing, no -U flags, no shell quoting of a URL.
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Handy queries for demo prep and debugging.
const CANNED = {
  users: {
    sql: "SELECT user_id, username, email, is_admin, created_at FROM users ORDER BY user_id",
    about: "every account, and who is an admin",
  },
  admins: {
    sql: "SELECT user_id, username, email FROM users WHERE is_admin",
    about: "admin accounts only",
  },
  counts: {
    sql: `SELECT (SELECT count(*) FROM anime)    AS anime,
                 (SELECT count(*) FROM episodes) AS episodes,
                 (SELECT count(*) FROM genres)   AS genres,
                 (SELECT count(*) FROM studios)  AS studios,
                 (SELECT count(*) FROM users)    AS users,
                 (SELECT count(*) FROM watchlist) AS watchlist,
                 (SELECT count(*) FROM reviews)  AS reviews`,
    about: "row counts across the main tables",
  },
  demo: {
    sql: `SELECT anime_id, title, episode_count
          FROM anime WHERE episode_count BETWEEN 1 AND 13
          ORDER BY score DESC NULLS LAST LIMIT 10`,
    about: "short anime — good candidates for the trigger-chain demo",
  },
  triggers: {
    sql: `SELECT tgname AS trigger, tgrelid::regclass AS on_table
          FROM pg_trigger WHERE NOT tgisinternal ORDER BY 2, 1`,
    about: "every trigger and the table it fires on",
  },
  activity: {
    sql: `SELECT l.log_id, u.username, l.action_type, l.details, l.logged_at
          FROM activity_log l JOIN users u ON u.user_id = l.user_id
          ORDER BY l.log_id DESC LIMIT 15`,
    about: "recent activity_log rows (written by trg_log_watchlist)",
  },
  notifications: {
    sql: `SELECT n.notification_id, u.username, n.type, n.message, n.is_read
          FROM notifications n JOIN users u ON u.user_id = n.user_id
          ORDER BY n.notification_id DESC LIMIT 15`,
    about: "recent notifications (all written by triggers)",
  },
  studios: {
    sql: "SELECT * FROM get_top_studios(10, 2)",
    about: "studio leaderboard",
  },
};

function printMenu() {
  console.log("\nNamed queries — run with:  npm run db:sql -- --q=<name>\n");
  const width = Math.max(...Object.keys(CANNED).map((k) => k.length));
  for (const [name, { about }] of Object.entries(CANNED)) {
    console.log(`  ${name.padEnd(width)}  ${about}`);
  }
  console.log('\nOr pass SQL directly:  npm run db:sql -- "SELECT * FROM anime LIMIT 5"\n');
}

// Render rows as an aligned table. console.table is close but quotes strings
// and mangles nulls, which makes output harder to read than it needs to be.
function printRows(rows, fields) {
  if (!rows.length) {
    console.log("(0 rows)");
    return;
  }
  const cols = fields.map((f) => f.name);
  const cell = (v) =>
    v === null || v === undefined ? "∅" : v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : String(v);

  const widths = cols.map((c, i) =>
    Math.max(c.length, ...rows.map((r) => cell(r[cols[i]]).length))
  );
  const line = (l, m, r) => l + widths.map((w) => "─".repeat(w + 2)).join(m) + r;

  console.log(line("┌", "┬", "┐"));
  console.log("│" + cols.map((c, i) => ` ${c.padEnd(widths[i])} `).join("│") + "│");
  console.log(line("├", "┼", "┤"));
  for (const r of rows) {
    console.log("│" + cols.map((c, i) => ` ${cell(r[c]).padEnd(widths[i])} `).join("│") + "│");
  }
  console.log(line("└", "┴", "┘"));
  console.log(`(${rows.length} row${rows.length === 1 ? "" : "s"})`);
}

async function main() {
  const args = process.argv.slice(2);
  const named = args.find((a) => a.startsWith("--q="))?.split("=")[1];
  const direct = args.find((a) => !a.startsWith("--"));

  if (args.includes("--list") || (!named && !direct)) {
    printMenu();
    return;
  }

  let sql;
  if (named) {
    if (!CANNED[named]) {
      console.error(`Unknown query "${named}".`);
      printMenu();
      process.exit(1);
    }
    sql = CANNED[named].sql;
  } else {
    sql = direct;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Create backend/.env first (see .env.example).");
    process.exit(1);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    const res = await db.query(sql);
    // CALL and UPDATE return no field list; report what happened instead.
    if (res.fields?.length) printRows(res.rows, res.fields);
    else console.log(`OK — ${res.rowCount ?? 0} row(s) affected`);
  } catch (e) {
    console.error(`\nSQL error: ${e.message}`);
    if (e.position) console.error(`  at character ${e.position}`);
    if (e.hint) console.error(`  hint: ${e.hint}`);
    await db.end();
    process.exit(1);
  }

  await db.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
