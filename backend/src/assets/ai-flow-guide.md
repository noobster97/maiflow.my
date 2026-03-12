# maiflow.my — AI Flow Generation Guide

You are helping generate a **test flow JSON file** for maiflow.my, a self-hosted browser automation and E2E testing platform.

Your job: read this guide fully before writing a single step. The guide tells you how to write flows that catch **real bugs** — not flows that fail because you guessed wrong selectors.

---

## What is maiflow.my?

maiflow.my runs browser flows using Playwright. Each **flow** is a named sequence of steps that automates a web browser — navigating pages, clicking buttons, filling forms, asserting results, and more.

Flows are grouped into **projects**. A project has a `base_url` (e.g. `https://myapp.com`) and optional `env_vars` (key/value pairs like credentials).

---

## SECTION 1 — Core Philosophy: Two Types of Test Failure

Every flow failure falls into one of two categories:

| Type | Meaning | What to do |
|------|---------|------------|
| **Real system bug** | The app is broken — a page didn't load, a field is missing, a redirect failed | This is what we WANT flows to detect |
| **Flow declaration error** | The selector is wrong, the text was guessed, the field name is incorrect | This is what we MUST ELIMINATE |

**Goal: every flow failure must mean "the system has a real bug", never "the flow was written wrong".**

A flow that fails because you used `[name='description']` instead of `textarea[name='description']` tells us nothing about the app. It only wastes debug time. These declaration errors are invisible — they look like system bugs until someone digs in.

**The standard**: if a flow passes, the feature works. If a flow fails, the feature is broken. No ambiguity.

---

## SECTION 2 — How to Research Your Project Before Writing Flows

Before writing any flow, the AI agent must verify selectors against actual source code.

### Step-by-step research protocol

1. **Find the page component** — locate the React (or other framework) component that renders the page you are testing
2. **Read actual `name` attributes** — find every `<input name="...">`, `<textarea name="...">`, `<select name="...">` in the JSX/HTML. Do NOT guess field names.
3. **Copy button text character-for-character** — find the exact string inside `<button>` or `<a>` tags. Casing, punctuation, and spacing matter.
4. **Read page headings from source** — find `<h1>`, `<h2>`, `<h3>` text. Do NOT invent headings.
5. **Note the element type for `name` attributes** — is it `input`, `textarea`, or `select`? This matters for scoped selectors.
6. **Check the router file for real URL patterns** — do not guess URL patterns. Find the route definitions.

### The cardinal rule

> **If you haven't read the source, don't assert it.**

Guessing a selector and hoping it matches is how declaration errors are born. The 30 seconds it takes to verify a field name saves hours of false-failure debugging.

---

## SECTION 3 — Assertion Quality Rules

### Reliability ranking (use the highest-ranked option available)

| Rank | Assertion | When to use |
|------|-----------|-------------|
| 1 | `assert_url` | Always — use to confirm page identity after navigation |
| 2 | `assert_element [name='fieldName']` | Confirms a form component rendered. Waits up to 10s internally. |
| 3 | `assert_element button:has-text('exact text')` | Confirms an interactive element rendered. |
| 4 | `assert_text h1 "heading text"` | Scoped to a specific element — reliable when heading is verified from source |
| 5 | `assert_text body "text"` | LAST RESORT ONLY. Matches anywhere in the page. Fragile. |

### Rules

- `assert_url` is the most reliable check for "did I land on the right page". Use it after every navigation + login sequence.
- `assert_element [name='x']` also serves as a timing gate — it waits up to 10s for the element to appear. This is better than a fixed `wait` for form pages.
- `assert_text body "X"` is only acceptable when asserting a **unique error message or toast notification** that would not appear on the page under normal conditions (e.g. "Invalid credentials", "Promotion saved").
- Never use `assert_text body "X"` to confirm a page has loaded. The body always exists. Use `assert_url` or `assert_element` instead.

---

## SECTION 4 — SPA-Specific Timing Rules

