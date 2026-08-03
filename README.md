# My Drim List (MDL) 🎌

> A database-first anime tracking web application built for DBMS-II. All business logic, scoring, constraint enforcement, and statistics computation live directly inside **PostgreSQL**.

---

## 💡 Architectural Philosophy: "Thin Backend, Fat Database"

Unlike conventional web applications that rely on Object-Relational Mappers (ORMs) and heavy backend service layers, MDL follows a strict **database-first** design:

* **PostgreSQL (Fat Layer):** Handles all business logic using raw SQL, PL/pgSQL functions, procedures, triggers, cursors, and materialized views.
* **Express Backend (Thin Messenger):** Pure API translation layer. It authenticates requests, executes parameterized SQL queries (`$1, $2`), and returns JSON. **No ORM (Prisma/Sequelize) is used.**
* **React Frontend:** Handles UI rendering and state display.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Database** | PostgreSQL 14+ (Raw SQL, PL/pgSQL, Triggers, Views) |
| **Database Driver** | `pg` (node-postgres) |
| **Backend** | Node.js + Express.js |
| **Authentication** | JSON Web Tokens (`jsonwebtoken`) + Password Hashing (`bcryptjs`) |
| **Frontend** | React + Vite + React Router + Axios |
| **Data Source** | Jikan API (`https://api.jikan.moe/v4`) |

---

## ✨ Features & Functionality

### 1. Database Foundation & Schema
* **14 Core Entities:** `users`, `anime`, `genres`, `anime_genres`, `studios`, `anime_studios`, `episodes`, `watchlist`, `reviews`, `review_votes`, `episode_discussions`, `followers`, `activity_log`, `notifications`.
* **Automated Data Seeding (`seed.js`):** Node script that pages through the Jikan API to populate real anime, genres, studios, and episode records.
* **Real-time Views & Ranking:**
  * `anime_card_view`: Regular view flattening anime details with concatenated genres and studios (`STRING_AGG`).
  * `top_by_genre`: Materialized view pre-ranking top anime per genre using window functions (`RANK() OVER (PARTITION BY ...)`).

### 2. User Authentication
* **Registration & Login:** Password hashing with `bcryptjs` (cost factor 10) and JWT token generation (7-day expiration).
* **Protected Routes Middleware:** `authMiddleware` validates `Authorization: Bearer <token>` headers and attaches `req.userId`.

### 3. Anime Catalog & Discovery
* **Catalog Browsing & Search:** Paginated search by title (`ILIKE`) and genre filtering.
* **Anime Details:** Returns complete anime info along with nested genres, studios, and episodes.
* **Trending & Leaderboards:** Fetches weekly trending anime based on user activity and queries the `top_by_genre` materialized view.
* **Admin Refresh:** `POST /api/admin/refresh` triggers `REFRESH MATERIALIZED VIEW top_by_genre`.

### 4. Watchlist Management & Trigger Automation
* **Watchlist Tracking:** Full CRUD operations for user watchlists (`watching`, `completed`, `on-hold`, `dropped`, `plan-to-watch`).
* **Dynamic Partial Updates (`PATCH`):** Allows updating any combination of `status`, `episodes_watched`, or `user_score` via dynamic parameterized SQL.
* **Automated DB Triggers:**
  * **Episode Check (`fn_episode_check`):** Auto-marks status as `'completed'` when `episodes_watched` reaches `anime.episode_count`.
  * **Finish Date Stamping (`fn_set_finish_date`):** Automatically sets `finished_at = CURRENT_DATE` upon completion.
  * **Audit Logging (`fn_log_watchlist`):** Logs all watchlist actions directly into `activity_log`.

### 5. Reviews & Helpful Voting
* **Review CRUD:** One review per user per anime, enforced by a `UNIQUE (user_id, anime_id)` constraint.
* **Completion Guard (`fn_review_guard`):** A `BEFORE INSERT` trigger `RAISE EXCEPTION`s unless the user has completed the anime — the API never pre-checks this in JavaScript, it simply converts the database error into HTTP 400.
* **Live Score Aggregation (`fn_update_anime_score`):** Every insert, update, or delete recomputes `anime.score` as the average of its reviews.
* **Edit Detection (`fn_flag_review_edited`):** A conditional (`WHEN`) trigger sets `is_edited` and `edited_at` only when the body or score actually changes.
* **Helpful Votes:** `POST /api/reviews/:id/helpful` calls the `cast_helpful_vote` stored procedure, which handles duplicate and invalid votes with `EXCEPTION` blocks; a companion trigger keeps `helpful_count` in sync.

### 6. Social Graph & Notifications
* **Follow / Unfollow:** Self-referential M:N relationship on `followers`, guarded at two layers — a declarative `CHECK (follower_id <> following_id)` and the `fn_block_self_follow` trigger.
* **Trigger-Written Notifications:** No route ever inserts a notification. `fn_notify_new_follower` fires on a new follow, and `fn_notify_new_review` fans a review out to every follower of the reviewer.
* **Notification Inbox:** Users list their own notifications and mark them read; ownership is enforced in the SQL `WHERE` clause rather than in application code.

