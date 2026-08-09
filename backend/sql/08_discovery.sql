-- 08_discovery.sql — search, similarity and browsing.
--
-- Everything a catalogue site needs to be browsable rather than merely listable:
-- real search, sorting, filtering, "more like this", and score breakdowns.
-- All of it in the database, as usual.

-- ============================================================================
-- 1. FULL-TEXT SEARCH
-- ============================================================================
-- Title search was `title ILIKE '%naruto%'`. Two problems: a leading wildcard
-- makes any B-tree index useless, so it scans every row; and it only matches
-- literal substrings, so "attack titan" finds nothing and the synopsis is not
-- searched at all.
--
-- A tsvector column stores the pre-parsed, stemmed document. GIN indexes it.
-- setweight ranks a title match above a synopsis match.
ALTER TABLE anime ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION fn_anime_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')),    'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.synopsis, '')), 'B');
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- UPDATE OF title, synopsis: the trigger only fires when the searchable text
-- actually changes, not on every score recomputation from trg_update_score.
DROP TRIGGER IF EXISTS trg_anime_search ON anime;
CREATE TRIGGER trg_anime_search
BEFORE INSERT OR UPDATE OF title, synopsis ON anime
FOR EACH ROW EXECUTE FUNCTION fn_anime_search_vector();

-- Backfill existing rows by touching the column the trigger watches.
UPDATE anime SET title = title WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_anime_search ON anime USING GIN(search_vector);

-- websearch_to_tsquery understands quoted phrases, OR and -exclusions, and it
-- never throws on malformed input the way to_tsquery does — which matters when
-- the input is whatever a user typed.
CREATE OR REPLACE FUNCTION search_anime(p_query TEXT, p_limit INT DEFAULT 20)
RETURNS TABLE(anime_id INT, title VARCHAR, cover_image TEXT, score NUMERIC,
              episode_count INT, status VARCHAR, genres TEXT, relevance REAL) AS $$
BEGIN
    RETURN QUERY
    SELECT a.anime_id, a.title, a.cover_image, a.score, a.episode_count, a.status,
           STRING_AGG(DISTINCT g.name, ', ') AS genres,
           ts_rank(a.search_vector, websearch_to_tsquery('english', p_query)) AS relevance
    FROM anime a
    LEFT JOIN anime_genres ag ON ag.anime_id = a.anime_id
    LEFT JOIN genres g        ON g.genre_id  = ag.genre_id
    WHERE a.search_vector @@ websearch_to_tsquery('english', p_query)
    GROUP BY a.anime_id
    ORDER BY ts_rank(a.search_vector, websearch_to_tsquery('english', p_query)) DESC,
             a.score DESC NULLS LAST
    LIMIT p_limit;
END; $$ LANGUAGE plpgsql;


-- ============================================================================
-- 2. BROWSE VIEW — cards plus the things you sort and filter by
-- ============================================================================
-- anime_card_view has what a card displays. Browsing also needs popularity
-- (how many people track it) and release year. Layering a view on a view keeps
-- the card definition in one place.
CREATE OR REPLACE VIEW anime_browse_view AS
SELECT acv.anime_id,
       acv.title,
       acv.cover_image,
       acv.score,
       acv.episode_count,
       acv.status,
       acv.genres,
       acv.studios,
       a.aired_from,
       EXTRACT(YEAR FROM a.aired_from)::INT      AS year,
       COALESCE(m.member_count, 0)::INT          AS member_count,
       COALESCE(r.review_count, 0)::INT          AS review_count
FROM anime_card_view acv
JOIN anime a ON a.anime_id = acv.anime_id
LEFT JOIN (SELECT anime_id, COUNT(*) AS member_count FROM watchlist  GROUP BY anime_id) m
       ON m.anime_id = acv.anime_id
LEFT JOIN (SELECT anime_id, COUNT(*) AS review_count FROM reviews    GROUP BY anime_id) r
       ON r.anime_id = acv.anime_id;


