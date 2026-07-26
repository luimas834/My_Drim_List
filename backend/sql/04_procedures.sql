-- ========== VOTE PROCEDURE (transaction + exception handling) ==========
CREATE OR REPLACE PROCEDURE cast_helpful_vote(p_review_id INT, p_user_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO review_votes(review_id, user_id) VALUES (p_review_id, p_user_id);
    -- helpful_count is incremented by the trg_helpful_count trigger
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'DUPLICATE_VOTE: You already marked this review helpful';
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'INVALID_VOTE: That review does not exist';
END; $$;

-- ========== BULK DROP PROCEDURE (batch maintenance job) ==========
CREATE OR REPLACE PROCEDURE bulk_drop_inactive(p_months INT DEFAULT 6)
LANGUAGE plpgsql AS $$
DECLARE v_count INT;
BEGIN
    UPDATE watchlist
    SET status = 'dropped'
    WHERE status IN ('watching','on-hold','plan-to-watch')
      AND updated_at < NOW() - make_interval(months => p_months);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'bulk_drop_inactive: dropped % entries', v_count;
END; $$;
