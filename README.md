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

### Session 4 — 2026-03-10
- Flow detail page `/flows/:id` — breadcrumb, stats (pass rate, total runs, avg duration, last status), SVG pass rate bar chart, run history table, steps tab
- Dashboard overhaul — stat cards with glow blobs, colored left-border run rows, improved empty state
- Flow cards visual upgrade — colored left border by status, thin pass rate bar at top, screenshot thumbnail
- Step execution timing — `waitForLoadState('domcontentloaded')` after click + 400ms delay between steps
- Vite port changed 5173 → 3000 (avoid conflict with maigambar.my)
- `🧹 Clear History` button in flows toolbar — clears all run data + screenshots, keeps flow definitions
- `🗑 Clear All Flows` button in flows toolbar — deletes flow definitions + all run history
- Backend: `DELETE /api/projects/:id/runs` + `DELETE /api/projects/:id/flows` endpoints
- Removed duplicate "Clear Run Data" from Settings panel
- GitHub remote added: `github.com/noobster97/maiflow.my` (main branch), initial push done

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
- [x] Flow detail page `/flows/:id` with run history + pass rate chart
- [x] Clear History + Clear All Flows buttons
- [x] GitHub remote setup
- [ ] Edit recorded flow script