-- ============================================================================
-- 3. SIMILAR ANIME — "more like this"
-- ============================================================================
-- Similarity is shared genres plus shared studios, studios weighted double: two
-- shows from the same studio have more in common than two shows that are both
-- tagged Action. The LEFT JOINs are pre-filtered to the target's genres and
-- studios, so COUNT counts only overlap.
CREATE OR REPLACE FUNCTION get_similar_anime(p_anime_id INT, p_limit INT DEFAULT 8)
RETURNS TABLE(anime_id INT, title VARCHAR, cover_image TEXT, score NUMERIC,
              shared_genres INT, shared_studios INT, similarity NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT a.anime_id,
           a.title,
           a.cover_image,
           a.score,
           COUNT(DISTINCT ag.genre_id)::INT   AS shared_genres,
           COUNT(DISTINCT ast.studio_id)::INT AS shared_studios,
           (COUNT(DISTINCT ag.genre_id) + COUNT(DISTINCT ast.studio_id) * 2)::NUMERIC AS similarity
    FROM anime a
    LEFT JOIN anime_genres ag
           ON ag.anime_id = a.anime_id
          AND ag.genre_id IN (SELECT genre_id FROM anime_genres WHERE anime_id = p_anime_id)
    LEFT JOIN anime_studios ast
           ON ast.anime_id = a.anime_id
          AND ast.studio_id IN (SELECT studio_id FROM anime_studios WHERE anime_id = p_anime_id)
    WHERE a.anime_id <> p_anime_id
    GROUP BY a.anime_id
    HAVING COUNT(DISTINCT ag.genre_id) + COUNT(DISTINCT ast.studio_id) > 0
    ORDER BY (COUNT(DISTINCT ag.genre_id) + COUNT(DISTINCT ast.studio_id) * 2) DESC,
             a.score DESC NULLS LAST
    LIMIT p_limit;
END; $$ LANGUAGE plpgsql;


-- ============================================================================
-- 4. SCORE DISTRIBUTION — the histogram under a rating
-- ============================================================================
-- generate_series produces all ten buckets so scores nobody gave still render as
-- a zero-height bar. Without it the chart would silently skip empty scores and
-- misrepresent the shape of the distribution.
CREATE OR REPLACE FUNCTION get_score_distribution(p_anime_id INT)
RETURNS TABLE(score_value INT, review_count INT, percentage NUMERIC) AS $$
BEGIN
    RETURN QUERY
    WITH buckets AS (
        SELECT generate_series(1, 10) AS s
    ),
    tallied AS (
        SELECT r.score AS s, COUNT(*)::INT AS c
        FROM reviews r
        WHERE r.anime_id = p_anime_id AND r.score IS NOT NULL
        GROUP BY r.score
    ),
    total AS (
        SELECT COALESCE(SUM(t.c), 0)::INT AS n FROM tallied t
    )
    SELECT b.s::INT,
           COALESCE(t.c, 0)::INT,
           CASE WHEN (SELECT n FROM total) > 0
                THEN ROUND(COALESCE(t.c, 0) * 100.0 / (SELECT n FROM total), 1)
                ELSE 0::NUMERIC
           END
    FROM buckets b
    LEFT JOIN tallied t ON t.s = b.s
    ORDER BY b.s DESC;
END; $$ LANGUAGE plpgsql;


-- ============================================================================
-- 5. AVAILABLE YEARS — for the filter dropdown
-- ============================================================================
CREATE OR REPLACE FUNCTION get_catalogue_years()
RETURNS TABLE(year INT, anime_count INT) AS $$
BEGIN
    RETURN QUERY
    SELECT EXTRACT(YEAR FROM a.aired_from)::INT AS y, COUNT(*)::INT
    FROM anime a
    WHERE a.aired_from IS NOT NULL
    GROUP BY y
    ORDER BY y DESC;
END; $$ LANGUAGE plpgsql;


-- ============================================================================
-- 6. INDEXES for the new sorts and filters
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_anime_score      ON anime(score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_anime_aired_from ON anime(aired_from);
CREATE INDEX IF NOT EXISTS idx_anime_status     ON anime(status);
CREATE INDEX IF NOT EXISTS idx_watchlist_anime  ON watchlist(anime_id);  -- member counts
