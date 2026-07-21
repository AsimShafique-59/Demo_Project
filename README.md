# Docly — a lightweight collaborative document editor

A small full-stack app inspired by Google Docs: create/edit rich-text documents,
upload text files as new documents, and share documents between seeded users.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | Node.js + Express (JavaScript) | REST API, served from `server/` |
| Database | SQLite via `better-sqlite3` | Single file, `data.sqlite`, zero setup |
| Frontend | Vanilla HTML/CSS/JS (no framework, no build step) | `contenteditable` + `document.execCommand` for rich text |
| Testing | Node's built-in `node:test` + `supertest` | Runs against the real Express app |

This is intentionally **not** Next.js/TypeScript — see [ARCHITECTURE.md](ARCHITECTURE.md)
for why a build-free vanilla stack was chosen for this scope, and what a
production-grade rewrite would look like.

**Auth**: Real username + password (no one-click impersonation) —
- Sign up with a username and password (min 6 characters), or log in with one you already
  created. Passwords are salted and hashed with `scrypt` server-side (`server/auth.js`) —
  never stored or returned in plaintext.
- 3 seeded demo accounts exist for reviewers to test sharing between two users immediately:

  | Username | Password |
  |---|---|
  | `alice` | `password123` |
  | `bob` | `password123` |
  | `carol` | `password123` |

- There are no sessions/cookies/JWTs: after login the client just holds the returned
  `{id, username}` and sends `X-User-Id` on each request. That's enough to demonstrate real
  per-user access control server-side without building out full session infrastructure for
  a demo — see [ARCHITECTURE.md](ARCHITECTURE.md) for the tradeoff.

## Setup & run (local)

Requires Node.js 18+.

```bash
npm install
npm start
```

Open **http://localhost:3000**. The SQLite file (`data.sqlite`) is created automatically
on first run, seeded with three demo accounts (see credentials table above).

> **Note on restarting**: don't delete `data.sqlite` while a server process still has it
> open — SQLite will lock the live connection read-only (`SQLITE_READONLY_DBMOVED`) until
> you restart the process. Stop the server first, then delete the file if you want a clean
> slate.

## Running tests

```bash
npm test
```

Runs Node's built-in test runner against the Express API (using a throwaway SQLite file),
covering auth, document creation, access control, sharing, and validation.

## Using the app

1. **Log in** with a demo account (e.g. `alice` / `password123`), or sign up your own.
2. **Create a document** with the sidebar button, or **upload** a `.txt`/`.md` file to
   instantly turn it into a new editable document.
3. **Edit**: rename via the title field, format text with the toolbar (bold, italic,
   underline, headings, bulleted/numbered lists). Changes autosave ~500ms after you stop typing.
4. **Share**: click "Share" on an open document, pick another user by username. That user
   will now see the document under "Shared with me" when they log in. The owner can revoke
   access or delete the document from the same menu.
5. **Version history** (stretch feature): click "History" on an open document to see past
   snapshots and restore one. Snapshots are taken automatically as you edit, throttled to at
   most once a minute so autosave doesn't flood the history with near-duplicates. Restoring
   saves the current state to history first, so it's itself reversible.
6. **Export**: click "Export" to download the open document as a `.md` file (headings,
   bold/italic/underline, and lists are converted to Markdown client-side — no server round
   trip, no new dependency).
7. **Refresh the page** at any time — documents, formatting, sharing, and version history
   all persist.

Use "Log out" in the top bar and log back in as `bob` (same demo password) to see the
sharing flow from the recipient's side.

## Supported file types for upload

Only `.txt` and `.md` files are accepted (max 2MB), converted into paragraphs in a new
document. This is stated in the upload control in the UI. `.docx` parsing was deliberately
cut for scope — see [ARCHITECTURE.md](ARCHITECTURE.md).

## Deployment

Ships as a single Node process serving both the API and static frontend, so it deploys
as-is to any Node host (Render, Railway, Fly.io, a VPS, etc.) with `npm install && npm start`.
No environment variables are required.

A `render.yaml` is included for a one-click **free** deploy on [Render](https://render.com)
(Blueprint deploy — connect the repo and it picks up the config automatically).

**Free-tier tradeoff, stated plainly**: Render's persistent disks require a paid plan, so
this free-tier config does *not* mount one — `data.sqlite` lives on the service's local
filesystem. That data survives normal restarts and the free tier's inactivity spin-down/
wake-up cycle, but resets on a new deploy (e.g. pushing a new commit). That's fine for
demo/review purposes (documents persist across refresh and across idle periods — the
requirement in scope) but not acceptable for real production use. Add a persistent disk
(a paid Render plan, or an external DB like Turso/Postgres) if this ever needs to survive
redeploys.

## Known limitations / what's incomplete

- Auth is intentionally mocked (no passwords/sessions) — fine for a demo, not for production.
- Sharing is binary (has access / doesn't) — no granular roles like viewer vs. editor.
- No real-time collaboration (no live multi-cursor editing) — last write wins on save.
- Upload only supports `.txt`/`.md`, not `.docx`.
- No document version history or undo beyond the browser's native undo.

See [ARCHITECTURE.md](ARCHITECTURE.md) for what would come next with more time.
