// db.js — a single pg connection Pool + a tiny query() helper.
// Connection pooling: reuse a fixed set of open connections instead of opening
// a new one per request (opening a connection is expensive).
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// query(text, params) — always use $1,$2 params, never string concatenation.
function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
