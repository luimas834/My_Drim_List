// index.js — Express entry point. Thin messenger: mounts routers, each route
// authenticates then runs ONE SQL call and returns JSON.
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// Health check — proves the server is up and the DB is reachable.
app.get("/health", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT NOW()");
    res.json({ status: "ok", now: rows[0].now });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Database unreachable" });
  }
});

// ---- Routers (mounted as phases are built) ----
app.use("/api/auth", require("./routes/auth"));
app.use("/api/anime", require("./routes/anime"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/watchlist", require("./routes/watchlist"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api", require("./routes/social"));
app.use("/api/episodes", require("./routes/episodes"));
app.use("/api/users", require("./routes/users"));


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`MDL backend listening on http://localhost:${PORT}`));
