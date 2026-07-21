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

**Auth**: Hybrid, kept intentionally lightweight —
- The 3 seeded demo users (alice, bob, carol) sign in with a single click, no password,
  so reviewers can test sharing instantly.
- Anyone else can create a real account (username + password, min 6 chars) via the sign-up
  form, or log back into one they created. Passwords are salted and hashed with `scrypt`
  server-side (`server/auth.js`) — never stored or returned in plaintext. There are no
  sessions/cookies/JWTs: the client just holds the returned `{id, username}` and sends
  `X-User-Id` on each request, which is enough to demonstrate real per-user access control
  without building out full session infrastructure for a demo.

## Setup & run (local)

Requires Node.js 18+.

```bash
npm install
npm start
```

Open **http://localhost:3000**. The SQLite file (`data.sqlite`) is created automatically
on first run, seeded with three users: `alice`, `bob`, `carol`.

## Running tests

```bash
npm test
```

Runs Node's built-in test runner against the Express API (using a throwaway SQLite file),
covering auth, document creation, access control, sharing, and validation.

## Using the app

1. **Sign in** as one of the seeded users (e.g. `alice`).
2. **Create a document** with the sidebar button, or **upload** a `.txt`/`.md` file to
   instantly turn it into a new editable document.
3. **Edit**: rename via the title field, format text with the toolbar (bold, italic,
   underline, headings, bulleted/numbered lists). Changes autosave ~500ms after you stop typing.
4. **Share**: click "Share" on an open document, pick another seeded user. That user will
   now see the document under "Shared with me" when they sign in.
5. **Refresh the page** at any time — documents, formatting, and sharing all persist.

Switch users via "Switch user" in the top bar to see the sharing flow from the other side
(e.g. sign in as `bob` after alice shares a doc with him).

## Supported file types for upload

Only `.txt` and `.md` files are accepted (max 2MB), converted into paragraphs in a new
document. This is stated in the upload control in the UI. `.docx` parsing was deliberately
cut for scope — see [ARCHITECTURE.md](ARCHITECTURE.md).

## Deployment

Ships as a single Node process serving both the API and static frontend, so it deploys
as-is to any Node host (Render, Railway, Fly.io, a VPS, etc.) with `npm install && npm start`.
No environment variables are required for local/demo use. `data.sqlite` should live on
persistent storage (a mounted volume) if deployed somewhere with an ephemeral filesystem.

## Known limitations / what's incomplete

- Auth is intentionally mocked (no passwords/sessions) — fine for a demo, not for production.
- Sharing is binary (has access / doesn't) — no granular roles like viewer vs. editor.
- No real-time collaboration (no live multi-cursor editing) — last write wins on save.
- Upload only supports `.txt`/`.md`, not `.docx`.
- No document version history or undo beyond the browser's native undo.

See [ARCHITECTURE.md](ARCHITECTURE.md) for what would come next with more time.
