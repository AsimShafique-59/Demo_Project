# AI workflow note

## Tools used

Built entirely with **Claude Code** (Claude, Anthropic's agentic CLI) in a single session,
operating directly on the filesystem: writing files, running `npm install`, starting the
server, and hitting live endpoints to verify behavior — not just generating code and hoping.

## Where AI materially sped up the work

- **Scaffolding the whole stack in one pass**: schema, Express routes, auth middleware,
  frontend HTML/CSS/JS, and test file were all drafted together with a consistent shape
  (e.g., the same `canAccess()` access-control logic is what both the API routes *and* the
  test suite exercise), rather than being assembled incrementally by hand.
- **Test-writing**: generating the Node `--test` + `supertest` suite alongside the routes
  meant access-control edge cases (non-owner opening a doc, non-owner attempting to
  re-share, empty-title rename) were covered immediately rather than being an afterthought.
- **Fast iteration under time pressure**: going from an empty directory to a running,
  tested, end-to-end app (login → create → format → upload → share → persist) happened in
  one continuous pass instead of context-switching between planning and typing.

## What I changed or rejected from the AI's first pass

- Rejected pulling in a full rich-text framework (TipTap/Quill/Slate) that Claude Code
  initially considered — decided `contenteditable` + `execCommand` was the better tradeoff
  for this scope: zero build step, zero dependency/version risk, at a small cost to editing
  polish. This is called out explicitly in ARCHITECTURE.md rather than hidden.
- Consolidated share-checking into one `canAccess()` helper so the exact same authorization
  logic backs both the routes and the tests, instead of two parallel implementations
  drifting apart.
- Kept upload scope to `.txt`/`.md` only (rejected attempting `.docx` parsing given the time
  budget), and made sure that limitation surfaces in both the UI copy and the README instead
  of failing silently on unsupported files.

## How correctness, UX, and reliability were verified

- **Automated**: `npm test` runs a real API test suite (not mocked) against a throwaway
  SQLite database, asserting on actual HTTP status codes and response bodies for the
  auth/sharing/access-control logic — the part of this app where a bug would be worst
  (data leaking to the wrong user).
- **Manual, against the running server**: after writing the code, the server was actually
  started and exercised live — user list, document creation, sharing between two seeded
  users, and file upload were all called over real HTTP (not just read through) to confirm
  the persisted rows and returned JSON matched expectations before calling it done.
- **Read-before-trust**: every generated file was reviewed for scope creep (unused
  abstractions, speculative options) and trimmed rather than accepted as-is — e.g., no
  premature role system, no unused config flags.