React/Vue/Angular apps load data asynchronously. The DOM exists before data arrives.

### Wait time rules

| Situation | Wait |
|-----------|------|
| After `navigate` to a page with a form (create/edit) | `wait ms 3000` |
| After `navigate` to a list, dashboard, or view page | `wait ms 2000` |
| After `navigate` to a static page (login, terms, public profile) | `wait ms 2000` |
| After clicking a tab or opening a modal | `wait ms 1000` |
| After clicking a submit button (API call expected) | `wait ms 1500` |

### Shortcut: use `assert_element` instead of long waits

`assert_element` already waits up to 10s internally. For form pages:

```json
{ "action": "navigate", "url": "/dashboard/packages/create" },
{ "action": "assert_element", "selector": "[name='name']" }
```

This is better than `wait ms 3000` because it proceeds as soon as the element appears, not after a fixed delay. Use both together when you need extra safety:

```json
{ "action": "navigate", "url": "/dashboard/packages/create" },
{ "action": "wait", "ms": 2000 },
{ "action": "assert_element", "selector": "[name='name']" }
```

### Never do this

```json
{ "action": "navigate", "url": "/dashboard" },
{ "action": "assert_text", "selector": "body", "contains": "Dashboard" }
```

The body exists immediately. This tells you nothing about whether the dashboard data loaded.

---

## SECTION 5 — Common Selector Pitfalls

These gotchas have caused real false failures. Know them before writing a single selector.

### 1. `[name='description']` matches `<meta name="description">`

Every page has `<meta name="description" content="...">` in `<head>`. The selector `[name='description']` will match it, not your textarea.

**Always scope it:**
```json
{ "action": "assert_element", "selector": "textarea[name='description']" }
```

### 2. Mobile vs desktop duplicate elements

Many responsive apps render two versions of the same button — one for mobile (hidden via CSS) and one for desktop. At 1280px viewport (Playwright default), the mobile version may be present in DOM but hidden. `assert_element` does NOT check visibility — it will pass on the hidden element.

**Add a class qualifier or check `:visible`** if duplicate elements are known to exist:
```json
{ "action": "assert_element", "selector": "a.desktop-book-btn[href*='/book/']" }
```

See the maigambar.my-specific note on the Book button in Section 7.

### 3. File inputs are hidden

`input[type='file']` elements are invisible. `assert_element` works (confirms the input exists in DOM). But `click` on a file input will NOT open a file dialog in Playwright headless mode.

**Always use `upload_file` action for file uploads — never `click` on a file input.**

### 4. Dynamic text

Never assert timestamps, auto-generated IDs, booking reference codes, or random tokens in `assert_text`. They change on every run.

```json
// BAD — will fail on second run
{ "action": "assert_text", "selector": "body", "contains": "BK-20260313-001" }

// GOOD — asserts the structure, not the value
{ "action": "assert_element", "selector": ".booking-reference" }
```

### 5. Plan-conditional UI

Many SaaS apps show different UI depending on the user's plan. Snapper plan may show a locked state where Shooter shows a form. Verify which account you are using matches what you are asserting.

---

## SECTION 6 — Idempotency Rules

Flows must be safe to run multiple times without breaking the system or each other.

### Rules

- **Never create a resource with a unique constraint inline** (email address, unique promo code, unique slug). Use pre-seeded test accounts.
- **For create flows**: assert the form renders correctly and has the right fields. Do not submit the form if it would create a real database record on the second run.
- **Exception — overwrite/update forms**: forms that update an existing profile (settings, edit package) are idempotent. Submit is fine.
- **For subscription/payment flows**: open the dialog, assert dialog content, then click Cancel. Do not confirm payment.
- **Exception — Stripe checkout**: clicking "Subscribe Now" creates a Stripe checkout SESSION (not a subscription). The session expires without completing payment. Re-running is safe.
- **For deletion flows**: do not actually delete records. Assert the delete button exists, then cancel.

### Safe pattern for create flows

