// routes/auth.js — register / login. Hash with bcrypt, sign a JWT {userId} (7d).
// Never return password_hash.
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

// POST /api/auth/register  { username, email, password } -> 201 { token, user }
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "username, email and password are required" });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING user_id, username, email, profile_pic, bio, is_admin, created_at`,
      [username, email, hash]
    );
    const user = rows[0];
    res.status(201).json({ token: signToken(user.user_id), user });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Username or email already exists" });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/login  { email, password } -> 200 { token, user }
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    const { rows } = await db.query(
      `SELECT user_id, username, email, password_hash, profile_pic, bio, is_admin, created_at
       FROM users WHERE email = $1`,
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    delete user.password_hash; // never leak the hash
    res.json({ token: signToken(user.user_id), user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/auth/me — quick protected route to verify a token works.
router.get("/me", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT user_id, username, email, profile_pic, bio, is_admin, created_at
       FROM users WHERE user_id = $1`,
      [req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
