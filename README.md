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

### Session 5 — 2026-03-11
- Sequential run queue: Run All now runs flows one-by-one, not simultaneously
- Stop All button: cancels project queue + current active run
- `timeoutHandle` scope bug fixed — was declared inside `try {}`, inaccessible in `catch {}`, causing all assertion failures to show "Run ended unexpectedly" instead of real error
- Headless toggle: project setting — headless=false shows browser window during run
- Run timeout: auto-close browser after configurable ms (default 60s)
- Webhook on failure: POST to URL with run/flow/error payload
- Env variables: `{{VAR_NAME}}` substitution in step values + URLs
- Flow ordering: `order_index` column + ↑↓ reorder buttons in UI
- Export CSV: download run history as CSV from project toolbar
- Queue indicator badge: shows "X running · Y waiting" in project UI
- Fix relative URL: runner prepends `base_url` for URLs starting with `/` or no `http`
- Fix `assert_text` 30s hang: added `{ timeout: 8000 }` to `page.textContent()`
- Fix SPA timing: `waitUntil: 'domcontentloaded'` instead of `networkidle`
- Fix timezone "8h ago" bug: `parseUtc()` helper appends `Z` to SQLite UTC strings
- Fix stuck runs: safety net in `finally` force-fails runs still in 'running' state
- RunDetailPage back button: now goes to flow detail page, not dashboard
- `flows-maigambar.json` rewrite: 44 flows, correct assertion texts, wait steps after navigates
- Settings: removed duplicate "Clear Run Data" (moved to toolbar as "🧹 Clear History")

### Session 10 — 2026-03-13
- ai-flow-guide.md: corrected credential policy — hardcode test credentials directly in flow JSON, not in maiflow.my env_vars. env_vars are optional, only useful for environment-switching (e.g. BASE_URL staging vs prod). Guide is instruction-only, no credential policy imposed on projects.
- flows-maigambar-crud.json: replaced `{{STRIPE_TEST_EMAIL}}` / `{{STRIPE_TEST_PASSWORD}}` with hardcoded values directly in flow JSON.

### Session 9 — 2026-03-13
- `wait_for_url` step action: polls `page.url()` every 1s until URL contains match or timeout (default 120s). For manual Stripe payment flows — resumes immediately when Stripe redirects back to app. 300s timeout for payment flows.
- `ai-flow-guide.md` full rewrite: project-agnostic precision ruleset for AI agents generating flow JSON for any project. Covers 2 failure types, 6-step research protocol, assertion ranking (assert_url > assert_element > scoped assert_text > body last resort), SPA timing rules, 5 selector pitfalls, idempotency rules, 14-point validation checklist. Section 7 is now a general template with maigambar.my as a clearly labeled example subsection.
- All credentials removed from guide: replaced with `{{ENV_VAR}}` placeholders throughout. Real values belong in maiflow.my project env_vars only — never in the guide or flow files.

### Session 7 — 2026-03-13
- Stop All fix: frontend reload timeout 500ms → 1500ms (gives browser process time to fully close)
- `upload_file` runner fix: `waitForSelector` now uses `{ state: 'attached' }` — file inputs are `display:none`, visibility check was always timing out
- flows-maigambar-crud.json: 17 targeted fixes — SPA timing (2000→3000ms on form pages), `textarea[name='description']` to avoid `<meta>` tag collision, `a[href*='/book/']` replaces text-match selector, hidden file input compatibility
- maigambar.my seeder: `bio` → `description` column fix, auto-configure ToyyibPay/Chip payment from `.env` vars
- `.env` + `.env.example` (maigambar.my): added `TOYYIBPAY_SECRET`, `TOYYIBPAY_CATEGORY_CODE`, `CHIP_BRAND_ID`, `CHIP_SECRET_KEY`

### Session 6 — 2026-03-13
- Dashboard: stat cards updated to "last 100 runs", added Project Health section (per-project pass/fail counts, mini progress bar, colored left border, clickable to project)
- ProjectDetailPage: filter by status (All/Failed/Passed/Running/Never Run), sort by (Latest/Name/Pass Rate/Duration), "↺ Run Failed (N)" button to re-run only failed flows
- Phase 2 — `upload_file` step action: downloads file from URL to temp, sets on `<input type="file">` via Playwright
- Phase 3 — `extract` step action: reads DOM text/attribute → stores as runtime variable → usable as `{{varName}}` in later steps
- AI Guide: comprehensive markdown instruction file for AI agents to generate flow JSON for any project. `GET /api/flows/ai-guide` download endpoint + "⬇ AI Guide" button in toolbar
- Removed Template button (AI Guide supersedes it)
- Fixed pre-existing `Timeout | null` TypeScript error in runner.ts catch block
- maigambar.my 401 interceptor bug fixed: wrong-password login no longer triggers redirect to /login
- flows-maigambar-crud.json: 30 Phase 1 CRUD flows (Packages, Settings, Availability, Promotions, Bookings, Clients, Subscription, Portfolio, Reviews, Public booking, Dashboard, Business Guide, Staff)

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
