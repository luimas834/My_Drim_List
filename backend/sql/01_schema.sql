-- ============ DROP (optional, for a clean re-run) ============
DROP TABLE IF EXISTS review_votes, notifications, activity_log, followers,
    episode_discussions, reviews, watchlist, episodes, anime_studios,
    anime_genres, studios, genres, anime, users CASCADE;
DROP MATERIALIZED VIEW IF EXISTS top_by_genre CASCADE;
DROP VIEW IF EXISTS anime_card_view CASCADE;

-- ============ CORE ENTITIES ============
CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    username      VARCHAR(50)  UNIQUE NOT NULL,
    email         VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    profile_pic   TEXT,
    bio           TEXT,
    is_admin      BOOLEAN DEFAULT FALSE,      -- gates the maintenance routes;
                                              -- grant with: npm run db:make-admin -- <email>
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE anime (
    anime_id      SERIAL PRIMARY KEY,
    mal_id        INT UNIQUE,                 -- Jikan/MAL id; makes seeding idempotent
    title         VARCHAR(255) NOT NULL,
    synopsis      TEXT,
    cover_image   TEXT,
    episode_count INT,
    status        VARCHAR(30),
    score         NUMERIC(4,2),               -- aggregate, maintained ONLY by trigger
    mal_score     NUMERIC(4,2),               -- the score Jikan gave us; the fallback
                                              -- when this anime has no reviews yet
    aired_from    DATE,
    aired_to      DATE,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE genres (
    genre_id SERIAL PRIMARY KEY,
    name     VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE anime_genres (                    -- M:N bridge
    anime_id INT REFERENCES anime(anime_id)  ON DELETE CASCADE,
    genre_id INT REFERENCES genres(genre_id) ON DELETE CASCADE,
    PRIMARY KEY (anime_id, genre_id)
);

CREATE TABLE studios (
    studio_id SERIAL PRIMARY KEY,
    name      VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE anime_studios (                   -- M:N bridge
    anime_id  INT REFERENCES anime(anime_id)   ON DELETE CASCADE,
    studio_id INT REFERENCES studios(studio_id) ON DELETE CASCADE,
    PRIMARY KEY (anime_id, studio_id)
);

CREATE TABLE episodes (
    episode_id     SERIAL PRIMARY KEY,
    anime_id       INT REFERENCES anime(anime_id) ON DELETE CASCADE,
    episode_number INT NOT NULL,
    title          VARCHAR(255),
    aired_on       DATE,
    UNIQUE (anime_id, episode_number)
);

-- ============ USER INTERACTIONS ============
CREATE TABLE watchlist (
    watchlist_id     SERIAL PRIMARY KEY,
    user_id          INT REFERENCES users(user_id) ON DELETE CASCADE,
    anime_id         INT REFERENCES anime(anime_id) ON DELETE CASCADE,
    status           VARCHAR(15) NOT NULL
        CHECK (status IN ('watching','completed','on-hold','dropped','plan-to-watch')),
    episodes_watched INT DEFAULT 0 CHECK (episodes_watched >= 0),
    user_score       INT CHECK (user_score BETWEEN 1 AND 10),
    started_at       DATE,
    finished_at      DATE,
    updated_at       TIMESTAMP DEFAULT NOW(),
    UNIQUE (user_id, anime_id)                 -- one entry per user per anime
);

CREATE TABLE reviews (
    review_id     SERIAL PRIMARY KEY,
    user_id       INT REFERENCES users(user_id) ON DELETE CASCADE,
    anime_id      INT REFERENCES anime(anime_id) ON DELETE CASCADE,
    body          TEXT NOT NULL,
    score         INT CHECK (score BETWEEN 1 AND 10),
    helpful_count INT DEFAULT 0,
    is_edited     BOOLEAN DEFAULT FALSE,
    edited_at     TIMESTAMP,
    created_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE (user_id, anime_id)                 -- one review per user per anime
);

CREATE TABLE review_votes (                    -- who found a review helpful
    review_id INT REFERENCES reviews(review_id) ON DELETE CASCADE,
    user_id   INT REFERENCES users(user_id)     ON DELETE CASCADE,
    voted_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (review_id, user_id)           -- prevents double voting
);

CREATE TABLE episode_discussions (
    discussion_id SERIAL PRIMARY KEY,
    episode_id    INT REFERENCES episodes(episode_id) ON DELETE CASCADE,
    user_id       INT REFERENCES users(user_id)       ON DELETE CASCADE,
    comment       TEXT NOT NULL,
    is_edited     BOOLEAN DEFAULT FALSE,      -- both maintained by trg_discussion_edit_flag
    edited_at     TIMESTAMP,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE followers (                        -- self-referential M:N
    follower_id  INT REFERENCES users(user_id) ON DELETE CASCADE,
    following_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    followed_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id <> following_id)         -- declarative self-follow guard
);

-- ============ SYSTEM TABLES (written by triggers) ============
CREATE TABLE activity_log (
    log_id      SERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(user_id),
    action_type VARCHAR(50),
    anime_id    INT,
    details     TEXT,
    logged_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id    INT REFERENCES users(user_id) ON DELETE CASCADE,
    type       VARCHAR(30),                     -- 'new_follower' | 'new_review'
    message    TEXT,
    is_read    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============ INDEXES ============
CREATE INDEX idx_watchlist_user   ON watchlist(user_id);
CREATE INDEX idx_watchlist_status ON watchlist(status);
CREATE INDEX idx_reviews_anime    ON reviews(anime_id);
CREATE INDEX idx_anime_genres_g   ON anime_genres(genre_id);
CREATE INDEX idx_notif_user       ON notifications(user_id);
CREATE INDEX idx_episodes_anime   ON episodes(anime_id);          -- episode list per anime
CREATE INDEX idx_discussions_ep   ON episode_discussions(episode_id);  -- thread + comment counts