```json
{ "action": "navigate", "url": "/dashboard/packages/create" },
{ "action": "wait", "ms": 2000 },
{ "action": "assert_element", "selector": "[name='name']" },
{ "action": "assert_element", "selector": "[name='price']" },
{ "action": "assert_element", "selector": "textarea[name='description']" },
{ "action": "assert_element", "selector": "button:has-text('Save Package')" }
```

This confirms the form component rendered with all fields — without creating any records.

---

## SECTION 7 — Account Reference Table (maigambar.my)

### Test Accounts

| Email | Password | Plan | Slug | Notes |
|-------|----------|------|------|-------|
| demo@maigambar.my | demo1234 | Shooter (active, paid) | rahim-studio | Full features: online payment, promos, travel fee |
| snapper@maigambar.my | demo1234 | Snapper (active, paid) | snap-studio | Limited: 5 packages max, no online payment |
| studioon@maigambar.my | demo1234 | Studio On (active, paid) | lumina-studio | All features including branding + staff |
| trial@maigambar.my | demo1234 | Shooter (14-day trial) | amir-photography | Trial: shows "Choose Your Plan" + "Subscribe Now", no real Stripe sub |
| friend@maigambar.my | demo1234 | Shooter (complimentary) | pixel-friends | Free permanent access, no billing |
| staff@luminastudio.my | demo1234 | Staff role | /staff portal | Can only access /staff, blocked from /dashboard |
| rejected@maigambar.my | demo1234 | None (rejected) | quicksnap-studio | Dashboard blocked |
| hikayatdevsolutions@gmail.com | Hikayatdev@2025 | Super Admin | /admin | Full admin access |

### Page to Field Name Map (VERIFIED from source code)

| Page | URL | Key Input Names | Unique Selector | Page Heading |
|------|-----|-----------------|-----------------|--------------|
| PackageFormPage (create) | /dashboard/packages/create | `name`, `price`, `duration_hours`, `category`, `textarea[name='description']`, `deposit_amount` | `[name='name']` | "Create New Package" |
| PackageFormPage (edit) | /dashboard/packages/:id/edit | same as create | `[name='name']` | "Edit Package" |
| PortfolioFormPage (create) | /dashboard/portfolio/create | `title`, `category`, `textarea[name='description']`, `video_url` | `[name='title']` | "Add New Project" |
| PortfolioFormPage (edit) | /dashboard/portfolio/:id/edit | same as create | `[name='title']` | "Edit Project" |
| SettingsPage | /dashboard/settings | `name`, `business_name`, `textarea[name='description']`, `email`, `phone` | `[name='business_name']` | "Settings" |
| PromotionsPage (modal) | /dashboard/promotions | `name`, `code`, `value`, `max_uses`, `textarea[name='description']` | `[name='code']` | "Promotions" |
| AvailabilityPage | /dashboard/availability | `date`, `reason` (blocked dates tab) | none unique | "Availability" |
| SubscriptionPage (trial) | /dashboard/subscription | buttons only | `button:has-text('Subscribe Now')` | "Subscription & Billing" + "Choose Your Plan" |
| SubscriptionPage (paid) | /dashboard/subscription | buttons only | `button:has-text('Switch to this plan')` | "Subscription & Billing" + "Change Plan" |
| SubscriptionPage (complimentary) | /dashboard/subscription | none (no action buttons) | none | shows "Complimentary" badge |
| BookingPage (public) | /p/:slug/book/:packageId | `client_name`, `client_email`, `client_phone`, `location`, `notes` | heading: "Select Date & Time" (Step 1) | Step 1: "Select Date & Time" · Step 2: "Your Details" |

### CRITICAL Gotchas for maigambar.my

