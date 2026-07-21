# Docly — Collaborative Document Editor

A lightweight, Google Docs-inspired document editor: rich-text editing, file upload,
sharing between users, and version history — built as a full-stack product exercise.

## Links

- **Live product URL**: _TODO — add after deploying (see Deployment section below;
  `render.yaml` is included for a one-click Render deploy)._
- **Walkthrough video (3–5 min)**: _TODO — add Loom/YouTube link after recording._
- **Source / Drive folder**: _TODO — add link if hosting the source separately from this
  write-up._

## Test accounts

Real username + password auth (no one-click impersonation). Three seeded demo accounts
exist so reviewers can test the sharing flow between two users immediately:

| Username | Password |
|---|---|
| `alice` | `password123` |
| `bob` | `password123` |
| `carol` | `password123` |

You can also sign up your own account from the login screen — any username/password
(min 6 characters) works and is hashed server-side.

**Suggested sharing demo**: log in as `alice` → create/edit a document → share it with
`bob` → sign out → log in as `bob` → see it appear under "Shared with me".

---

## What's included

- `server/` — Express backend: password auth (sign-up/login), document CRUD, sharing
  (grant/revoke), delete, file upload, version history (snapshot + restore)
- `public/` — frontend: login/sign-up screen, editor, sidebar with search, share modal,
  version history modal, Markdown export, confirm dialogs, toast notifications — vanilla
  HTML/CSS/JS, no build step
- `tests/api.test.js` — automated test suite (`npm test`), **10 passing tests** covering
  auth (sign-up/login/password verification), ownership, sharing/access control, revoke,
  delete, version history + restore, and validation
- `package.json` — `npm install`, `npm start`, `npm test`
- `render.yaml` — one-click Render deploy config (persistent disk mounted for `data.sqlite`)
- Supporting docs: `README.md`, `ARCHITECTURE.md`, `AI_WORKFLOW.md`, `SUBMISSION.md` (this
  file is a self-contained merge of all four, for a single-document review)

## Setup & run (local)

Requires Node.js 18+.

```bash
npm install
npm start
```

Open **http://localhost:3000**. The SQLite file (`data.sqlite`) is created automatically
on first run, seeded with the three demo accounts above.

```bash
npm test
```

Runs the automated API test suite against a throwaway SQLite file (doesn't touch
`data.sqlite`).

> **Restart caveat**: don't delete `data.sqlite` while a server process still has it open —
> SQLite locks the live connection read-only (`SQLITE_READONLY_DBMOVED`) until the process
> restarts. Stop the server first if you want a clean slate.

## Deployment

Single Node process serving both the API and static frontend — deploys as-is to any Node
host (Render, Railway, Fly.io, a VPS) with `npm install && npm start`. No environment
variables required.

A `render.yaml` is included for a one-click **free** Blueprint deploy on Render.

**Free-tier tradeoff, stated plainly**: Render's persistent disks require a paid plan, so
this config runs without one — `data.sqlite` lives on the free service's local filesystem.
Data survives normal restarts and the free tier's inactivity spin-down/wake-up cycle, but
resets on a new deploy (e.g. a new commit pushed). Fine for demo/review (documents persist
across refresh and idle periods, which is the in-scope requirement); not sufficient for
real production use without a paid disk or an external DB (e.g. Turso/Postgres).

---

## Feature walkthrough

1. **Log in** with a demo account (e.g. `alice` / `password123`), or sign up your own.
2. **Create a document** with the sidebar button, or **upload** a `.txt`/`.md` file to
   instantly turn it into a new editable document. (Only `.txt`/`.md` are accepted, max
   2MB — stated in the UI and here; `.docx` was cut for scope.)
3. **Edit**: rename via the title field; format with the toolbar (bold, italic, underline,
   headings, bulleted/numbered lists). Autosaves ~500ms after you stop typing.
4. **Share**: click "Share" on an open document, pick another user by username. That user
   sees it under "Shared with me" on login. The owner can revoke access or delete the
   document from the same surface.
5. **Version history** (stretch feature): click "History" to see past snapshots and
   restore one. Snapshots are taken automatically as you edit, throttled to at most once a
   minute so autosave doesn't flood history with near-duplicates. Restoring is itself
   reversible — it snapshots the current state first.
6. **Export** (second stretch feature): click "Export" to download the open document as a
   `.md` file — headings/bold/italic/underline/lists converted to Markdown client-side, no
   server round trip.
