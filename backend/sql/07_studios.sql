-- 07_studios.sql — make the studios M:N do visible work.
--
-- anime_studios existed as a bridge table that nothing ever queried except the
-- detail page's comma list. A many-to-many relationship is one of the schema's
-- headline features, so it should be something you can browse and rank by, not
-- a line of text.

-- ========== 1. STUDIO CARD VIEW ==========
-- Per-studio aggregates: how much they've made and how well it scores.
-- Mirrors anime_card_view — the join and the aggregation happen once, in the
-- database, and the API selects rows.
CREATE OR REPLACE VIEW studio_card_view AS
SELECT s.studio_id,
       s.name,
       COUNT(DISTINCT a.anime_id)::INT       AS anime_count,
       ROUND(AVG(a.score)::numeric, 2)       AS avg_score,
       MAX(a.score)                          AS best_score,
       SUM(COALESCE(a.episode_count, 0))::INT AS total_episodes
FROM studios s
LEFT JOIN anime_studios ast ON ast.studio_id = s.studio_id
LEFT JOIN anime a           ON a.anime_id    = ast.anime_id
GROUP BY s.studio_id;


-- ========== 2. TOP STUDIOS ==========
-- Ranked leaderboard. p_min_anime exists because a studio with one 9.5-rated
-- OVA would otherwise outrank a studio with twenty strong series — a classic
-- small-sample problem that HAVING solves declaratively.
CREATE OR REPLACE FUNCTION get_top_studios(p_limit INT DEFAULT 10, p_min_anime INT DEFAULT 2)
RETURNS TABLE(studio_id INT, name VARCHAR, anime_count INT,
              avg_score NUMERIC, best_score NUMERIC, rnk BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT v.studio_id, v.name, v.anime_count, v.avg_score, v.best_score,
           RANK() OVER (ORDER BY v.avg_score DESC NULLS LAST) AS rnk
    FROM studio_card_view v
    WHERE v.anime_count >= p_min_anime
      AND v.avg_score IS NOT NULL
    ORDER BY v.avg_score DESC NULLS LAST
    LIMIT p_limit;
END; $$ LANGUAGE plpgsql;


-- ========== 3. ONE STUDIO'S CATALOGUE ==========
-- Everything a studio made, best first. The anime_id > 0 guard keeps the
-- LEFT JOIN from returning a phantom row for a studio with no anime.
CREATE OR REPLACE FUNCTION get_studio_anime(p_studio_id INT)
RETURNS TABLE(anime_id INT, title VARCHAR, cover_image TEXT,
              score NUMERIC, episode_count INT, status VARCHAR, genres TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT a.anime_id, a.title, a.cover_image, a.score, a.episode_count, a.status,
           STRING_AGG(DISTINCT g.name, ', ') AS genres
    FROM anime_studios ast
    JOIN anime a           ON a.anime_id  = ast.anime_id
    LEFT JOIN anime_genres ag ON ag.anime_id = a.anime_id
    LEFT JOIN genres g        ON g.genre_id  = ag.genre_id
    WHERE ast.studio_id = p_studio_id
    GROUP BY a.anime_id
    ORDER BY a.score DESC NULLS LAST;
END; $$ LANGUAGE plpgsql;


-- ========== 4. INDEX ==========
-- The studio filter and get_studio_anime both start from studio_id. The bridge
-- table's composite PK is (anime_id, studio_id), so it indexes anime_id first —
-- a lookup by studio_id alone cannot use it efficiently. Same reason
-- idx_anime_genres_g exists for genres.
CREATE INDEX IF NOT EXISTS idx_anime_studios_s ON anime_studios(studio_id);
