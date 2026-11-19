# Doctor Tracker — API

**REST API for Doctor Tracker, a healthcare administration dashboard.** Express 5 + TypeScript + MongoDB, with cookie-based JWT authentication, validated inputs, indexed queries and aggregation-pipeline analytics.

> **Live API:** _added after deployment_ · **Demo login:** `admin@doctortracker.dev` / `Admin@12345`
>
> The Next.js frontend, screenshots and the full project write-up live in
> [Doctor_Tracker_Frontend](https://github.com/mohiuddinmazumder97/Doctor_Tracker_Frontend).

![Dashboard](https://raw.githubusercontent.com/mohiuddinmazumder97/Doctor_Tracker_Frontend/main/docs/screenshots/dashboard.png)

---

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Database schema](#database-schema)
- [API reference](#api-reference)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Seeding](#seeding)
- [Testing](#testing)
- [Deployment (Render)](#deployment-render)
- [Technical decisions](#technical-decisions)

---

## Features

- **Auth:** login / logout / me; bcrypt (cost 12); JWT (HS256, issuer-checked) in an `HttpOnly; SameSite=Lax` cookie (`Secure` in production); constant-time-ish login (dummy hash for unknown emails) and identical errors for wrong email vs password; failed-login rate limit keyed by IP + email; rejected cookies are cleared.
- **Doctors & patients:** full CRUD, search, filters, sorting, server-side pagination, doctor ↔ patient relationship with a strict no-orphans deletion policy.
- **Analytics:** overview KPIs, zero-filled registration trends in the caller's time zone, patients-per-doctor, condition and specialization distributions — all MongoDB aggregation pipelines.
- **Hardening:** Zod validation of every body, query and param (unknown fields rejected); regex-escaped search; `helmet`; CORS allow-list; 100 kB JSON limit; global API rate limit; centralized error handler that never leaks internals; fail-fast environment validation.
- **API docs:** Swagger UI at `/api/docs` from an OpenAPI 3.1 spec generated from the Zod validators and contract-tested against real responses.
- **Developer experience:** `npm run dev:memory` runs the whole API on a seeded in-memory MongoDB with zero configuration.

## Technology stack

Node.js ≥ 20 · **Express 5** · **TypeScript 7** (strict, NodeNext ESM) · **Mongoose 9** / MongoDB Atlas · **Zod 4** · jsonwebtoken · bcrypt · helmet · cors · cookie-parser · express-rate-limit · pino · **Vitest** + Supertest + mongodb-memory-server

## Architecture

```
src/
├── config/        env.ts (Zod-validated, fail fast) · db.ts
├── constants/     controlled vocabularies (specializations, conditions, genders)
├── models/        Admin, Doctor, Patient schemas + indexes
├── validators/    Zod schemas for bodies, params and query strings
├── routes/        Express routers (auth is public; everything else behind requireAuth)
├── controllers/   HTTP only: parse input → call service → send envelope
├── services/      business rules (doctor must exist, deletion policy, analytics shaping)
├── repositories/  queries & aggregation pipelines (projections, $lookup, $facet)
├── middlewares/   requireAuth, rate limiters, error/404 handlers
├── utils/         ApiError, response envelope, JWT, cookies, regex escaping, time-zone math
├── app.ts         Express app factory (no listen → testable)
└── server.ts      connect DB, listen, graceful shutdown
scripts/  seed.ts · dev-memory.ts
tests/    auth · doctors · patients · dashboard (+ setup, factories)
```

**Request flow:** `helmet → CORS → JSON (100 kB) → cookies → logging → rate limit → router → requireAuth → controller → service → repository → error handler`.

Express 5 forwards rejected promises from async handlers to the error handler, so controllers contain no `try/catch` boilerplate. Validation happens in controllers with a typed `parse(schema, input)` helper rather than a mutating middleware: in Express 5 `req.query` is a read-only getter, and calling the schema directly keeps fully inferred types end to end.

## Database schema

| Collection | Fields |
| --- | --- |
| `admins` | `name`, `email` (unique, lowercase), `passwordHash` (`select: false`), `role` (`admin`), timestamps |
| `doctors` | `name`, `specialization` (enum), `hospital`, `phone`, `email` (unique, lowercase), timestamps |
| `patients` | `fullName`, `email` (unique), `phone`, `dateOfBirth`, `gender` (`male`/`female`/`other`), `condition` (enum), `doctor` (ObjectId → doctors, **required**), `address` {`street`, `city`, `state`, `postalCode`, `country`}, timestamps |

**Indexes**

| Collection | Index | Used by |
| --- | --- | --- |
| doctors | `{ email: 1 }` unique | duplicate prevention (DB-enforced, race-safe) |
| doctors | `{ createdAt: -1, _id: -1 }` | default list order, date filters |
| doctors | `{ specialization: 1, createdAt: -1, _id: -1 }` | specialization filter + sort |
| doctors | `{ name: 1, _id: 1 }` | name sort |
| patients | `{ email: 1 }` unique | duplicate prevention |
| patients | `{ doctor: 1, createdAt: -1, _id: -1 }` | doctor roster, `patientCount` `$lookup`, patients-per-doctor |
| patients | `{ condition: 1, createdAt: -1, _id: -1 }` | condition filter, condition distribution |
| patients | `{ createdAt: -1, _id: -1 }` | default order, date filters, trends |
| patients | `{ fullName: 1, _id: 1 }` | name sort |

Verified on Atlas with `explain("executionStats")`: every list query is an `IXSCAN` with no in-memory `SORT`, examining exactly the documents it returns.

**Query design**
- Lists run `find`/`aggregate` and `countDocuments` **in parallel**, with projections (patient lists omit the address).
- Doctor lists attach `patientCount` with one `$lookup … $count` sub-pipeline over **only the current page** (no N+1); when sorting by patient count the lookup runs before `$sort`.
- Patient lists use `populate` for the doctor summary, which batches the page's doctor ids into **one** `$in` query.
- `.lean()` everywhere reads return plain objects; `versionKey` is disabled so no internal fields leak.

**Deletion policy:** `DELETE /api/doctors/:id` returns **409** with `details.patientCount` while patients are assigned. Patients must be reassigned (`PATCH /api/patients/:id { doctor }`) or deleted first. Creating or reassigning a patient verifies the doctor exists.

## API reference

**Base path:** `/api` · **Auth:** session cookie `dt_access_token` (set by login). All endpoints except `/auth/login`, `/auth/logout` and `/health` require it.

**Interactive docs (Swagger UI):** [`/api/docs`](http://localhost:5000/api/docs) · raw OpenAPI 3.1 JSON: [`/api/docs.json`](http://localhost:5000/api/docs.json). Run `POST /api/auth/login` from the page first; the browser then sends the session cookie with every “Try it out” request.

The spec lives in `src/docs/openapi.ts`. Request bodies and query parameters are **generated from the same Zod schemas the controllers validate with** (`z.toJSONSchema`), so the documented rules can't drift from the real ones. Response schemas are strict (`additionalProperties: false`), and `tests/openapi.test.ts` checks real success and error responses from every endpoint against them.

### Response envelope

```jsonc
// success
{ "success": true, "data": { /* … */ } }
// success (lists)
{ "success": true, "data": [ /* … */ ], "meta": { "page": 1, "limit": 10, "total": 24, "totalPages": 3 } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
  "details": [ { "path": "email", "message": "Enter a valid email address" } ] } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` / `BAD_REQUEST` | invalid body/query/id, unknown fields, malformed JSON, non-existent doctor reference |
| 401 | `UNAUTHORIZED` | missing, invalid or expired session |
| 404 | `NOT_FOUND` | unknown record or route |
| 409 | `CONFLICT` | duplicate email; deleting a doctor who has patients |
| 429 | `TOO_MANY_REQUESTS` | rate limit exceeded |
| 500 | `INTERNAL_ERROR` | unexpected failure (details logged, never returned) |

### Auth

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | `{ email, password }` | `200 { admin }` + `Set-Cookie` · 401 · 429 after 10 failures / 15 min |
| `POST` | `/auth/logout` | — | `204`, cookie cleared |
| `GET` | `/auth/me` | — | `200 { admin: { _id, name, email, role } }` · 401 |

The token is **never** returned in the body.

### Doctors

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/doctors` | see query parameters below; each item includes `patientCount` |
| `POST` | `/doctors` | body: `name`, `specialization`, `hospital`, `phone`, `email` → `201` · 409 duplicate email |
| `GET` | `/doctors/:id` | includes `patientCount` · 404 |
| `PATCH` | `/doctors/:id` | any subset of the create fields (at least one); returns the doctor with `patientCount` |
| `DELETE` | `/doctors/:id` | `204` · **409 `{ patientCount }` while patients are assigned** |
| `GET` | `/doctors/:id/patients` | the doctor's patients; same parameters as `/patients` except `doctorId` |

| Query parameter | Values |
| --- | --- |
| `search` | case-insensitive contains on name, email, hospital, specialization (≤ 100 chars, regex-escaped) |
| `specialization` | one of the 14 specializations |
| `from`, `to` | `createdAt` range — ISO timestamp, or `YYYY-MM-DD` (`to` inclusive to end of day) |
| `page`, `limit` | `1…`, `1–100` (default `1`, `10`) |
| `sortBy` | `createdAt` (default) · `name` · `specialization` · `hospital` · `patientCount` |
| `order` | `desc` (default) · `asc` |

```bash
curl -b cookies.txt "http://localhost:5000/api/doctors?search=cardio&sortBy=patientCount&limit=1"
```

Real response from the seeded demo data:

```json
{
  "success": true,
  "data": [
    {
      "_id": "6aff466859687fffde426064",
      "name": "Dr. Sophia Rahman",
      "specialization": "Cardiology",
      "hospital": "St. Mary Medical Center",
      "phone": "+1 (523) 613-0384",
      "email": "sophia.rahman@healthfirst.org",
      "createdAt": "2026-01-07T15:44:53.171Z",
      "updatedAt": "2026-01-07T15:44:53.171Z",
      "patientCount": 13
    }
  ],
  "meta": { "page": 1, "limit": 1, "total": 5, "totalPages": 5 }
}
```

### Patients

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/patients` | list rows omit `address`; `doctor` is `{ _id, name, specialization, hospital }` |
| `POST` | `/patients` | body below → `201` · 400 if the doctor doesn't exist · 409 duplicate email |
| `GET` | `/patients/:id` | full record; `doctor` adds `email`, `phone` |
| `PATCH` | `/patients/:id` | any subset; `{ "doctor": "<id>" }` reassigns |
| `DELETE` | `/patients/:id` | `204` |

```json
{
  "fullName": "Jane Doe", "email": "jane@example.com", "phone": "+1 555 123 4567",
  "dateOfBirth": "1990-05-01", "gender": "female", "condition": "Asthma",
  "doctor": "6aff31d26abcf75b9a5363dc",
  "address": { "street": "1 Main St", "city": "Boston", "state": "MA", "postalCode": "02108", "country": "USA" }
}
```

Query parameters: `search` (name, email, phone), `doctorId`, `condition`, `gender`, `from`, `to`, `page`, `limit`, `sortBy` (`createdAt` · `fullName` · `dateOfBirth` · `condition`), `order`.

### Dashboard

All accept `tz` (IANA time zone, default `UTC`) — it defines "this month" and bucket boundaries. Range endpoints accept `from` / `to`.

| Path | Returns |
| --- | --- |
| `/dashboard/overview` | `totals {doctors, patients}`, `thisMonth`, `lastMonth`, `averagePatientsPerDoctor`, `recentDoctors[]`, `recentPatients[]` (`recentLimit` ≤ 20) |
| `/dashboard/patient-trends` | `interval` (`day`·`week`·`month`), `points[{ bucket: "YYYY-MM-DD", count }]` **zero-filled**, `total` — defaults to the last 30 days / 12 weeks / 12 months; ≤ 400 buckets |
| `/dashboard/doctor-distribution` | top `limit` doctors by patients (`doctorId`, `name`, `specialization`, `patientCount`), `totalPatients`, `doctorsWithPatients`, `otherPatients` |
| `/dashboard/condition-distribution` | `items[{ condition, count }]`, `total` |
| `/dashboard/specialization-distribution` | `items[{ specialization, doctorCount, patientCount }]`, `totalDoctors` |

Trends group with `$dateTrunc` (timezone-aware, weeks start Monday) and are zero-filled in the service using calendar arithmetic; month boundaries are computed DST-correctly without date libraries. The doctor distribution groups on the patients collection, `$facet`s the top-N and totals, and `$lookup`s only the N winning doctors.

### Health

`GET /api/health` → `200 {"success":true,"data":{"status":"ok"}}` when the database is connected, `503` with `"status":"degraded"` otherwise (used as Render's health check).

## Getting started

```bash
npm install
cp .env.example .env         # fill in MONGODB_URI and JWT_SECRET
npm run seed                 # demo admin + demo data
npm run dev                  # http://localhost:5000
```

**No database?** `npm run dev:memory` starts an in-memory MongoDB (replica set), seeds it and runs the API — no `.env` required.

| Script | Purpose |
| --- | --- |
| `npm run dev` | watch mode (tsx) using `.env` |
| `npm run dev:memory` | in-memory MongoDB + seed + watch |
| `npm test` | Vitest integration suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm start` | compile to `dist/` / run it |
| `npm run seed [-- --reset \| --admin-only]` | demo data |

> npm 11 blocks dependency install scripts by default; `package.json` → `allowScripts` already permits the two this project needs (`bcrypt`, `esbuild`).

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `MONGODB_URI` | ✔ | — | Atlas `mongodb+srv://…` string |
| `MONGODB_DB_NAME` | | `doctor_tracker` | |
| `JWT_SECRET` | ✔ | — | ≥ 32 chars; `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | | `1d` | `15m` / `12h` / `1d`; also the cookie `Max-Age` |
| `CORS_ORIGINS` | | `http://localhost:3000` | comma-separated |
| `PORT` | | `5000` | |
| `NODE_ENV` | | `development` | `production` → `Secure` cookies |
| `TRUST_PROXY` | | `1` | number of proxy hops in front of the app (see deployment) |
| `LOG_LEVEL` | | `info` | pino level |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | | demo values | used by `npm run seed` |

The server validates its environment at startup and refuses to start with a readable list of problems.

## Seeding

`npm run seed` upserts the demo admin (resetting its password) and, if no doctors exist, inserts **24 doctors and 180 patients** generated by a seeded PRNG — the same dataset every time — with `createdAt` dates spread over the past 12 months (gently growing, weighted towards common specialties and conditions) so analytics are meaningful. `--reset` wipes and regenerates; `--admin-only` skips demo data.

## Testing

```bash
npm test
```

40 integration tests run the real Express app against an in-memory MongoDB (indexes synced, collections cleared between tests):

- **auth** — cookie flags, token never in body, identical 401s, validation, rate limit (429), `/me` with missing/tampered/orphaned tokens (cookie cleared), logout, protected routes
- **doctors** — CRUD, case-insensitive duplicate email (409), unknown fields rejected, 400 vs 404 ids, deletion policy, pagination metadata and stable ordering, multi-field search incl. regex injection, filters, `patientCount` sort, a doctor's patients
- **patients** — doctor existence checks, field validation, duplicates, reassignment unblocking doctor deletion, projection, filters, pagination
- **openapi** — the spec and Swagger UI are served without auth; real success and error responses from every endpoint validate against the documented schemas (Ajv, draft 2020-12)
- **dashboard** — empty database, every aggregation against known data, live updates, date ranges, parameter validation, **time-zone bucketing** (a 02:00 Dhaka registration counts in Dhaka's month), **DST-correct month starts**, Monday-aligned zero-filled weeks

Browser end-to-end suites covering the full UI live in the frontend repo (`npm run test:e2e`).

## Deployment (Render)

1. **Atlas:** create a database user; under **Network Access** allow `0.0.0.0/0` (Render free instances have no static outbound IP).
2. **Render → New Web Service** from this repo:
   - Runtime: Node · Build: `npm ci && npm run build` · Start: `npm start`
   - Health check path: `/api/health`
3. **Environment:** `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (new random value), `CORS_ORIGINS=https://<frontend>.vercel.app`, `TRUST_PROXY` — the number of proxies between the client and the app (Vercel's rewrite + Render's load balancer; the exact value is confirmed against live request headers during deployment).
4. Seed once: `MONGODB_URI="…" npm run seed` from your machine.
5. Point the frontend's `BACKEND_URL` at the Render URL.

## Technical decisions

### 1. Cookie-based JWT behind a same-origin proxy

Tokens live in an `HttpOnly` cookie so page scripts (and any XSS) can never read them. Because the frontend (Vercel) and API (Render) are different sites, the frontend proxies `/api/*` through its own origin; the cookie is therefore first-party and works with `SameSite=Lax` in every browser (no `SameSite=None`, no Safari/ITP failures), and the frontend's edge route guard can see it. The API remains the only place that verifies the JWT and holds the secret, and it clears any cookie it rejects so the guard and the API can't disagree into a redirect loop. Trade-off: client IPs arrive through proxy headers, which is why `TRUST_PROXY` is configurable for accurate rate limiting.

### 2. Offset pagination + escaped-regex search on `_id`-terminated indexes

Admin tables need numbered pages, totals, multi-column sorting and partial-match search. Cursor pagination can't jump to page 7, and `$text` can't match "joh" in "John", so the API uses `skip`/`limit` + `countDocuments` in parallel and a case-insensitive *contains* regex built from **escaped** input (preventing regex injection/ReDoS). Every sort gets an `_id` tiebreaker and every compound index ends in `_id`, giving stable pages with no in-memory sorts. At admin scale this is milliseconds; past ~100k documents the next step would be Atlas Search and keyset pagination.