7. **Refresh** at any time — documents, formatting, sharing, and version history all persist.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | Node.js + Express (JavaScript) | REST API, served from `server/` |
| Database | SQLite via `better-sqlite3` | Single file, `data.sqlite`, zero setup |
| Frontend | Vanilla HTML/CSS/JS (no framework, no build step) | `contenteditable` + `document.execCommand` for rich text |
| Testing | Node's built-in `node:test` + `supertest` | Runs against the real Express app |

This is intentionally **not** Next.js/TypeScript — see the architecture reasoning below.

**Auth**: username + password, scrypt-hashed server-side, no plaintext storage, no
one-click impersonation. No sessions/cookies/JWTs — after login the client holds
`{id, username}` and sends `X-User-Id` per request, which is enough to demonstrate real
per-user access control without building session infrastructure a demo doesn't need.

---

## Architecture note

### Stack choice: vanilla JS + Express, not Next.js/TypeScript

A deliberate call, not a default. Next.js + TypeScript is a fine production choice, but
for this timebox it would have spent budget on framework setup (routing, build config,
type definitions) instead of the product behavior being evaluated: editing, sharing,
access control. A build-free frontend and a small JS backend meant every hour went into
features and tests, not tooling. If this went to production, the natural next step is
exactly that migration — the current Express route shapes and SQLite schema would port
over with minimal redesign.

### What I prioritized

Depth on the core loop (create → edit → format → save → reopen → share) over breadth:

- **A real, working access-control model** on the server (owner vs. shared, enforced in
  every route, not hidden in the UI). The test suite exists specifically to prove this:
  unauthenticated requests rejected, non-owners can't open or re-share private docs,
  access appears/disappears correctly after sharing.
- **A rich-text editor that actually round-trips.** `contenteditable` + `execCommand`
  instead of a full framework (TipTap/Slate/Quill): zero build tooling, no
  version-compatibility risk, at a small cost to editing polish.
- **Single-process deployment.** One Node server serves API and static frontend from the
  same origin — no CORS config, no separate frontend build/deploy, no proxy setup.
- **SQLite over Postgres/Supabase.** Zero setup, zero external account, file-based,
  trivially inspectable; the schema would port to Postgres with minimal changes at scale.
- **Markdown export** (second stretch addition): client-side only, walks the editor DOM,
  triggers a browser download. No server round trip, no new dependency — a PDF export
  would have needed a headless-browser dependency (Puppeteer), a worse risk/reward trade
  given sandbox instability hit during this session (see AI workflow notes below).
- **Version history** (primary stretch feature): every save that changes content
  snapshots the previous state, throttled to at most once a minute so autosave-on-every-
  keystroke-pause doesn't flood history with near-duplicates. One new table
  (`document_versions`), two new endpoints, fully additive — no existing route reshaped.

### What I deliberately cut

- **Full session infrastructure** (cookies, JWTs, server-side sessions) — header-based
  auth (`X-User-Id`) is enough to demonstrate genuine per-user access control without
  building session plumbing a demo doesn't need.
- **`.docx` import** — OOXML parsing needs a real library and edge-case handling;
  `.txt`/`.md` demonstrates the same "file → document" behavior for a fraction of the
  effort, clearly labeled as the supported set.
- **Real-time collaboration** (live cursors, CRDT/OT merge) — the single most expensive
  feature on the list relative to what it'd prove here; simple last-write-wins autosave
  instead.
- **Granular permission levels** (viewer vs. editor) — sharing is binary access, enough to
  demonstrate the sharing *model* (owner grants access, recipient sees it distinctly)
  without over-building a permissions system nobody asked for yet.

### Data model

```
users(id, username, password_hash)
documents(id, title, content, owner_id, created_at, updated_at)
shares(id, document_id, user_id)              -- one row per (document, grantee) pair
document_versions(id, document_id, title, content, created_at)
```

`content` stores the editor's HTML directly — simplest thing that preserves formatting
exactly as authored, no lossy conversion in either direction.

### What I'd build next with 2–4 more hours

1. Debounced conflict handling — detect if a document changed since it was loaded before
   overwriting on save, instead of pure last-write-wins.
2. Viewer vs. editor roles on shares, enforced in the same `canAccess` check that exists.
3. A real diff view in the version history panel (currently restore-only).
4. `.docx` import via `mammoth`.
5. PDF export from the editor.
6. Sessions (signed cookies or JWTs) in place of the `X-User-Id` header, if this ever left
   demo scope.

---

## AI workflow note