### 7. Episode Discussions
* **Per-Episode Threads:** Public read, authenticated write, ordered oldest-first and joined to usernames in a single query.
* **Referential Integrity:** A missing episode surfaces as a foreign key violation (`23503`) mapped to HTTP 404, and `ON DELETE CASCADE` clears threads when an anime or episode is removed.

---

## ⚡ Database Logic & Trigger Summary

All SQL scripts reside in [backend/sql/](backend/sql):

| File | Purpose |
|---|---|
| [01_schema.sql](backend/sql/01_schema.sql) | DDL tables, PK/FK relationships, cascading deletes, indexes |
| [02_triggers.sql](backend/sql/02_triggers.sql) | 11 Automated triggers (scoring, guards, episode check, audit logging, notifications) |
| [03_functions.sql](backend/sql/03_functions.sql) | PL/pgSQL functions (`get_user_stats`, explicit cursor recommendation engine `recommend_anime`, keyset pagination `get_watch_history`) |
| [04_procedures.sql](backend/sql/04_procedures.sql) | Stored procedures (`cast_helpful_vote`, `bulk_drop_inactive`) |
| [05_views.sql](backend/sql/05_views.sql) | Views (`anime_card_view`) and Materialized Views (`top_by_genre`) |
| [seed.js](backend/sql/seed.js) | Jikan API data fetching and PostgreSQL population script |

---

## 📡 API Reference

### Auth Routes (`/api/auth`)
* `POST /api/auth/register` — Register a new user (`{username, email, password}`)
* `POST /api/auth/login` — Login user & return JWT token (`{email, password}`)
* `GET /api/auth/me` — Verify token & fetch current user details *(Protected)*

### Anime Routes (`/api/anime`)
* `GET /api/anime` — Browse & search anime (`?page=1&q=naruto&genre=Action`)
* `GET /api/anime/trending` — Fetch top 20 trending anime this week
* `GET /api/anime/top` — Fetch top-ranked anime by genre (`?genre=Action`)
* `GET /api/anime/:id` — Get single anime with genres, studios, and episode list

### Admin Routes (`/api/admin`)
* `POST /api/admin/refresh` — Refresh the `top_by_genre` materialized view

### Watchlist Routes (`/api/watchlist`) *(Protected)*
* `GET /api/watchlist/me` — Get current user's watchlist joined with `anime_card_view`
* `POST /api/watchlist` — Add or upsert anime in watchlist (`{anime_id, status}`)
* `PATCH /api/watchlist/:animeId` — Partial update (`{status?, episodes_watched?, user_score?}`)
* `DELETE /api/watchlist/:animeId` — Remove anime from watchlist

### Review Routes (`/api/reviews`)
* `GET /api/reviews/anime/:animeId` — List an anime's reviews with usernames, newest first
* `POST /api/reviews` — Write a review (`{anime_id, body, score}`) — 400 if the anime is not completed *(Protected)*
* `PATCH /api/reviews/:reviewId` — Edit your own review (`{body?, score?}`) *(Protected)*
* `DELETE /api/reviews/:reviewId` — Delete your own review *(Protected)*
* `POST /api/reviews/:reviewId/helpful` — Mark a review helpful via `cast_helpful_vote` *(Protected)*

### Social Routes (`/api`) *(Protected)*
* `POST /api/users/:id/follow` — Follow a user — 400 on self-follow, 409 if already following
* `DELETE /api/users/:id/follow` — Unfollow a user
* `GET /api/notifications` — List your notifications, newest first
* `PATCH /api/notifications/:id/read` — Mark one of your notifications as read

### Episode Routes (`/api/episodes`)
* `GET /api/episodes/:episodeId/discussions` — List an episode's comments with usernames, oldest first
* `POST /api/episodes/:episodeId/discussions` — Post a comment (`{comment}`) — 404 if the episode does not exist *(Protected)*

---

## 🚀 Quick Start & Setup Guide

### 1. Database Setup
Ensure PostgreSQL is running, then create the database and execute the SQL scripts in order:

```bash
# Create database
createdb mdl

# Load database schema and PL/pgSQL objects
psql mdl -f backend/sql/01_schema.sql
psql mdl -f backend/sql/02_triggers.sql
psql mdl -f backend/sql/03_functions.sql
psql mdl -f backend/sql/04_procedures.sql
psql mdl -f backend/sql/05_views.sql

# Seed data from Jikan API
node backend/sql/seed.js
```

### 2. Environment Configuration
Create `backend/.env`:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mdl
JWT_SECRET=your_super_secret_jwt_key
PORT=4000
```

### 3. Run Backend & Frontend
```bash
# Start Backend (http://localhost:4000)
cd backend
npm install
node index.js

# Start Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

---

## 🗺️ Product Roadmap

- [x] Project Scaffolding & Environment Setup
- [x] Database Schema, Triggers, Functions, Procedures & Views
- [x] Data Seeding Pipeline (Jikan API integration)
- [x] Authentication & JWT Middleware
- [x] Anime Catalog & Search API
- [x] Watchlist Management & Automated DB Triggers
- [x] User Reviews & Review Guarding Triggers
- [x] Social Features (Follow/Unfollow & Follower Notifications)
- [x] Episode Discussion Forums
- [ ] Personalized Recommendations Engine & Profile Stats
- [ ] Admin Maintenance Procedures
- [ ] Complete React User Interface & UI Integration