- **`[name='description']` in portfolio and packages** → always use `textarea[name='description']` or you will match `<meta name="description">`
- **`[name='name']` in packages** → safe, no meta conflict
- **`[name='title']` in portfolio** → safe. Note: PortfolioFormPage uses `title` NOT `name`
- **Book button on photographer profile** → use `a.flex[href*='/book/']` NOT `a:has-text('Book')`. At 1280px desktop viewport, the mobile button is present in DOM but hidden. `assert_element` will pass on the hidden one. The desktop anchor has class `flex`.
- **Booking page Step 1 heading** is `"Select Date & Time"` NOT `"Choose Date"` — verify before asserting
- **Trial subscription** shows `"Choose Your Plan"` + `"Subscribe Now"` (not "Change Plan")
- **Paid subscription** shows `"Change Plan"` + `"Switch to this plan"` (not "Subscribe Now")
- **Cancel subscription confirm text**: `"Cancel anyway?"` — appears inline, not in a modal
- **Plan change dialog text**: `"Switch from [plan] to [plan]? Billing will be prorated."` + button: `"Confirm Switch"`
- **Staff login** redirects to `/staff` not `/dashboard` — `assert_url contains "/staff"` not `/dashboard`
- **Snapper plan promotions page** shows `"Promotions Locked"` not a form — do not assert `[name='code']` for snapper

### Button Reference (Exact Text)

| Page | Button text |
|------|-------------|
| Package form | "Save Package" |
| Portfolio form | "Save Project" |
| Settings profile | "Save Changes" |
| Availability business hours | "Save Schedule" |
| Availability blocked dates | "Block Date" |
| Promotions (open modal) | "New Promotion" |
| Promotions (submit modal) | "Create Promotion" |
| Promotions (close modal) | "Cancel" |
| Subscription (trial) | "Subscribe Now" |
| Subscription (paid, other plan) | "Switch to this plan" |
| Subscription cancel confirm | "Yes, cancel" · "Keep subscription" |
| Subscription plan switch confirm | "Confirm Switch" · "Cancel" |

---

## SECTION 8 — Validation Checklist Before Outputting Flows

Run through this before finalizing any flow JSON output:

- [ ] Every `assert_text body "..."` has been replaced with a scoped selector, OR justified as the only way to assert a unique error/toast message
- [ ] Every `assert_element [name='x']` field name was verified against actual source code, not guessed
- [ ] Every `button:has-text('...')` text was verified from source code, not guessed
- [ ] Every `assert_text h1 "..."` heading was verified from source code, not guessed
- [ ] File upload flows use `upload_file` action, not `click` on the file input
- [ ] All forms with a `description` field use `textarea[name='description']` not `[name='description']`
- [ ] Each flow starts with a full login sequence (no assumed session state from previous flows)
- [ ] Wait times: 3000ms for create/edit form pages, 2000ms for list/view/static pages, 1000ms for tab clicks
- [ ] All Stripe/payment tests are idempotent (no completed payments — use Cancel)
- [ ] No dynamic values asserted (no timestamps, IDs, auto-generated codes)
- [ ] Account used in each flow matches the feature being tested (right plan tier)
- [ ] Valid JSON (no `//` comments, no trailing commas)
- [ ] Every flow has `name` (string) and `steps` (array)

---

## Output Format

The output must be a **JSON array** of flow objects:

```json
[
  {
    "name": "Descriptive flow name",
    "steps": [
      { "action": "navigate", "url": "/path" },
      { "action": "fill", "selector": "#email", "value": "test@example.com" },
      { "action": "click", "selector": "[type='submit']" },
      { "action": "assert_url", "contains": "/dashboard" }
    ]
  }
]
```

- `name` — short descriptive string (what this test verifies)
- `steps` — ordered array of step objects
- Each step has an `action` field plus action-specific fields (see All Step Actions)

---

## All Step Actions

### navigate
Navigate to a URL. Relative paths are prefixed with the project's `base_url`.
```json
{ "action": "navigate", "url": "/login" }
{ "action": "navigate", "url": "https://external.com/page" }
```

### click
Click a DOM element. Waits up to 10s for selector to appear.
```json
{ "action": "click", "selector": "[type='submit']" }
{ "action": "click", "selector": "button:has-text('Save Package')" }
{ "action": "click", "selector": "#logout-btn" }
```

