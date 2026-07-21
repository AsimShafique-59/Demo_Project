# Architecture note

## Stack choice: vanilla JS + Express, not Next.js/TypeScript

This was a deliberate call, not a default. Next.js + TypeScript is a fine production
choice, but for this timebox it would have spent budget on framework setup (routing,
build config, type definitions for the DB layer) instead of on the product behavior being
evaluated: editing, sharing, and access control. A build-free frontend and a small
JS backend meant every hour went into features and tests, not tooling.

If this were headed to production, the natural next step is exactly that migration:
Next.js (App Router) for the frontend with a proper component structure and SSR for
the document list, and TypeScript across the backend with typed DB models — the current
Express route shapes and SQLite schema would port over with minimal redesign.

## What I prioritized

Given the timebox, I optimized for **depth on the core loop** (create → edit → format →
save → reopen → share) over breadth of features. Concretely:

- **A real, working access-control model** on the server (owner vs. shared, enforced in
  every route, not just hidden in the UI) rather than a cosmetic sharing toggle. The test
  suite exists specifically to prove this: an unauthenticated request is rejected, a
  non-owner cannot open or re-share a private doc, and access appears/disappears correctly
  after a share is granted.
- **A rich-text editor that actually round-trips.** Using `contenteditable` +
  `document.execCommand` instead of pulling in a full editor framework (TipTap/Slate/Quill)
  meant zero build tooling and no version-compatibility risk, at the cost of some editing
  polish (execCommand is a deprecated-but-still-universally-supported API; a production
  version would move to a maintained rich-text framework).
- **Single-process deployment.** One Node server serves the API and the static frontend
  from the same origin, so there's no CORS configuration, no separate frontend build/deploy
  step, and no proxy setup — it's one `npm start` away from running anywhere.
- **SQLite over Postgres/Supabase.** Zero setup, zero external account, file-based, trivially
  inspectable, and the schema (users/documents/shares) would port to Postgres with almost no
  changes if scale demanded it later.

## What I deliberately cut

- **Real auth** (passwords, sessions, OAuth). Mocked user-switching demonstrates the same
  access-control logic without spending the budget on auth plumbing.
- **`.docx` import.** Parsing OOXML properly needs a real library and edge-case handling;
  `.txt`/`.md` demonstrates the same "file → document" product behavior for a fraction of
  the effort, and is clearly labeled as the supported set in the UI and README.
- **Real-time collaboration** (live cursors, CRDT/OT merge). This is the single most
  expensive feature on the list relative to what it'd prove for this exercise; the app
  uses simple last-write-wins autosave instead.
- **Granular permission levels** (viewer vs. editor). Sharing is binary access, which is
  enough to demonstrate the sharing *model* (owner grants access, recipient sees it
  distinctly) without over-building a permissions system nobody asked for yet.

## Data model

```
users(id, username)
documents(id, title, content, owner_id, created_at, updated_at)
shares(id, document_id, user_id)   -- one row per (document, grantee) pair
```

`content` stores the editor's HTML directly — simplest thing that preserves formatting
(headings, lists, bold/italic/underline) exactly as authored, with no lossy conversion
step in either direction.

## What I'd build next with 2-4 more hours

1. **Debounced conflict handling**: detect if a document changed since it was loaded
   (e.g. via `updated_at` check) before overwriting on save, instead of pure last-write-wins.
2. **Viewer vs. editor roles** on shares, enforced in the same `canAccess` check that
   already exists.
3. **Document version history** — append-only snapshots on save, with a simple diff/restore UI.
4. **`.docx` import** via `mammoth` to convert to HTML on upload.
5. **Export to PDF/Markdown** from the editor.
