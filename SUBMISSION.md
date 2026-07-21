# Submission contents

## Included in this folder

- `server/` — Express backend (auth middleware, document CRUD, sharing, file upload)
- `public/` — frontend (login screen, editor, sidebar, share modal) — vanilla HTML/CSS/JS
- `tests/api.test.js` — automated API test suite (`npm test`), 4 passing tests covering
  auth, ownership, sharing/access control, and validation
- `README.md` — local setup and run instructions, feature walkthrough, known limitations
- `ARCHITECTURE.md` — what was prioritized, what was cut, and why
- `AI_WORKFLOW.md` — AI tool usage note
- `package.json` — `npm install`, `npm start`, `npm test`

## Not included — requires action outside this coding session

The following items from the task's deliverable list require steps I cannot perform from
here (a live deploy, a screen recording, uploading to Google Drive/YouTube/Loom):

- **Live deployment URL** — not deployed yet. The app is a single Node process
  (`npm install && npm start`) with no required environment variables, so it deploys
  as-is to Render, Railway, Fly.io, or similar in a few minutes. Recommend Render's free
  web service tier: connect this repo, build command `npm install`, start command
  `npm start`, and add a persistent disk mounted so `data.sqlite` survives restarts.
- **Walkthrough video (3-5 min)** — not recorded. Suggested flow to record once deployed:
  sign in as alice → create a doc → apply formatting → upload a `.txt` file → share the
  doc with bob → switch user to bob → show it under "Shared with me" → refresh to show
  persistence.
- **Google Drive folder** — packaging/upload not performed in this session.

## Test accounts

No passwords — pick a seeded user from the login screen:

- `alice`
- `bob`
- `carol`

Suggested sharing demo: sign in as `alice`, create/edit a document, share it with `bob`,
then switch user to `bob` to see it appear under "Shared with me".

## What's working vs. incomplete

**Working end-to-end:** create, rename, rich-text edit (bold/italic/underline/headings/
lists), autosave, reopen after refresh, upload `.txt`/`.md` into a new document, share a
document with another seeded user, visible owned-vs-shared distinction, server-side access
control (verified by automated tests), basic validation (empty title rejected, unsupported
upload types rejected).

**Incomplete / explicitly out of scope:** real authentication, real-time co-editing,
granular (viewer/editor) permissions, `.docx` import, version history, PDF/Markdown export.
See ARCHITECTURE.md for the reasoning and what's next.
