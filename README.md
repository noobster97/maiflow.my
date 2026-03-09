# maiflow.my

Self-hosted E2E browser automation testing platform. Define test flows, run them automatically against any web project, get screenshots and reports — no manual testing needed.

---

## What It Does
- Register projects (base URL + test credentials)
- Define test flows in JSON/config (click, fill, navigate, assert)
- Run Playwright-powered tests in headless browser
- Capture screenshots on pass/fail
- View results in a web dashboard
- Schedule or trigger runs on demand

## Stack
- Frontend: React + TypeScript + Tailwind
- Backend: Node.js + Playwright
- DB: PostgreSQL / SQLite
- Queue: BullMQ

---

## Session Log

### Session 1 — 2026-03-10
- Project created
- Architecture planned
- Stack decided: Node.js + Playwright + React dashboard
- Next: Scaffold the project structure, init git, start backend

### Session 2 — 2026-03-10
- Full scaffold: Express backend + React/TypeScript frontend
- `node:sqlite` built-in DB (no native deps), Playwright runner
- Flow builder UI, run dashboard, screenshot capture
- Fixed `@types/node` v22 for `node:sqlite` support
- cross-env for Windows NODE_OPTIONS compatibility

### Session 3 — 2026-03-10
- Scheduled runs (node-cron): every 30m / hourly / 6h / daily
- Retry on failure: auto re-run with `retry_on_failure` flag
- Flow clone endpoint + UI button
- Cancel running test: `taskkill` on Windows, SIGKILL elsewhere
- Orphaned run cleanup on server startup
- Concurrent run protection (409 if already running)
- Screenshot disk cleanup: daily cron deletes >7-day old records + files
- Pass rate display per flow (7/10 passing, color-coded)
- Full UI/UX overhaul: "Void" dark theme (Sora + JetBrains Mono, indigo accent)
- Fixed sidebar layout, status dots, skeleton loaders, stagger animations
- N+1 eliminated: `/flows/project/:id/with-runs` endpoint (2 queries total)
- FlowBuilder data-loss bug fixed (`{ ...step, action }` not `{ action }`)
- Delete project with inline confirm, edit project settings panel
- Edit manual flow steps inline, keyboard Escape closes panels
- Inline notifications replacing all `alert()` calls
- Pending: edit recorded flow script, flow detail page `/flows/:id`

---

## Roadmap (v1 Focus)
- [x] Project registration (name, base URL, credentials)
- [x] Flow builder (JSON-based step config)
- [x] Test runner (Playwright execution engine)
- [x] Screenshot capture (pass + fail)
- [x] Results dashboard (React)
- [x] Schedule runs (cron-based)
- [x] Retry on failure, clone flow, cancel run
- [x] Full dark UI overhaul
- [ ] Edit recorded flow script
- [ ] Flow detail page with full run history + pass rate chart
