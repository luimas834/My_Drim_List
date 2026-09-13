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
