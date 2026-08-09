# My Drim List (MDL) 🎌

> A database-first anime tracking web application built for DBMS-II. All business logic, scoring, constraint enforcement, and statistics computation live directly inside **PostgreSQL**.

---

## ⚡ Quick start

```bash
createdb mdl
cp backend/.env.example backend/.env     # then edit DATABASE_URL and JWT_SECRET
npm run setup                            # installs deps, builds the schema, loads the catalogue
npm run dev                              # backend :4000 + frontend :5173
```

Then register an account in the browser and give it admin rights so the maintenance tools work:

```bash
npm run db:make-admin -- your@email.com
npm run db:verify                        # confirms every DB object exists and you have demo data
```

That's the whole setup. See [Database setup](#-database-setup) for what each step does and how to
reseed from the live API.

---

## 💡 Architectural philosophy: "thin backend, fat database"

Unlike conventional web applications that rely on Object-Relational Mappers (ORMs) and heavy backend service layers, MDL follows a strict **database-first** design:

* **PostgreSQL (fat layer):** all business logic — raw SQL, PL/pgSQL functions, procedures, triggers, cursors, views.
* **Express backend (thin messenger):** authenticate the caller, run one parameterized SQL call (`$1, $2`), translate database errors into HTTP status codes, return JSON. **No ORM.**
* **React frontend:** renders. No client-side business logic, no caching layer.

The clearest example: `POST /api/reviews` never checks whether you finished the anime. It runs the
INSERT and catches the error. The rule lives in a trigger, so it holds for every client — including
someone connected with `psql`.

---

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| **Database** | PostgreSQL 14+ (raw SQL, PL/pgSQL, triggers, views) |
| **Driver** | `pg` (node-postgres) |
| **Backend** | Node.js 18+ · Express |
| **Auth** | `jsonwebtoken` + `bcryptjs` |
| **Frontend** | React · Vite · React Router · Axios · Tailwind v4 |
| **Data source** | Jikan API (`https://api.jikan.moe/v4`) |

---

## 🗄️ Database setup

Every command runs from the repo root.

| Command | What it does |
|---|---|
| `npm run db:setup` | Builds a new database, or applies newer migrations to an existing one. **Safe** — skips the destructive `01_schema.sql` if a catalogue is already there. Run it after every `git pull`. |
| `npm run db:reset -- --all` | Full rebuild. **Destructive** — `01_schema.sql` drops every table. |
| `npm run db:restore` | Loads the committed catalogue dump. Offline, seconds. **Use this on a new machine.** |
| `npm run db:seed` | Fetches fresh data from Jikan. Needs internet, takes a few minutes. |
| `npm run db:dump` | Exports the catalogue to `backend/sql/data/seed_data.sql` so teammates can restore it. Needs `pg_dump`. |
| `npm run db:verify` | Checks every table, function, procedure, view, matview and trigger exists, plus data counts and demo readiness. |
| `npm run db:make-admin -- <email>` | Grants a registered user the `is_admin` flag. |
| `npm run db:seed:anilist` | Seeds from AniList instead of Jikan — a second source for when one is down. |
| `npm run db:sql -- "<SQL>"` | Runs SQL using the app's own `DATABASE_URL`. Avoids `psql`'s "role does not exist". `--q=users` lists canned queries. |

`db:setup` also accepts `--only=07`, `--from=06` and `--dry-run`.

**Setting up on a second machine** used to mean five `psql` invocations plus a multi-minute seed.
Now it's `createdb mdl && npm run setup`. The setup script uses the `pg` driver rather than shelling
out to `psql`, so a machine only needs Node and a reachable PostgreSQL.

**Reseeding options:**

```bash
npm run db:seed                              # 5 pages (~125 anime) + all their episodes
npm run db:seed -- --pages=3                 # fewer anime
npm run db:seed -- --episodes=none           # catalogue only, much faster
npm run db:seed -- --max-episodes=100        # cap episodes per anime for long-running series
npm run db:seed -- --force-episodes          # re-fetch episodes already stored
```

The seeder is idempotent and resumable: anime upsert on the unique `mal_id`, bridge rows use
`ON CONFLICT DO NOTHING`, and anime that already have episodes are skipped, so an interrupted run
picks up where it left off.

### A note on images

**Cover images are not stored.** `anime.cover_image` holds a URL pointing at MyAnimeList's CDN, and
the browser fetches it directly. A URL is ~80 bytes; the JPEG is ~100 KB. The database stays small,
backups stay fast, and image delivery is handled by a CDN built for it rather than by Node.

The trade-off: posters need internet to display. Every piece of *data* still works offline.

---

## ✨ Features

