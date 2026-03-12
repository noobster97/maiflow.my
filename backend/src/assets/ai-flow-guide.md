# maiflow.my — AI Flow Generation Guide

You are helping a user generate a **test flow JSON file** for maiflow.my, a self-hosted browser automation and E2E testing platform.

Your job: read this guide, understand the system, then generate a valid JSON array of flow objects that the user can import into their maiflow.my project.

---

## What is maiflow.my?

maiflow.my runs browser flows using Playwright. Each **flow** is a named sequence of steps that automates a web browser — navigating pages, clicking buttons, filling forms, asserting results, and more.

Flows are grouped into **projects**. A project has a `base_url` (e.g. `https://myapp.com`) and optional `env_vars` (key/value pairs like credentials).

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
- Each step has an `action` field plus action-specific fields (see below)

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
{ "action": "click", "selector": "button:has-text('Save')" }
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
Pause for a fixed number of milliseconds. Use after navigations to data-driven pages or async content.
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
Assert a DOM element exists (is present in the page). Does NOT check visibility.
```json
{ "action": "assert_element", "selector": ".error-message" }
{ "action": "assert_element", "selector": "#main-nav" }
```

### assert_text
Assert text content of an element contains a substring. Case-sensitive.
```json
{ "action": "assert_text", "selector": "body", "contains": "Welcome" }
{ "action": "assert_text", "selector": ".error", "contains": "Invalid credentials" }
{ "action": "assert_text", "selector": "h1", "contains": "Dashboard" }
```
**Important**: The assertion is `includes()` — so partial match works. Be specific enough to avoid false positives.

### screenshot
Capture a screenshot at this point in the flow. Useful for visual debugging.
```json
{ "action": "screenshot", "name": "after-login" }
{ "action": "screenshot", "name": "form-filled" }
```

### upload_file
Download a file from a URL and set it on a file input element.
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
{ "action": "extract", "selector": ".token-display", "varName": "authToken" }
{ "action": "extract", "selector": "#link", "varName": "shareUrl", "attribute": "href" }
```
- `selector` — element to read
- `varName` — variable name (no `{{}}` here — just the name)
- `attribute` — optional, reads an HTML attribute instead of text content

Then use it later:
```json
{ "action": "navigate", "url": "/bookings/{{bookingId}}" }
{ "action": "assert_text", "selector": "body", "contains": "{{bookingId}}" }
```

---

## CSS Selectors — Tips

maiflow.my uses standard Playwright selectors. All standard CSS selectors work, plus:

| Pattern | Example |
|---------|---------|
| ID | `#login-btn` |
| Class | `.error-message` |
| Attribute | `[name='email']`, `[type='submit']` |
| Has-text (Playwright) | `button:has-text('Save Changes')` |
| Nested | `.modal .btn-primary` |
| nth | `.list-item:nth-child(2)` |

**Tip**: Prefer `#id` and `[name='x']` over classes — they're more stable. For buttons with no ID, use `button:has-text('exact text')`.

---

## Environment Variables (env_vars)

The project can have env_vars (set in Project Settings). Reference them with `{{VAR_NAME}}`:

```json
{ "action": "fill", "selector": "#email", "value": "{{ADMIN_EMAIL}}" }
{ "action": "fill", "selector": "#password", "value": "{{ADMIN_PASSWORD}}" }
```

Common env_vars to expect:
- `BASE_URL` — auto-applied when navigating relative paths
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — test user credentials
- Any custom variable the user defines in their project

---

## Patterns & Best Practices

### Login helper (reuse across flows)
Always start with a login sequence when testing authenticated pages. Don't assume session persists between flows — each flow starts a fresh browser.

### Wait after async operations
After clicking buttons that trigger API calls or navigating to data-heavy pages, add a `wait`:
```json
{ "action": "click", "selector": "[type='submit']" },
{ "action": "wait", "ms": 1500 }
```

### Idempotent flows
Flows should be safe to run multiple times. Avoid creating unique resources (unique emails, etc.) that will fail on second run. Prefer:
- Using fixed test accounts that already exist
- Testing read operations that don't change state
- For create flows, assert the create page loaded + form exists, not that the record was created

### Test negative cases too
For every feature, write both happy path and error path:
- Login Success → assert redirect to /dashboard
- Login Wrong Password → assert error text on page
- Form Validation → submit empty form → assert required field errors

### Group by feature
Name flows clearly:
- `Auth — Login Success`
- `Auth — Login Wrong Password`
- `Packages — Create Package`
- `Packages — Snapper Cannot Access`

### SPAs need wait time
For React/Vue/Next apps, after navigation add `{ "action": "wait", "ms": 1000 }` before asserting dynamic content. The page may still be loading data from APIs.

---

## Complete Example — Generic SaaS App

