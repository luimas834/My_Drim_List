-- 06_discussions.sql — episode discussion features.
--
-- Runs after 05_views.sql. Everything here follows the same rule as the rest of
-- the project: the API never computes any of it, it just SELECTs the result.

-- ========== 1. EDIT FLAG: mirror of the review edit trigger ==========
-- Same conditional-WHEN pattern as trg_edit_flag on reviews: only a real change
-- to the comment text counts as an edit. If we ever add a column that gets
-- bumped by something else (a pin flag, a soft delete), that write must not
-- silently label somebody's comment as edited.
CREATE OR REPLACE FUNCTION fn_flag_discussion_edited() RETURNS TRIGGER AS $$
BEGIN
    NEW.is_edited := TRUE;
    NEW.edited_at := NOW();
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_discussion_edit_flag ON episode_discussions;
CREATE TRIGGER trg_discussion_edit_flag
BEFORE UPDATE ON episode_discussions
FOR EACH ROW
WHEN (OLD.comment IS DISTINCT FROM NEW.comment)
EXECUTE FUNCTION fn_flag_discussion_edited();


-- ========== 2. THREAD REPLY NOTIFICATION ==========
-- Anyone who has already commented on an episode is watching that thread, so a
-- new comment notifies all of them except the author. Set-based: one
-- INSERT ... SELECT, no loop, however many participants there are.
--
-- DISTINCT matters — a user who commented five times must get one notification,
-- not five.
CREATE OR REPLACE FUNCTION fn_notify_discussion_reply() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notifications(user_id, type, message)
    SELECT DISTINCT d.user_id,
           'discussion_reply',
           (SELECT username FROM users WHERE user_id = NEW.user_id)
             || ' replied on ' || a.title || ' episode ' || e.episode_number
    FROM episode_discussions d
    JOIN episodes e ON e.episode_id = NEW.episode_id
    JOIN anime    a ON a.anime_id   = e.anime_id
    WHERE d.episode_id     = NEW.episode_id
      AND d.user_id       <> NEW.user_id          -- don't notify yourself
      AND d.discussion_id <> NEW.discussion_id;   -- exclude the row just inserted
    RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_discussion ON episode_discussions;
CREATE TRIGGER trg_notify_discussion
AFTER INSERT ON episode_discussions
FOR EACH ROW EXECUTE FUNCTION fn_notify_discussion_reply();


-- ========== 3. EPISODE CARD VIEW: episodes with their comment counts ==========
-- The anime detail page needs "Ep 4 — 3 comments" without a query per episode.
-- One LEFT JOIN + GROUP BY does it for the whole season. Grouping by the primary
-- key alone is legal because every other e.* column is functionally dependent
-- on it.
CREATE OR REPLACE VIEW episode_card_view AS
SELECT e.episode_id,
       e.anime_id,
       e.episode_number,
       e.title,
       e.aired_on,
       COUNT(d.discussion_id)::INT AS comment_count,
       MAX(d.created_at)           AS last_comment_at
FROM episodes e
LEFT JOIN episode_discussions d ON d.episode_id = e.episode_id
GROUP BY e.episode_id;


-- ========== 4. RECENT DISCUSSIONS FEED ==========
-- Flattens comment -> user -> episode -> anime so the home page can show
-- "what is being talked about right now" in one round trip instead of the
-- client stitching four endpoints together.
CREATE OR REPLACE FUNCTION get_recent_discussions(p_limit INT DEFAULT 10)
RETURNS TABLE(discussion_id  INT,
              comment        TEXT,
              is_edited      BOOLEAN,
              created_at     TIMESTAMP,
              user_id        INT,
              username       VARCHAR,
              episode_id     INT,
              episode_number INT,
              episode_title  VARCHAR,
              anime_id       INT,
              anime_title    VARCHAR,
              cover_image    TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT d.discussion_id, d.comment, d.is_edited, d.created_at,
           u.user_id, u.username,
           e.episode_id, e.episode_number, e.title,
           a.anime_id, a.title, a.cover_image
    FROM episode_discussions d
    JOIN users    u ON u.user_id    = d.user_id
    JOIN episodes e ON e.episode_id = d.episode_id
    JOIN anime    a ON a.anime_id   = e.anime_id
    ORDER BY d.created_at DESC, d.discussion_id DESC
    LIMIT p_limit;
END; $$ LANGUAGE plpgsql;


-- ========== 5. PER-ANIME DISCUSSION ACTIVITY ==========
-- Used by the anime detail header ("42 comments across 12 episodes") and by the
-- browse page to surface titles people are actually discussing.
CREATE OR REPLACE FUNCTION get_anime_discussion_stats(p_anime_id INT)
RETURNS TABLE(total_comments INT, episodes_with_comments INT, participants INT) AS $$
BEGIN
    RETURN QUERY
    SELECT COUNT(d.discussion_id)::INT,
           COUNT(DISTINCT d.episode_id)::INT,
           COUNT(DISTINCT d.user_id)::INT
    FROM episodes e
    LEFT JOIN episode_discussions d ON d.episode_id = e.episode_id
    WHERE e.anime_id = p_anime_id;
END; $$ LANGUAGE plpgsql;
