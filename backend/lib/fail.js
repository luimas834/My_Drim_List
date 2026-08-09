// lib/fail.js — one place that turns an unexpected error into a 500.
//
// Every route used to end with:
//     console.error(e); res.status(500).json({ error: "Server error" });
//
// which is correct for production and useless for development: the browser shows
// "Server error" and the actual PostgreSQL message — the column that does not
// exist, the function that was never created — only appears in whichever
// terminal happens to be running the backend.
//
// Outside production the real message is included in the response, so a failure
// is diagnosable from the screen it happened on. In production the client gets
// nothing but "Server error", because database error text can leak schema
// details.
const IS_PROD = process.env.NODE_ENV === "production";

function fail(res, e, fallback = "Server error") {
  console.error(e);

  if (IS_PROD) return res.status(500).json({ error: fallback });

  // hint and position come from the pg driver and are often the whole answer
  const parts = [e.message];
  if (e.hint) parts.push(`hint: ${e.hint}`);
  if (e.code) parts.push(`code: ${e.code}`);

  return res.status(500).json({
    error: `${fallback}: ${parts.join(" — ")}`,
    dev_only: true,
  });
}

module.exports = fail;