### 1. Schema and seeding
* **14 tables** — `users`, `anime`, `genres`, `anime_genres`, `studios`, `anime_studios`, `episodes`, `watchlist`, `reviews`, `review_votes`, `episode_discussions`, `followers`, `activity_log`, `notifications`.
* Third normal form, with two deliberate derived columns (`anime.score`, `reviews.helpful_count`) kept correct by triggers.
* **13 indexes** on the foreign keys, filter and sort columns queries actually use, including a GIN index on the search vector.
* `anime.mal_score` preserves the seeded rating as a fallback, so removing the last review doesn't blank a title's score.

### 2. Authentication
* bcrypt hashing (cost 10), JWTs valid 7 days, `authMiddleware` sets `req.userId` from the verified token.
* **`req.userId` is never read from the request body** — that's what stops one user acting as another.
* `adminMiddleware` re-reads `is_admin` from the database on every request rather than trusting a token claim, so a revoked role takes effect immediately instead of when the token expires.

### 3. Catalogue and discovery
* **Full-text search** over titles and synopses — a `tsvector` column maintained by `trg_anime_search`, GIN-indexed, `setweight`ed so title hits outrank synopsis hits, queried with `websearch_to_tsquery`.
* Filter by genre, studio, year and airing status; sort by rating, popularity, release date, title, episode count or review count. Genre and studio filters are exact, indexed `EXISTS` checks against the bridge tables.
* Pagination totals come from `COUNT(*) OVER()` in the same statement — one round trip, one consistent snapshot.
* `get_similar_anime()` ranks "more like this" by shared genres plus shared studios weighted double.
* `get_score_distribution()` builds a ten-bucket histogram with `generate_series`.
* `GET /api/anime/genres` for filter dropdowns, with per-genre counts.
* Trending: 5-table `LEFT JOIN` with a 7-day activity window.
* `top_by_genre` materialized view, ranked with `RANK() OVER (PARTITION BY ...)`.

### 4. Watchlist and trigger automation
* Full CRUD with a partial `PATCH` that builds a parameterized `SET` from whichever fields arrive.
* **`fn_episode_check`** auto-completes when `episodes_watched` reaches `episode_count`.
* **`fn_set_finish_date`** stamps `finished_at`. Named `trg_a_`/`trg_b_` because `BEFORE` triggers on one table fire in alphabetical order — the name *is* the sequencing mechanism.
* **`fn_log_watchlist`** writes `activity_log`. No route inserts into it.

### 5. Reviews and voting
* **`fn_review_guard`** — `BEFORE INSERT` trigger that queries `watchlist` and `RAISE EXCEPTION`s unless the anime is completed. The API never pre-checks; it converts the database error into HTTP 400.
* **`fn_update_anime_score`** recomputes `anime.score` on every insert, update *and* delete, falling back to `mal_score` when no reviews remain.
* **`fn_flag_review_edited`** — conditional (`WHEN`) trigger, so bumping `helpful_count` doesn't falsely mark a review edited.
* **`cast_helpful_vote`** procedure with `EXCEPTION WHEN unique_violation`; voting is a toggle, and `DELETE` reaches the same trigger to decrement.

### 6. Social graph and notifications
* Self-referential M:N `followers`, guarded by both a `CHECK` constraint and `fn_block_self_follow`.
* Follower and following lists — the same table read from opposite ends.
* **Notifications are written entirely by triggers.** Grep `backend/routes/` for `INSERT INTO notifications`; there isn't one.
* Unread count endpoint and a single-statement mark-all-read.

### 7. Episode discussions
* Per-episode threads with edit and delete of your own comment, ownership enforced in the SQL `WHERE` clause.
* **`trg_discussion_edit_flag`** — same conditional-`WHEN` pattern as reviews.
* **`trg_notify_discussion`** — a new comment notifies every earlier participant except the author, as one `INSERT ... SELECT`, `DISTINCT` so a repeat commenter is notified once.
* **`episode_card_view`** carries `comment_count` per episode, so a whole season's activity renders in one query.
* **`get_recent_discussions()`** powers a site-wide feed on the home page.

### 8. Profile analytics
* **`get_user_stats`** — six statistics, `RETURNS TABLE` + `FILTER`, one round trip.
* **`recommend_anime`** — explicit `CURSOR` over completed genres, accumulating into a `TEMP TABLE ... ON COMMIT DROP`.
* **`get_watch_history`** — keyset pagination (`WHERE id > last_seen`), which costs the same on page 100 as page 1.

---

## ⚡ Database objects

