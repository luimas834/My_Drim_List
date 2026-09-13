# My Drim List — Backend 

> The Node.js/Express backend for **My Drim List (MDL)**. The backend follows the project's **"thin backend, fat database"** architecture: it authenticates requests, executes parameterized SQL, translates database errors into HTTP responses, and returns JSON. Business logic remains inside PostgreSQL.

---

## ⚡ Backend overview

The MDL backend is an Express application that sits between the React frontend and PostgreSQL.

Its main responsibilities are:

- Authentication.
- JWT verification.
- Authorization middleware.
- HTTP routing.
- Parameterized SQL execution.
- Calling PostgreSQL functions and procedures.
- Returning JSON responses.
- Translating database errors into HTTP status codes.

The backend intentionally does **not** use an ORM.

The database is the primary business-logic layer.

```text
┌──────────────────────────────┐
│        React Frontend        │
│                              │
│  UI + Axios + React Router   │
└──────────────┬───────────────┘
               │ HTTP / JSON
               ▼
┌──────────────────────────────┐
│      Node.js + Express       │
│                              │
│  Routes                      │
│  JWT authentication          │
│  Authorization               │
│  Parameterized SQL           │
│  Error translation           │
└──────────────┬───────────────┘
               │ SQL
               ▼
┌──────────────────────────────┐
│         PostgreSQL           │
│                              │
│ Tables / Constraints         │
│ Triggers / Functions         │
│ Procedures / Views           │
│ Materialized Views           │
└──────────────────────────────┘
```
The backend is deliberately a **thin messenger**.

---

## 🛠️ Technology stack

| Technology | Purpose |
|---|---|
| **Node.js 18+** | Backend runtime |
| **Express** | HTTP server and routing |
| **pg** | PostgreSQL driver |
| **jsonwebtoken** | JWT authentication |
| **bcryptjs** | Password hashing |
| **PostgreSQL 14+** | Database and business-logic layer |
| **Jikan API** | Anime catalogue data source |

---

## 🧠 Architectural philosophy

The project's core design is:

> **Thin backend, fat database**

Instead of putting application rules into JavaScript service classes, MDL places important rules directly in PostgreSQL.

The backend generally follows:

```text
HTTP request
    ↓
Authentication
    ↓
Parameterized SQL
    ↓
PostgreSQL
    ↓
JSON response
```

The backend does not duplicate database business rules.

##  Why no ORM?

MDL is a DBMS-II project designed to demonstrate database features directly.

Using raw SQL and PostgreSQL objects makes the database implementation visible.

The project uses:

- Raw SQL.
- PL/pgSQL functions.
- Procedures.
- Triggers.
- Views.
- Materialized views.
- Cursors.
- Window functions.
- Full-text search.
- Keyset pagination.

The `pg` driver connects Node.js directly to PostgreSQL.

---

## ⚡ Quick start

From the repository root:

```bash
createdb mdl
cp backend/.env.example backend/.env
npm run setup
npm run dev
```
he development environment uses:

```text
Backend  → :4000
Frontend → :5173
```

---

## 🔐 Environment configuration

The backend environment contains database and authentication configuration.

Example:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mdl
JWT_SECRET=change_this_to_a_long_random_string
PORT=4000
```

The actual secret should be changed for real deployments.

The backend owns these credentials.

They must never be placed in frontend code.

---

## 🗄️ PostgreSQL connection

The backend uses the `pg` Node.js driver.

The connection is based on:

```text
DATABASE_URL
```

The backend sends parameterized SQL to PostgreSQL.
