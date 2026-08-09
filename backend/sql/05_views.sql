-- ========== REGULAR VIEW: flattened anime card ==========
CREATE OR REPLACE VIEW anime_card_view AS
SELECT a.anime_id, a.title, a.cover_image, a.score, a.episode_count, a.status,
       STRING_AGG(DISTINCT g.name, ', ') AS genres,
       STRING_AGG(DISTINCT s.name, ', ') AS studios
FROM anime a
LEFT JOIN anime_genres ag  ON ag.anime_id = a.anime_id
LEFT JOIN genres g         ON g.genre_id  = ag.genre_id
LEFT JOIN anime_studios ast ON ast.anime_id = a.anime_id
LEFT JOIN studios s        ON s.studio_id = ast.studio_id
GROUP BY a.anime_id;

-- ========== MATERIALIZED VIEW: pre-ranked top anime per genre ==========
-- Materialized views have no CREATE OR REPLACE form — that is a plain view
-- feature — so re-running this file used to fail with "relation top_by_genre
-- already exists" and abort every migration after it.
--
-- DROP then CREATE rather than CREATE ... IF NOT EXISTS, because IF NOT EXISTS
-- would silently keep an out-of-date definition if this query ever changes.
-- Dropping costs nothing: a materialized view holds only derived data, and it
-- has to be REFRESHed after seeding anyway.
DROP MATERIALIZED VIEW IF EXISTS top_by_genre;
CREATE MATERIALIZED VIEW top_by_genre AS
SELECT g.genre_id, g.name AS genre, a.anime_id, a.title, a.cover_image, a.score,
       RANK() OVER (PARTITION BY g.genre_id ORDER BY a.score DESC NULLS LAST) AS rnk
FROM genres g
JOIN anime_genres ag ON ag.genre_id = g.genre_id
JOIN anime a         ON a.anime_id  = ag.anime_id
WHERE a.score IS NOT NULL;

-- refresh after seeding or on a schedule:
-- REFRESH MATERIALIZED VIEW top_by_genre;
