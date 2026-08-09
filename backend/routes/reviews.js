//routes/reviews.js — anime reviews + helpful voting.
//no business logic here: the review guard, edit flag, anime score average and
//helpful count are all enforced by database triggers and the cast_helpful_vote procedure.
const express = require("express");
const db = require("../db");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

//Sort keys are interpolated, so they come from this whitelist and never from the
//request. Each ends with review_id so ordering is total and paging is stable.
const REVIEW_SORTS = {
  newest: "r.created_at DESC, r.review_id DESC",
  oldest: "r.created_at ASC, r.review_id ASC",
  helpful: "r.helpful_count DESC, r.created_at DESC, r.review_id DESC",
  highest: "r.score DESC NULLS LAST, r.helpful_count DESC, r.review_id DESC",
  lowest: "r.score ASC NULLS LAST, r.helpful_count DESC, r.review_id DESC",
};

//GET /api/reviews/anime/:animeId?sort= — an anime's reviews
router.get("/anime/:animeId", async (req, res) => {
  try {
    const orderBy = REVIEW_SORTS[req.query.sort] || REVIEW_SORTS.helpful;
    const { rows } = await db.query(
      `SELECT r.review_id, r.user_id, r.anime_id, r.body, r.score,
              r.helpful_count, r.is_edited, r.edited_at, r.created_at,
              u.username, u.profile_pic
       FROM reviews r
       JOIN users u ON u.user_id = r.user_id
       WHERE r.anime_id = $1
       ORDER BY ${orderBy}`,
      [req.params.animeId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//POST /api/reviews — write a review (trg_review_guard blocks uncompleted anime)
router.post("/", auth, async (req, res) => {
  try {
    const { anime_id, body, score } = req.body;
    if (!anime_id || !body) {
      return res.status(400).json({ error: "anime_id and body are required" });
    }
    const { rows } = await db.query(
      `INSERT INTO reviews (user_id, anime_id, body, score)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.userId, anime_id, body, score ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    //REVIEW_GUARD: raised by the BEFORE INSERT trigger
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    if (e.code === "23505") return res.status(409).json({ error: "You already reviewed this anime" });
    if (e.code === "23503") return res.status(404).json({ error: "Anime not found" });
    if (e.code === "23514") return res.status(400).json({ error: "Score must be between 1 and 10" });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//PATCH /api/reviews/:reviewId — edit own review (trg_edit_flag stamps is_edited)
router.patch("/:reviewId", auth, async (req, res) => {
  try {
    const { body, score } = req.body;

    const setClauses = [];
    const params = [req.params.reviewId, req.userId];

    if (body !== undefined) {
      params.push(body);
      setClauses.push(`body = $${params.length}`);
    }
    if (score !== undefined) {
      params.push(score);
      setClauses.push(`score = $${params.length}`);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: "No update fields provided" });
    }

    const { rows } = await db.query(
      `UPDATE reviews
       SET ${setClauses.join(", ")}
       WHERE review_id = $1 AND user_id = $2
       RETURNING *`,
      params
    );

    //no row means it does not exist or belongs to someone else
    if (!rows[0]) return res.status(404).json({ error: "Review not found" });

    res.json(rows[0]);
  } catch (e) {
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    if (e.code === "23514") return res.status(400).json({ error: "Score must be between 1 and 10" });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//DELETE /api/reviews/:reviewId — remove own review
router.delete("/:reviewId", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM reviews
       WHERE review_id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.reviewId, req.userId]
    );

    if (!rows[0]) return res.status(404).json({ error: "Review not found" });

    res.json({ message: "Deleted successfully", review: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//POST /api/reviews/:reviewId/helpful — mark helpful via stored procedure
router.post("/:reviewId/helpful", auth, async (req, res) => {
  try {
    await db.query("CALL cast_helpful_vote($1, $2)", [req.params.reviewId, req.userId]);
    //the trigger already bumped the count — read it back so the client can show it
    const { rows } = await db.query(
      "SELECT review_id, helpful_count FROM reviews WHERE review_id = $1",
      [req.params.reviewId]
    );
    res.json(rows[0]);
  } catch (e) {
    //DUPLICATE_VOTE: / INVALID_VOTE: raised inside cast_helpful_vote
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//DELETE /api/reviews/:reviewId/helpful — take back a helpful vote.
//trg_helpful_count already handles AFTER DELETE on review_votes and decrements
//with GREATEST(helpful_count - 1, 0); there was simply no route reaching it, so
//a vote could be cast but never withdrawn.
router.delete("/:reviewId/helpful", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM review_votes
       WHERE review_id = $1 AND user_id = $2
       RETURNING review_id`,
      [req.params.reviewId, req.userId]
    );

    if (!rows[0]) return res.status(404).json({ error: "You have not voted on this review" });

    //read the count back after the trigger has decremented it
    const { rows: after } = await db.query(
      "SELECT review_id, helpful_count FROM reviews WHERE review_id = $1",
      [req.params.reviewId]
    );
    res.json(after[0]);
  } catch (e) {
    if (e.message?.includes(":")) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//GET /api/reviews/anime/:animeId/my-votes — which of these reviews I have voted on,
//so the UI can render the button in the right state instead of guessing
router.get("/anime/:animeId/my-votes", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT v.review_id
       FROM review_votes v
       JOIN reviews r ON r.review_id = v.review_id
       WHERE r.anime_id = $1 AND v.user_id = $2`,
      [req.params.animeId, req.userId]
    );
    res.json(rows.map((r) => r.review_id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