### fill
Clear and type text into an input. Waits for selector to appear.
```json
{ "action": "fill", "selector": "#email", "value": "user@example.com" }
{ "action": "fill", "selector": "input[name='password']", "value": "{{PASSWORD}}" }
```
Use `{{VAR_NAME}}` to reference env_vars or extracted runtime variables.

### select
Select an option in a `<select>` element. Value matches the option's `value` attribute.
```json
{ "action": "select", "selector": "#country", "value": "MY" }
{ "action": "select", "selector": "select[name='plan']", "value": "shooter" }
```

### wait
Pause for a fixed number of milliseconds.
```json
{ "action": "wait", "ms": 1000 }
{ "action": "wait", "ms": 2000 }
```

### assert_url
Assert the current URL contains a substring.
```json
{ "action": "assert_url", "contains": "/dashboard" }
{ "action": "assert_url", "contains": "success" }
```

### assert_element
Assert a DOM element exists (is present in the page). Does NOT check visibility. Waits up to 10s internally.
```json
{ "action": "assert_element", "selector": ".error-message" }
{ "action": "assert_element", "selector": "[name='name']" }
{ "action": "assert_element", "selector": "textarea[name='description']" }
```

### assert_text
Assert text content of an element contains a substring. Case-sensitive.
```json
{ "action": "assert_text", "selector": ".error", "contains": "Invalid credentials" }
{ "action": "assert_text", "selector": "h1", "contains": "Create New Package" }
```
**Avoid `selector: "body"` — see Section 3 for rules.**

### screenshot
Capture a screenshot at this point in the flow. Useful for visual debugging.
```json
{ "action": "screenshot", "name": "after-login" }
{ "action": "screenshot", "name": "form-filled" }
```

### upload_file
Download a file from a URL and set it on a file input element. Always use this for file uploads — never `click` on a file input.
```json
{ "action": "upload_file", "selector": "input[type='file']", "url": "https://example.com/test-image.jpg" }
{ "action": "upload_file", "selector": "#avatar-input", "url": "{{AVATAR_URL}}", "filename": "avatar.jpg" }
```
- `url` — publicly accessible file URL (can use `{{VAR_NAME}}`)
- `filename` — optional, controls the temp filename used

### extract
Read a value from the DOM and store it as a runtime variable. Use `{{varName}}` in later steps.
```json
{ "action": "extract", "selector": "#booking-id", "varName": "bookingId" }
{ "action": "extract", "selector": "#link", "varName": "shareUrl", "attribute": "href" }
```
- `selector` — element to read
- `varName` — variable name (no `{{}}` here — just the name)
- `attribute` — optional, reads an HTML attribute instead of text content

Then use it later:
```json
{ "action": "navigate", "url": "/bookings/{{bookingId}}" }
```

---

## CSS Selectors — Tips

maiflow.my uses standard Playwright selectors.

| Pattern | Example |
|---------|---------|
| ID | `#login-btn` |
| Class | `.error-message` |
| Attribute | `[name='email']`, `[type='submit']` |
| Scoped attribute | `input[name='email']`, `textarea[name='description']` |
| Has-text (Playwright) | `button:has-text('Save Changes')` |
| Nested | `.modal .btn-primary` |
| nth | `.list-item:nth-child(2)` |
| href contains | `a[href*='/book/']` |

**Prefer `#id` and `[name='x']` over classes** — they're more stable. For buttons with no ID, use `button:has-text('exact text')`. Always scope `name` attributes to their element type when `<meta>` conflict is possible.

---

## Environment Variables (env_vars)

Reference env_vars with `{{VAR_NAME}}`:

```json
{ "action": "fill", "selector": "#email", "value": "{{ADMIN_EMAIL}}" }
{ "action": "fill", "selector": "#password", "value": "{{ADMIN_PASSWORD}}" }
```

