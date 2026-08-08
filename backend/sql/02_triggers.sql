-- ========== 1. SCORE UPDATE: keep anime.score = avg of review scores ==========
-- AVG() over zero rows is NULL, so deleting the last review used to blank the
-- score entirely — including the rating we seeded from MyAnimeList. COALESCE
-- falls back to anime.mal_score, so an unreviewed title still shows a number
-- and the column only reflects our users once our users have said something.
CREATE OR REPLACE FUNCTION fn_update_anime_score() RETURNS TRIGGER AS $$
DECLARE v_anime INT;
BEGIN
    v_anime := COALESCE(NEW.anime_id, OLD.anime_id);   -- works for INSERT/UPDATE/DELETE
    UPDATE anime
    SET score = COALESCE(
            (SELECT ROUND(AVG(score)::numeric, 2)
             FROM reviews WHERE anime_id = v_anime AND score IS NOT NULL),
            mal_score)                                  -- unqualified = the row being updated
    WHERE anime_id = v_anime;
    RETURN NULL;                                        -- AFTER trigger: return ignored
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_score ON reviews;
CREATE TRIGGER trg_update_score
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION fn_update_anime_score();

-- ========== 2. REVIEW GUARD: block review unless anime is completed ==========
CREATE OR REPLACE FUNCTION fn_review_guard() RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM watchlist
        WHERE user_id = NEW.user_id AND anime_id = NEW.anime_id
          AND status = 'completed'
    ) THEN
        RAISE EXCEPTION 'REVIEW_GUARD: You must complete this anime before reviewing it';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_review_guard ON reviews;
CREATE TRIGGER trg_review_guard
BEFORE INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION fn_review_guard();

-- ========== 3. EDIT FLAG: mark review edited (only when body/score changes) ==========
CREATE OR REPLACE FUNCTION fn_flag_review_edited() RETURNS TRIGGER AS $$
BEGIN
    NEW.is_edited := TRUE;
    NEW.edited_at := NOW();
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_edit_flag ON reviews;
CREATE TRIGGER trg_edit_flag
BEFORE UPDATE ON reviews
FOR EACH ROW
WHEN (OLD.body IS DISTINCT FROM NEW.body OR OLD.score IS DISTINCT FROM NEW.score)
EXECUTE FUNCTION fn_flag_review_edited();

-- ========== 4. HELPFUL COUNT: sync reviews.helpful_count with review_votes ==========
CREATE OR REPLACE FUNCTION fn_sync_helpful_count() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE reviews SET helpful_count = helpful_count + 1
        WHERE review_id = NEW.review_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE reviews SET helpful_count = GREATEST(helpful_count - 1, 0)
        WHERE review_id = OLD.review_id;
    END IF;
    RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_helpful_count ON review_votes;
CREATE TRIGGER trg_helpful_count
AFTER INSERT OR DELETE ON review_votes
FOR EACH ROW EXECUTE FUNCTION fn_sync_helpful_count();

-- ========== 5. EPISODE CHECK: auto-complete when all episodes watched ==========
-- Named so it fires BEFORE the finish-date trigger (BEFORE triggers run alphabetically).
CREATE OR REPLACE FUNCTION fn_episode_check() RETURNS TRIGGER AS $$
DECLARE v_total INT;
BEGIN
    SELECT episode_count INTO v_total FROM anime WHERE anime_id = NEW.anime_id;
    IF v_total IS NOT NULL AND NEW.episodes_watched >= v_total AND v_total > 0 THEN
        NEW.episodes_watched := v_total;      -- cap
        NEW.status := 'completed';            -- this makes the next trigger stamp the date
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_a_episode_check ON watchlist;
CREATE TRIGGER trg_a_episode_check
BEFORE INSERT OR UPDATE ON watchlist
FOR EACH ROW EXECUTE FUNCTION fn_episode_check();

-- ========== 6. AUTO FINISH: stamp finished_at when status is completed ==========
CREATE OR REPLACE FUNCTION fn_set_finish_date() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND NEW.finished_at IS NULL THEN
        NEW.finished_at := CURRENT_DATE;
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_b_finish_date ON watchlist;
CREATE TRIGGER trg_b_finish_date
BEFORE INSERT OR UPDATE ON watchlist
FOR EACH ROW EXECUTE FUNCTION fn_set_finish_date();

-- ========== 7. ACTIVITY LOG: record every watchlist change ==========
CREATE OR REPLACE FUNCTION fn_log_watchlist() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO activity_log(user_id, action_type, anime_id, details)
    VALUES (NEW.user_id, 'watchlist_' || lower(TG_OP), NEW.anime_id,
            'status=' || NEW.status || ', eps=' || NEW.episodes_watched);
    RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_watchlist ON watchlist;
CREATE TRIGGER trg_log_watchlist
AFTER INSERT OR UPDATE ON watchlist
FOR EACH ROW EXECUTE FUNCTION fn_log_watchlist();

-- ========== 8. REVIEW CLEANUP: delete review when anime leaves the list ==========
CREATE OR REPLACE FUNCTION fn_cleanup_review() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM reviews WHERE user_id = OLD.user_id AND anime_id = OLD.anime_id;
    RETURN OLD;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_review_cleanup ON watchlist;
CREATE TRIGGER trg_review_cleanup
AFTER DELETE ON watchlist
FOR EACH ROW EXECUTE FUNCTION fn_cleanup_review();

-- ========== 9. SELF-FOLLOW BLOCK (procedural, friendly message) ==========
CREATE OR REPLACE FUNCTION fn_block_self_follow() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.follower_id = NEW.following_id THEN
        RAISE EXCEPTION 'SELF_FOLLOW: You cannot follow yourself';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_self_follow ON followers;
CREATE TRIGGER trg_self_follow
BEFORE INSERT ON followers
FOR EACH ROW EXECUTE FUNCTION fn_block_self_follow();

-- ========== 10. NOTIFICATION INSERT (on follow, and on new review) ==========
CREATE OR REPLACE FUNCTION fn_notify_new_follower() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notifications(user_id, type, message)
    SELECT NEW.following_id, 'new_follower',
           (SELECT username FROM users WHERE user_id = NEW.follower_id) || ' followed you';
    RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_follow ON followers;
CREATE TRIGGER trg_notify_follow
AFTER INSERT ON followers
FOR EACH ROW EXECUTE FUNCTION fn_notify_new_follower();

CREATE OR REPLACE FUNCTION fn_notify_new_review() RETURNS TRIGGER AS $$
BEGIN
    -- notify everyone who follows the reviewer
    INSERT INTO notifications(user_id, type, message)
    SELECT f.follower_id, 'new_review',
           (SELECT username FROM users WHERE user_id = NEW.user_id) ||
           ' posted a new review'
    FROM followers f
    WHERE f.following_id = NEW.user_id;
    RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_review ON reviews;
CREATE TRIGGER trg_notify_review
AFTER INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION fn_notify_new_review();
