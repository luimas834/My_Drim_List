-- ========== A. USER STATS (RETURNS TABLE, one round trip) ==========
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id INT)
RETURNS TABLE(total INT, completed INT, watching INT, dropped INT,
              mean_score NUMERIC, episodes INT) AS $$
BEGIN
    RETURN QUERY
    SELECT COUNT(*)::INT,
           COUNT(*) FILTER (WHERE status='completed')::INT,
           COUNT(*) FILTER (WHERE status='watching')::INT,
           COUNT(*) FILTER (WHERE status='dropped')::INT,
           ROUND(AVG(user_score)::numeric, 2),
           COALESCE(SUM(episodes_watched),0)::INT
    FROM watchlist WHERE user_id = p_user_id;
END; $$ LANGUAGE plpgsql;

-- ========== B. RECOMMENDATIONS (explicit CURSOR + temp table) ==========
CREATE OR REPLACE FUNCTION recommend_anime(p_user_id INT)
RETURNS TABLE(anime_id INT, title TEXT, genre_match_count INT) AS $$
DECLARE
    v_genre INT;
    genre_cursor CURSOR FOR
        SELECT DISTINCT ag.genre_id
        FROM watchlist w
        JOIN anime_genres ag ON ag.anime_id = w.anime_id
        WHERE w.user_id = p_user_id AND w.status = 'completed';
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS hits(
        anime_id INT PRIMARY KEY, title TEXT, cnt INT DEFAULT 0
    ) ON COMMIT DROP;
    TRUNCATE hits;

    OPEN genre_cursor;                              -- explicit cursor
    LOOP
        FETCH genre_cursor INTO v_genre;
        EXIT WHEN NOT FOUND;
        INSERT INTO hits(anime_id, title, cnt)
        SELECT a.anime_id, a.title, 1
        FROM anime a
        JOIN anime_genres ag ON ag.anime_id = a.anime_id
        WHERE ag.genre_id = v_genre
          AND a.anime_id NOT IN (SELECT anime_id FROM watchlist WHERE user_id = p_user_id)
        ON CONFLICT (anime_id) DO UPDATE SET cnt = hits.cnt + 1;  -- more overlap = higher rank
    END LOOP;
    CLOSE genre_cursor;

    RETURN QUERY
        SELECT h.anime_id, h.title::TEXT, h.cnt
        FROM hits h ORDER BY h.cnt DESC LIMIT 10;
END; $$ LANGUAGE plpgsql;

-- ========== C. WATCH HISTORY (keyset / cursor-style pagination) ==========
CREATE OR REPLACE FUNCTION get_watch_history(
    p_user_id INT, p_after_id INT DEFAULT 0, p_limit INT DEFAULT 10)
RETURNS TABLE(watchlist_id INT, anime_id INT, title VARCHAR,
              status VARCHAR, user_score INT, updated_at TIMESTAMP) AS $$
BEGIN
    RETURN QUERY
    SELECT w.watchlist_id, a.anime_id, a.title, w.status, w.user_score, w.updated_at
    FROM watchlist w JOIN anime a ON a.anime_id = w.anime_id
    WHERE w.user_id = p_user_id AND w.watchlist_id > p_after_id
    ORDER BY w.watchlist_id ASC
    LIMIT p_limit;
END; $$ LANGUAGE plpgsql;
