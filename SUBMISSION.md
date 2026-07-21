# Submission contents

## Included in this folder

- `server/` — Express backend: password auth (sign-up/login), document CRUD, sharing
  (grant/revoke), delete, file upload, version history (snapshot + restore)
- `public/` — frontend: login/sign-up screen, editor, sidebar with search, share modal,
  version history modal, Markdown export, confirm dialogs, toast notifications — vanilla
  HTML/CSS/JS
- `tests/api.test.js` — automated API test suite (`npm test`), 10 passing tests covering
  auth (sign-up/login/password verification), ownership, sharing/access control, revoke,
  delete, version history + restore, and validation
- `README.md` — stack, local setup and run instructions, feature walkthrough, demo
  credentials, known limitations
- `ARCHITECTURE.md` — what was prioritized, what was cut, and why (including the stack
  choice of vanilla JS/Express over Next.js/TypeScript)
- `AI_WORKFLOW.md` — AI tool usage note
- `package.json` — `npm install`, `npm start`, `npm test`
- `render.yaml` — one-click free Render Blueprint deploy config (no persistent disk — that
  requires a paid Render plan; `data.sqlite` resets on redeploy but persists across
  restarts/idle spin-down, which is fine for demo/review)

## Not included — requires action outside this coding session

The following items from the task's deliverable list require steps I cannot perform from
here (a live deploy, a screen recording, uploading to Google Drive/YouTube/Loom):

- **Live deployment URL** — not deployed yet. The app is a single Node process
  (`npm install && npm start`) with no required environment variables, so it deploys
  as-is to Render, Railway, Fly.io, or similar in a few minutes. `render.yaml` in this repo
  is a ready-to-use free Blueprint deploy on Render (no persistent disk — see the note in
  README.md about what that tradeoff means).
- **Walkthrough video (3-5 min)** — not recorded. Suggested flow to record once deployed:
  log in as `alice` → create a doc → apply formatting → upload a `.txt` file → share the
  doc with `bob` → sign out → log in as `bob` → show it under "Shared with me" → refresh
  to show persistence.
- **Google Drive folder** — packaging/upload not performed in this session.

## Test accounts

Real username + password auth. Three seeded demo accounts exist for reviewers:

| Username | Password |
|---|---|
| `alice` | `password123` |
| `bob` | `password123` |
| `carol` | `password123` |

You can also sign up your own account from the login screen.

Suggested sharing demo: log in as `alice`, create/edit a document, share it with `bob`,
then sign out and log in as `bob` to see it appear under "Shared with me".

## What's working vs. incomplete

**Working end-to-end:** sign-up/login with hashed passwords, create, rename, rich-text
edit (bold/italic/underline/headings/bulleted+numbered lists), autosave, reopen after
refresh, upload `.txt`/`.md` into a new document, share a document with another user,
revoke a share, delete an owned document, visible owned-vs-shared distinction, search
across documents, **version history with restore** and **Markdown export** (stretch
features), server-side access
control (verified by 10 automated tests), validation (empty title, weak password,
duplicate username, unsupported upload type all rejected).

**Incomplete / explicitly out of scope:** sessions/cookies (auth is header-based per
request, no server-side session store), real-time co-editing, granular (viewer/editor)
permissions, `.docx` import, PDF export, diff view between versions. See ARCHITECTURE.md
for the reasoning and what's next.