Built entirely with **Claude Code** (Claude, Anthropic's agentic CLI) in a single session,
operating directly on the filesystem: writing files, running `npm install`, starting the
server, and hitting live endpoints to verify behavior — not just generating code and
hoping it works.

**Stretch feature choice**: of the offered options (real-time indicators, comments,
version history, export, role-based permissions), version history was picked first
because it's self-contained — one new table, two new endpoints, one new modal — and
doesn't require new infrastructure (no WebSockets, no rendering pipeline). Markdown export
was added second for the same reason: client-side only, no new dependency.

**Where AI materially sped up the work**:
- Scaffolding the whole stack in one pass — schema, Express routes, auth middleware,
  frontend, and tests drafted together with a consistent shape (the same `canAccess()`
  logic backs both the routes and the test suite).
- Test-writing alongside routes meant access-control edge cases (non-owner opening a doc,
  non-owner re-sharing, empty-title rename) were covered immediately, not as an afterthought.
- Fast iteration under time pressure — empty directory to a running, tested, end-to-end
  app in one continuous pass.

**What I changed or rejected from the AI's first pass**:
- Rejected a full rich-text framework (TipTap/Quill/Slate) in favor of `contenteditable` +
  `execCommand` — better tradeoff for this scope.
- Consolidated share-checking into one `canAccess()` helper so routes and tests share the
  exact same authorization logic instead of two implementations drifting apart.
- Kept upload scope to `.txt`/`.md` only, with the limitation surfaced in the UI and docs
  rather than failing silently on unsupported files.
- The first auth pass used one-click "sign in as alice/bob/carol" buttons with no
  password. Reasonable demo shortcut, but wrong default for an exercise about access
  control — a screen that lets you click into anyone else's account undermines the
  sharing/ownership logic being tested. Replaced with real username+password auth
  (scrypt-hashed) for every account, credentials only in docs, never exposed as clickable UI.

**How correctness, UX, and reliability were verified**:
- **Automated**: `npm test` runs a real API test suite (not mocked) against a throwaway
  SQLite database — 10 tests, all passing, asserting on actual HTTP status codes and
  response bodies for the auth/sharing/access-control logic where a bug would be worst
  (data leaking to the wrong user).
- **Manual, against the running server**: signup, login, document creation, sharing,
  revoking, deleting, and file upload were all called directly over real HTTP to confirm
  persisted rows and returned JSON matched expectations before calling anything done.
- **Read-before-trust**: every generated file was reviewed for scope creep (unused
  abstractions, speculative options) and trimmed rather than accepted as-is.
- **A real bug caught by live verification, not by reading code**: mid-session, signup
  started returning `SQLITE_READONLY_DBMOVED`. Root cause: repeatedly deleting/recreating
  `data.sqlite` while an earlier server process still had the file open — SQLite locks
  that connection read-only for safety. A related issue: a stale background server
  process kept answering with old route code after edits, making fixes look like they
  "didn't work" when the real problem was a leftover process on the port. Both diagnosed
  by cross-checking `ps`/`ss` process and port state against what the code on disk
  actually said — now called out in the docs so a reviewer doesn't hit the same trap.
- **A classic falsy-zero bug, caught by the test suite**: the version-history snapshot
  throttle read its interval as `Number(process.env.VERSION_SNAPSHOT_INTERVAL_MS) || 60000`.
  Setting it to `'0'` in tests silently fell back to the 60-second default, because `0` is
  falsy in JS — a second edit in the same test run produced 1 version instead of 2. The
  test caught it immediately; fixed with an explicit `!== undefined` check instead of `||`.

---

## What's working vs. incomplete

**Working end-to-end**: sign-up/login with hashed passwords, create, rename, rich-text
edit (bold/italic/underline/headings/bulleted+numbered lists), autosave, reopen after
refresh, upload `.txt`/`.md` into a new document, share a document with another user,
revoke a share, delete an owned document, visible owned-vs-shared distinction, search
across documents, version history with restore, Markdown export, server-side access
control (verified by 10 automated tests), validation (empty title, weak password,
duplicate username, unsupported upload type all rejected).

**Incomplete / explicitly out of scope**: sessions/cookies (auth is header-based per
request, no server-side session store), real-time co-editing, granular (viewer/editor)
permissions, `.docx` import, PDF export, diff view between versions. See the architecture
section above for reasoning and what's next.

**Not performed in this coding session** (require action outside a coding assistant):
live deployment, the walkthrough video recording, and packaging into a Google Drive
folder. `render.yaml` and the Deployment section above make the first one a few minutes
of manual work; the credentials and suggested demo flow above are what to walk through on
camera.
