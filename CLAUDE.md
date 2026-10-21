# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication rules

- Trả lời bằng tiếng Việt có dấu, ngắn gọn, dễ hiểu.
- Không dùng quá nhiều thuật ngữ kỹ thuật chi tiết, trừ khi người dùng chỉ định.

## Project status

Stage 3 in progress (npm workspaces `client` + `server`). Done: 2.1.1 register, 2.1.2 login; 2.1.3 profile, 2.2.1 categories, 2.2.2 add book (merged); 2.2.3 book list (merged); 2.2.4 book detail (merged); 2.2.5 edit/delete book (merged); 2.3.1 reader borrow request (merged); 2.3.2 staff confirm/reject (merged); 2.4.1 reader return request (branch `feature/return-request`). Track per-feature status in the PRD's "Trạng thái" column.

The full spec is `.claude/PRD.md` (written in Vietnamese). Read it before implementing any feature; feature codes like `2.3.1` refer to its sections.

## What we're building

A web-based library lending system (Hệ Thống Quản Lý Thư Viện Mượn Trả Sách) with three roles:
- **Reader** — browse/borrow/renew/return books, pay fines
- **Librarian** — manage categories and books, confirm/reject borrow and return requests, confirm fine payments
- **Admin** — manage users and roles, configure fine levels, view reports

## Tech stack (from PRD)

- **Frontend:** React, TailwindCSS, Context API, Axios, React Hook Form, Day.js, Recharts
- **Backend:** Node.js + Express (JavaScript, not TypeScript), Prisma ORM, Joi validation, JWT auth (`jsonwebtoken`, 24h tokens)
- **Database:** PostgreSQL hosted on Supabase (Supabase also for file storage)
- **Deploy:** Vercel; CI via GitHub Actions

A Supabase MCP server is configured in `.mcp.json` — use it to inspect tables/logs/advisors before schema changes.

## Commands

Run from the repo root (Node ≥ 24). Copy `server/.env.example` → `server/.env` and `client/.env.example` → `client/.env` first.

- `npm install` — installs both workspaces; `server` postinstall runs `prisma generate`
- `npm run dev:server` — Express on :4000 (`node --watch`, loads `server/.env`)
- `npm run dev:client` — Vite on :5173, proxies `/api` → :4000
- `npm test` / `npm run lint` / `npm run build` — all workspaces (Vitest, oxlint, Vite build)
- Single test file: `npm test -w server -- src/app.test.js`; single test by name: `npm test -w client -- -t "renders the heading"`
- `npm run prisma:generate -w server` — regenerate client after editing `schema.prisma`; `npm run prisma:pull -w server` prints the DB-introspected schema to compare against