Common env_vars:
- `BASE_URL` — auto-applied when navigating relative paths
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — test user credentials
- Any custom variable defined in the project settings

---

## Complete Example — maigambar.my

These three flows demonstrate all best practices: verified selectors, correct wait times, scoped assertions, idempotency, and starting fresh on every flow.

```json
[
  {
    "name": "Auth — Login Success (Shooter)",
    "steps": [
      { "action": "navigate", "url": "/login" },
      { "action": "fill", "selector": "#email", "value": "demo@maigambar.my" },
      { "action": "fill", "selector": "#password", "value": "demo1234" },
      { "action": "click", "selector": "[type='submit']" },
      { "action": "wait", "ms": 2000 },
      { "action": "assert_url", "contains": "/dashboard" },
      { "action": "screenshot", "name": "after-login-shooter" }
    ]
  },
  {
    "name": "Packages — Create Form Renders Correctly",
    "steps": [
      { "action": "navigate", "url": "/login" },
      { "action": "fill", "selector": "#email", "value": "demo@maigambar.my" },
      { "action": "fill", "selector": "#password", "value": "demo1234" },
      { "action": "click", "selector": "[type='submit']" },
      { "action": "wait", "ms": 2000 },
      { "action": "assert_url", "contains": "/dashboard" },
      { "action": "navigate", "url": "/dashboard/packages/create" },
      { "action": "wait", "ms": 2000 },
      { "action": "assert_element", "selector": "[name='name']" },
      { "action": "assert_element", "selector": "[name='price']" },
      { "action": "assert_element", "selector": "[name='duration_hours']" },
      { "action": "assert_element", "selector": "textarea[name='description']" },
      { "action": "assert_element", "selector": "[name='deposit_amount']" },
      { "action": "assert_element", "selector": "button:has-text('Save Package')" },
      { "action": "assert_text", "selector": "h1", "contains": "Create New Package" },
      { "action": "screenshot", "name": "package-create-form" }
    ]
  },
  {
    "name": "Public Booking — Step 1 Renders (Shooter profile)",
    "steps": [
      { "action": "navigate", "url": "/p/rahim-studio" },
      { "action": "wait", "ms": 2000 },
      { "action": "assert_url", "contains": "/p/rahim-studio" },
      { "action": "assert_element", "selector": "a.flex[href*='/book/']" },
      { "action": "click", "selector": "a.flex[href*='/book/']" },
      { "action": "wait", "ms": 3000 },
      { "action": "assert_url", "contains": "/book/" },
      { "action": "assert_text", "selector": "h2", "contains": "Select Date & Time" },
      { "action": "screenshot", "name": "booking-step-1" }
    ]
  }
]
```

### Why these flows are correct

**Auth flow:**
- Asserts `assert_url contains "/dashboard"` — not `assert_text body "Dashboard"`. URL is the authoritative signal.

**Package create flow:**
- Uses `textarea[name='description']` — scoped to avoid `<meta name="description">` false match.
- Asserts all form fields exist without submitting — idempotent on repeated runs.
- `assert_text h1` scoped to heading — not body.

**Public booking flow:**
- Uses `a.flex[href*='/book/']` for the Book button — avoids the hidden mobile anchor.
- Waits 3000ms after navigating to the booking form — data-driven page with async load.
- `assert_text h2` verifies "Select Date & Time" — the verified exact heading text, not a guess like "Choose Date".

---

## Instructions for AI Agent

1. Read this guide fully before writing any step
2. Read the actual source code of every page you are writing flows for — verify all selectors before using them
3. When in doubt about a selector, read the source. Never guess.
4. Generate flows grouped by feature area
5. Include both happy path and error/edge cases where appropriate
6. Use the Account Reference Table (Section 7) to select the right test account per flow
7. Run the Validation Checklist (Section 8) before outputting
8. Output a single valid JSON array — no comments, no trailing commas
9. Tell the user: "Import this file into your maiflow.my project using the Import JSON button"