| File | Contents |
|---|---|
| [01_schema.sql](backend/sql/01_schema.sql) | 14 tables, PK/FK, cascades, `CHECK` constraints, 7 indexes |
| [02_triggers.sql](backend/sql/02_triggers.sql) | 11 triggers — scoring, guards, episode check, audit log, notifications |
| [03_functions.sql](backend/sql/03_functions.sql) | `get_user_stats`, `recommend_anime` (cursor), `get_watch_history` (keyset) |
| [04_procedures.sql](backend/sql/04_procedures.sql) | `cast_helpful_vote`, `bulk_drop_inactive` |
| [05_views.sql](backend/sql/05_views.sql) | `anime_card_view`, `top_by_genre` (materialized) |
| [06_discussions.sql](backend/sql/06_discussions.sql) | Discussion edit flag, reply notifications, `episode_card_view`, `get_recent_discussions`, `get_anime_discussion_stats` |
| [07_studios.sql](backend/sql/07_studios.sql) | `studio_card_view`, `get_top_studios` (RANK), `get_studio_anime` |
| [08_discovery.sql](backend/sql/08_discovery.sql) | Full-text search vector + GIN, `search_anime`, `anime_browse_view`, `get_similar_anime`, `get_score_distribution`, `get_catalogue_years` |
| [seed.js](backend/sql/seed.js) | Jikan import — idempotent, resumable, paginated |

**Totals:** 14 tables · 14 triggers · 11 PL/pgSQL functions · 2 procedures · 4 views · 1 materialized view · 13 indexes.

---

## 📡 API reference

### Auth (`/api/auth`)
* `POST /register` — `{username, email, password}`
* `POST /login` — `{email, password}`
* `GET /me` 🔒

### Anime (`/api/anime`)
* `GET /` — browse (`?page=1&q=naruto&genre=Action`)
* `GET /genres` — genre list with counts
* `GET /trending` — top 20 this week
* `GET /top?genre=` — from the `top_by_genre` matview
* `GET /:id` — anime + genres, studios, episodes (with comment counts), discussion stats

### Admin (`/api/admin`) 🔑 *admin only*
* `POST /refresh` — `REFRESH MATERIALIZED VIEW top_by_genre`
* `POST /bulk-drop` — `CALL bulk_drop_inactive(months)`, returns the `RAISE NOTICE` output

### Watchlist (`/api/watchlist`) 🔒
* `GET /me` · `POST /` · `PATCH /:animeId` · `DELETE /:animeId`

### Reviews (`/api/reviews`)
* `GET /anime/:animeId`
* `GET /anime/:animeId/my-votes` 🔒
* `POST /` 🔒 — 400 if `trg_review_guard` fires
* `PATCH /:reviewId` 🔒 · `DELETE /:reviewId` 🔒
* `POST /:reviewId/helpful` 🔒 · `DELETE /:reviewId/helpful` 🔒

### Social (`/api`) 🔒
* `POST|DELETE /users/:id/follow`
* `GET /notifications` · `GET /notifications/unread-count` · `PATCH /notifications/read-all` · `PATCH /notifications/:id/read`

### Episodes (`/api/episodes`)
* `GET /recent-discussions?limit=`
* `GET /:episodeId/discussions`
* `POST /:episodeId/discussions` 🔒
* `PATCH|DELETE /discussions/:discussionId` 🔒

### Users (`/api/users`)
* `GET /:id` · `GET /:id/stats` · `GET /:id/followers` · `GET /:id/following`
* `GET /:id/follow-status` 🔒
* `GET /me/recommendations` 🔒 · `GET /me/history?after=&limit=` 🔒 · `GET /me/activity?limit=` 🔒

🔒 requires a JWT · 🔑 requires `is_admin`

---

## 🎓 Demo page

`/demo` is a purpose-built panel for the presentation: a click → concept cheat sheet, a health
check, the materialized-view refresh, and the batch procedure with its `RAISE NOTICE` output. The
maintenance buttons need an admin account.

Throughout the UI, inline `Concept` labels name the exact database object behind each feature —
"Keyset Pagination via get_watch_history", "Stored procedure cast_helpful_vote", and so on.

---

## 🗺️ Roadmap

- [x] Scaffolding, schema, triggers, functions, procedures, views
- [x] Jikan seeding pipeline
- [x] Auth + JWT middleware
- [x] Catalogue, search, trending, leaderboards
- [x] Watchlist with trigger automation
- [x] Reviews, guard trigger, helpful voting
- [x] Social graph and trigger-written notifications
- [x] Episode discussions with edit, delete, counts and reply notifications
- [x] Recommendations, stats, keyset history
- [x] Admin-guarded maintenance procedures
- [x] One-command database setup, dump/restore, verification
- [x] Full-text search (`tsvector` + GIN)
- [x] Sorting, year/status/studio filtering, similar-anime, score histograms
- [x] User directory, profile editing, public watchlists
- [ ] Scheduled matview refresh (`pg_cron`)
- [ ] Row-level security