Gotchas:
- Prisma is pinned to **7.x** — npm `latest` is the 8.0 RC, which removed `prisma generate`. Don't bump to 8.
- The generated client is TypeScript (`server/src/generated/prisma`, gitignored). The JS backend imports it as `../generated/prisma/client.ts`; Node 24 strips types natively (`importFileExtension = "ts"` in the generator). Import Prisma only via `server/src/lib/prisma.js`.
- npm 11 blocks dependency install scripts unless listed in root `package.json` `allowScripts` (`npm approve-scripts <pkg>`).
- Backend: Express 5 (async errors propagate to the error handler), `bcryptjs` (pure JS), `multer` + `@supabase/supabase-js` for uploads to Supabase Storage. Frontend: React 19, `react-router` v8 (import from `react-router`, not `react-router-dom`), Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.js`; just `@import "tailwindcss"`).

## Domain rules that span multiple features

These invariants are easy to break when implementing features in isolation:

- **Workflows are request → staff confirmation.** Registration, borrowing, returning, and fine payment each create a record in a "Chờ xác nhận" (pending) state that a librarian later confirms or rejects. Rejections require a reason that the reader can see.
- **Borrow eligibility (2.3.1):** book has available copies, reader has < 5 active borrows (default max), and reader has no unpaid fines. Duration default 14 days, max 30. Renewal: +7 days, once, only before due date.
- **Inventory counts change on confirmation, not request:** available decreases when a librarian confirms a borrow; available increases / borrowed decreases when a return is confirmed as "Bình thường".
- **Borrow statuses:** Chờ xác nhận, Đang mượn, Quá hạn, Đã trả, Bị từ chối. Only one pending return request per borrow.
- **Return confirmation (2.4.2):** condition is Bình thường / Hư hỏng / Mất. Damaged or lost requires choosing an admin-configured fine level (2.5.1) plus a note (≤500 chars); late returns generate a separate "Trả muộn" fine. Damaged/lost still marks the borrow "Đã trả".
- **Fine statuses:** Chưa thanh toán → (reader marks paid after bank transfer) Chờ xác nhận → librarian confirms paid or rejects with reason.
- **Deletion guards:** a category can't be deleted while books reference it; a book can't be deleted while it has active borrows. Both require a confirmation step.
- **Public endpoints:** book list (2.2.3: search by title/author, filter by category, sort, 10 per page) and book detail need no login; borrow history on book detail is librarian-only.
- Validation limits (field lengths, password 8–16 chars, ISBN-10/13, publish year 1900–current) are defined per feature in the PRD — enforce them in both Joi (backend) and React Hook Form (frontend).

## Development process (Waterfall)

The project follows Waterfall: finish each stage before starting the next.

1. **Stage 1 — Requirements:** done. Output is `.claude/PRD.md`.
2. **Stage 2 — Design:**
   - Business flows go in `design/flows/`, written in Mermaid. Each flow must cover the happy case **and** its edge cases (validation failures, rejections, ineligible borrows, deletion guards, etc.).
   - The ERD goes in `design/ERD.md`, written in Mermaid (`erDiagram`).
   - Once the ERD is done, create the database on Supabase with the Supabase MCP (`apply_migration`). Keep the Prisma schema consistent with it.
3. **Stage 3 — Implementation:** one feature at a time, following the PRD's dependency order (Part 3: auth → books → borrow/return → fines → user management → reports).
   - Before writing any code, read `common_errors.md` (if it exists) to avoid repeating mistakes already made.
   - Create a separate git branch per feature (`/git-branch`).
   - After implementing a feature, test it with: unit tests, API tests (Postman via the Postman MCP — not installed yet), and E2E tests (Playwright via the Playwright MCP — not installed yet).
   - Merge into `main` (`/merge`) only after the tests pass and the feature has been reviewed.
   - Update the "Trạng thái" column in `.claude/PRD.md` when a feature is completed.
4. **Stage 4 — Deployment:** deploy to Vercel using the Vercel MCP (not installed yet).

If a stage needs an MCP that isn't installed yet (Postman, Playwright, Vercel), ask the user to install it instead of working around it.

## Project structure

Keep this section current (the `/wrap-up` command updates it). Only level 1–2 important files/folders.

- `.claude/PRD.md` — product requirements and feature dependency table
- `design/flows/` — (Stage 2) Mermaid business flows, happy case + edge cases
- `design/ERD.md` — (Stage 2) Mermaid ERD; source for the Supabase schema
- `db/migrations/` — SQL migrations applied to Supabase project `library-lending` (ref `fjhjphkjtpabrwwzptjl`, ap-southeast-1) via `apply_migration`; source of truth for the DB
- `client/` — React + Vite frontend (`src/`, tests next to components, `src/test/setup.js`)
- `server/` — Express backend; `src/app.js` (app, exported for Supertest), `src/index.js` (listen), `src/lib/prisma.js`
- `server/prisma/schema.prisma` + `server/prisma.config.ts` — Prisma 7 schema mirroring the migrations (no `prisma migrate`; partial/expression indexes, CHECKs, triggers live only in SQL)
- `server/src/routes/`, `validators/`, `middleware/validate.js`, `middleware/auth.js` (`authenticate`, `optionalAuthenticate`, `requireRole`), `middleware/rateLimit.js` (login / password-change limiters), `lib/token.js` (JWT carries a password fingerprint `pv`, so a password change revokes old tokens), `lib/password.js`, `test/auth.js` (token helper for tests) — route modules (+ tests), Joi schemas, validation + JWT auth/role middleware, token signing, bcrypt helpers
- `client/src/pages/`, `components/` (`Field`, `RequireAuth`), `context/AuthContext.jsx`, `lib/api.js` — pages (+ tests), shared form/route-guard components, auth state (token in localStorage; 401 → logout), Axios instance
- `.claude/commands/` — project slash commands (commit, git-branch, merge, pull, push, wrap-up, learn-by-mistake, new-project)
- `.mcp.json` — MCP server config (Supabase, Playwright, Postman, Vercel)
- `common_errors.md` — (created by `/learn-by-mistake`) log of past mistakes and fixes, grouped by category; check it before repeating similar work