```json
[
  {
    "name": "Auth — Login Success",
    "steps": [
      { "action": "navigate", "url": "/login" },
      { "action": "fill", "selector": "#email", "value": "{{ADMIN_EMAIL}}" },
      { "action": "fill", "selector": "#password", "value": "{{ADMIN_PASSWORD}}" },
      { "action": "click", "selector": "[type='submit']" },
      { "action": "screenshot", "name": "after-submit" },
      { "action": "assert_url", "contains": "/dashboard" }
    ]
  },
  {
    "name": "Auth — Login Wrong Password",
    "steps": [
      { "action": "navigate", "url": "/login" },
      { "action": "fill", "selector": "#email", "value": "{{ADMIN_EMAIL}}" },
      { "action": "fill", "selector": "#password", "value": "wrong_password_xyz" },
      { "action": "click", "selector": "[type='submit']" },
      { "action": "wait", "ms": 1000 },
      { "action": "assert_text", "selector": "body", "contains": "Invalid" }
    ]
  },
  {
    "name": "Dashboard — Loads for Logged In User",
    "steps": [
      { "action": "navigate", "url": "/login" },
      { "action": "fill", "selector": "#email", "value": "{{ADMIN_EMAIL}}" },
      { "action": "fill", "selector": "#password", "value": "{{ADMIN_PASSWORD}}" },
      { "action": "click", "selector": "[type='submit']" },
      { "action": "navigate", "url": "/dashboard" },
      { "action": "wait", "ms": 1500 },
      { "action": "assert_text", "selector": "h1", "contains": "Dashboard" }
    ]
  },
  {
    "name": "Profile — Save Settings",
    "steps": [
      { "action": "navigate", "url": "/login" },
      { "action": "fill", "selector": "#email", "value": "{{ADMIN_EMAIL}}" },
      { "action": "fill", "selector": "#password", "value": "{{ADMIN_PASSWORD}}" },
      { "action": "click", "selector": "[type='submit']" },
      { "action": "navigate", "url": "/settings/profile" },
      { "action": "wait", "ms": 1500 },
      { "action": "fill", "selector": "input[name='name']", "value": "Test User" },
      { "action": "click", "selector": "button:has-text('Save')" },
      { "action": "wait", "ms": 1000 },
      { "action": "assert_text", "selector": "body", "contains": "saved" }
    ]
  },
  {
    "name": "Upload — Profile Photo",
    "steps": [
      { "action": "navigate", "url": "/login" },
      { "action": "fill", "selector": "#email", "value": "{{ADMIN_EMAIL}}" },
      { "action": "fill", "selector": "#password", "value": "{{ADMIN_PASSWORD}}" },
      { "action": "click", "selector": "[type='submit']" },
      { "action": "navigate", "url": "/settings/profile" },
      { "action": "wait", "ms": 1500 },
      { "action": "upload_file", "selector": "input[type='file']", "url": "{{TEST_IMAGE_URL}}", "filename": "test-photo.jpg" },
      { "action": "wait", "ms": 1500 },
      { "action": "screenshot", "name": "after-upload" }
    ]
  },
  {
    "name": "Extract — Read Generated ID",
    "steps": [
      { "action": "navigate", "url": "/login" },
      { "action": "fill", "selector": "#email", "value": "{{ADMIN_EMAIL}}" },
      { "action": "fill", "selector": "#password", "value": "{{ADMIN_PASSWORD}}" },
      { "action": "click", "selector": "[type='submit']" },
      { "action": "navigate", "url": "/items" },
      { "action": "wait", "ms": 1500 },
      { "action": "extract", "selector": ".item-id:first-child", "varName": "firstItemId" },
      { "action": "navigate", "url": "/items/{{firstItemId}}" },
      { "action": "wait", "ms": 1000 },
      { "action": "assert_text", "selector": "body", "contains": "{{firstItemId}}" }
    ]
  }
]
```

---

## Instructions for AI Agent

1. Ask the user: "What is your app's base URL and what flows do you want to test?"
2. Ask for test credentials (or confirm env_var names to use)
3. Ask for the key pages/features to cover
4. Generate flows grouped by feature area
5. Include both happy path and error/edge cases
6. Output a single valid JSON array — no comments, no trailing commas
7. Tell the user: "Import this file into your maiflow.my project using the Import JSON button"

**Validation checklist before outputting:**
- [ ] Valid JSON (no `//` comments, no trailing commas)
- [ ] Every flow has `name` (string) and `steps` (array)
- [ ] Every step has a valid `action` from the list above
- [ ] Required fields present for each action type
- [ ] Relative URLs start with `/`
- [ ] `assert_text` `contains` is case-sensitive — match exactly what the app shows
- [ ] `button:has-text('...')` uses the exact visible button text
