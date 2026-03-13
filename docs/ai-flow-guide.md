# AI Guide: Planning Complete E2E Test Flows for Web Apps

Use this guide when building test flows in maiflow.my for any web application. It covers how to think about flow coverage, dependency chains, selector strategies, authentication patterns, and common pitfalls.

---

## 1. Think in User Journeys, Not Features

Don't test one button at a time. Think about who uses the system and what complete journeys they take.

**Identify your actors first:**
- Super Admin (platform owner)
- Business Owner / Tenant (SaaS subscriber, or primary account holder)
- Staff / Sub-account (limited access role)
- Customer / End User (often unauthenticated or separate auth)
- Guest (unauthenticated, view-only)

Each actor has distinct journeys. Cover all of them.

---

## 2. Dependency Chain Mapping

Some flows are only meaningful after another flow has run. Map this before you write a single step.

**Example chain for a SaaS platform with bookings:**

```
[Register Account]
    → [Verify Email]
        → [Complete Profile / Upload Docs]
            → [Admin Approves Account]
                → [Subscribe to Plan]
                    → [Set Up Product / Service]
                        → [Customer Views Listing]
                            → [Customer Submits Order / Booking]
                                → [Business Owner Accepts]
                                    → [Customer Sees Confirmed Status]
```

**Example chain for an e-commerce store:**

```
[Admin Creates Product]
    → [Customer Browses Catalog]
        → [Customer Adds to Cart]
            → [Customer Checks Out]
                → [Admin Sees New Order]
                    → [Admin Marks as Shipped]
                        → [Customer Gets Confirmation]
```

**Rules:**
- Flows that depend on earlier state should be run in order
- Flows that are stateless (just check a page loads) can run anytime
- Never assert data created by a previous flow unless you seed that data or control the sequence
- Document the dependency chain before writing step 1

---

## 3. Flow Categories

### A. Smoke Tests (stateless, fast)
Just checks pages load and key elements exist. No state mutation.

```json
{ "action": "navigate", "url": "/dashboard" },
{ "action": "assert_url", "contains": "/dashboard" },
{ "action": "assert_element", "selector": "h1" }
```

### B. CRUD Tests
Create something → assert it appears. Edit → assert change saved. Delete → assert gone.

Always use unique test data (e.g., timestamps in names, unique emails) to avoid conflicts between runs.

### C. Auth & Permission Tests
- Unauthenticated → redirected to login
- Wrong role → 403 or redirect
- Correct role → full access
- Plan/tier restrictions → locked UI shown

### D. End-to-End Journey Tests
Full user journey from start to finish. These are the highest-value tests but most fragile. Keep them focused — one complete journey per flow.

### E. Negative / Edge Case Tests
- Submit empty form → validation errors appear
- Invalid input format → field-level error shown
- Plan limit enforced → upgrade prompt shown
- Expired session → redirect to login

---

## 4. Authentication Pattern

Always login at the start of a flow that requires auth. Don't rely on shared session state between flows — each flow should be self-contained.

```json
{ "action": "navigate", "url": "/login" },
{ "action": "fill", "selector": "[name='email']", "value": "user@example.com" },
{ "action": "fill", "selector": "[name='password']", "value": "password123" },
{ "action": "click", "selector": "[type='submit']" },
{ "action": "wait", "ms": 2000 },
{ "action": "assert_url", "contains": "/dashboard" }
```

Keep test credentials in a separate config or seed file. Never hardcode production credentials in flow steps.

---

## 5. Selector Strategy (Playwright)

### Priority order (most stable → least stable):

1. `[name='fieldname']` — form fields registered with a form library
2. `input[placeholder='...']` — stable for clearly labelled inputs
3. `button:has-text('...')` — buttons by visible label text
4. `[data-testid='...']` — ideal if added by devs; request devs add these to key elements
5. `[aria-label='...']` — good for icon-only buttons
6. `.class-name` — risky, changes with styling refactors
7. `nth-child` or positional selectors — avoid unless truly no alternative

### Common patterns:

```json
// Click the first enabled button in a grid
{ "action": "click", "selector": "button:not([disabled])" }

// Click a button inside a labelled section
{ "action": "click", "selector": "div:has(h3:has-text('Section Title')) button" }

// Submit form by type
{ "action": "click", "selector": "button[type='submit']" }

// Click action in a specific table row
{ "action": "click", "selector": "tr:has-text('identifier text') button:has-text('Edit')" }

// Assert an element exists without interacting
{ "action": "assert_element", "selector": "button:has-text('Save')" }

// Assert page contains specific text
{ "action": "assert_text", "selector": "body", "contains": "Success" }
```

### Avoid:
- Selectors that depend on dynamic IDs: `#field-3829`
- Deep positional chains: `div > div:nth-child(3) > span:first-child`
- Selectors that only work at a specific viewport width

---

## 6. Wait Strategy

Always add waits after:
- Page navigation / URL changes
- API-dependent content (tables, stats, user data)
- File uploads
- External service redirects (payment gateways, OAuth)
- Async operations triggered by a button click

```json
{ "action": "wait", "ms": 1000 }   // quick UI update
{ "action": "wait", "ms": 2000 }   // standard page/API load
{ "action": "wait", "ms": 3000 }   // after clicking something that triggers API call
{ "action": "wait", "ms": 5000 }   // after redirect involving external service
{ "action": "wait", "ms": 10000 }  // after webhook-dependent activation (e.g. payment)
```

For redirects that depend on external events (webhooks, email, async jobs):
```json
{ "action": "wait_for_url", "contains": "/success-page", "timeout": 300000 }
```

---

## 7. Screenshot Naming Convention

Take screenshots at key state transitions. Name them to tell the story — they become your test audit trail.

```json
{ "action": "screenshot", "name": "initial-page-state" },
{ "action": "screenshot", "name": "after-form-filled" },
{ "action": "screenshot", "name": "post-submit-result" },
{ "action": "screenshot", "name": "final-confirmed-state" }
```

Format: `{context}-{state}` — lowercase, hyphens, no spaces.

Place screenshots immediately before or after the key action you want visual proof of.

---

## 8. Payment Testing Patterns

### Online Payment (redirect to external gateway)

```json
// User clicks pay/subscribe button
{ "action": "click", "selector": "button:has-text('Subscribe Now')" },
{ "action": "wait", "ms": 5000 },
// Confirm redirect to payment gateway
{ "action": "assert_url", "contains": "stripe.com" },
// MANUAL STEP: human fills card details on the gateway page
// Then wait for redirect back to your app
{ "action": "wait_for_url", "contains": "/payment-success", "timeout": 300000 },
// Payment confirmation may be webhook-driven — add buffer
{ "action": "wait", "ms": 10000 },
{ "action": "assert_text", "selector": "body", "contains": "Active" }
```

**Key insight**: Many payment systems fire a webhook to your server AFTER redirecting the user back. This means the app's database may not be updated yet when the success page loads. Always add a 10s+ buffer after the redirect, or implement a polling mechanism in your app.

### Manual / Offline Payment

```json
// User submits order/booking
{ "action": "click", "selector": "button[type='submit']:has-text('Confirm')" },
{ "action": "wait_for_url", "contains": "/order-status", "timeout": 15000 },
// Status should show "pending" or "awaiting confirmation"
{ "action": "assert_text", "selector": "body", "contains": "Awaiting" },
// Then: business owner accepts from their admin panel (separate flow)
```

---

## 9. Multi-Actor Flow Sequencing

When a journey requires actions from two different user roles, split into separate flows:

```
Flow A: Customer submits order (as customer)
Flow B: Admin/Business Owner accepts order (as admin)
Flow C: Customer sees confirmed status (as customer again)
```

Each flow logs in as the correct user. This keeps flows:
- Independently runnable for debugging
- Clearly readable (who is doing what)
- Easy to rerun individual steps

---

## 10. Plan / Tier Gated Features

When testing subscription or feature tier restrictions:

**For locked/gated features (user doesn't have access):**
```json
{ "action": "assert_element", "selector": "span:has-text('Pro Plan')" },
{ "action": "assert_text", "selector": "body", "contains": "Upgrade" }
```

**For unlocked features (user has access):**
```json
{ "action": "assert_element", "selector": "button:has-text('Create')" },
{ "action": "assert_text", "selector": "body", "contains": "Add New" }
```

**Important:** Never assert a specific plan name in flows that run across different subscription states. Use plan-agnostic assertions like "Active" or "Change Plan" instead of "Pro Plan Active" — the plan name can change depending on which account runs the test.

---

## 11. Complete Coverage Checklist

Use this checklist to make sure you haven't missed anything for your project.

### Platform/Admin flows
- [ ] Login as admin/superadmin
- [ ] List all users/accounts (with search)
- [ ] View account detail
- [ ] Approve/reject account status changes
- [ ] Assign/revoke roles or tiers
- [ ] View subscription/billing overview

### User/Account onboarding
- [ ] Register new account
- [ ] Email verification (OTP or link)
- [ ] Profile completion step
- [ ] Submit any required verification documents
- [ ] Receive approval (async — triggered by admin)

### Subscription / Billing flows
- [ ] View available plans
- [ ] Subscribe to a plan (each plan)
- [ ] Payment gateway redirect
- [ ] Post-payment plan activation
- [ ] Cancel subscription
- [ ] Switch plan (upgrade and downgrade)
- [ ] View billing history / invoices

### Core product features (per role and plan)
Map out every feature of your product, grouped by who can access it and what plan it requires:

```
Feature: [name]
  Plans: Free | Pro | Enterprise
  Actor: Admin | User | Customer
  Actions to test: Create | Read | Update | Delete | Export
```

Test every CRUD action for every feature at every plan level that unlocks it.

### Settings flows
- [ ] Update profile information
- [ ] Change password
- [ ] Update notification preferences
- [ ] Upload profile image
- [ ] Delete account (if applicable)

### Customer / End-user flows (if your app has a customer-facing side)
- [ ] Browse/search listings
- [ ] View item/profile detail
- [ ] Submit order/booking/request
- [ ] Check order/booking status
- [ ] Make payment
- [ ] Leave a review

### Sub-account / Staff flows (if applicable)
- [ ] Login as sub-account
- [ ] Redirect to restricted portal
- [ ] Cannot access owner-only pages (settings, billing)
- [ ] Can access permitted features

---

## 12. Common Gotchas

| Gotcha | Root Cause | Fix |
|--------|------------|-----|
| `wait_for_url` times out | Waiting for external event (webhook, email, async job) | Use longer timeout (300000ms). Manual action may be needed mid-flow. |
| Selector matches multiple elements | Selector not specific enough | Scope it: `div:has(h3:has-text('Section')) button` |
| Button click does nothing | Element is still loading/disabled | Add `wait 2000` before clicking |
| `assert_text` fails despite visible text | Text inside shadow DOM, iframe, or CSS pseudo-element | Use `assert_element` on a wrapper instead, or check the actual DOM |
| Form fills but won't submit | JS validation or required fields not satisfied | Check all required fields are filled; check for custom checkbox or terms acceptance |
| Page loads but data is empty | API call hasn't resolved yet | Add `wait 2000` after navigation before asserting data |
| Assertion passes locally but fails on CI | Race condition / timing | Increase all wait times; add screenshot before assertion to debug |
| External gateway doesn't redirect back | Payment step not completed manually | Flow is intentionally paused at `wait_for_url` — complete payment manually |
| Toast/notification disappears before assertion | UI toast auto-dismisses | Assert within 500ms of the action, or assert a persisted state change instead |

---

## 13. Flow Naming Convention

Consistent naming makes the flow list scannable at a glance.

**Format:** `[Actor] - [Feature] [Action/State]`

**Examples:**
```
Admin - Approve User Account
Admin - List Tenants with Search
User - Subscribe to Pro Plan via Stripe
User - Cancel Subscription (Confirmation Flow)
Customer - Submit Order (Manual Payment)
Staff - Login Redirects to Staff Portal
Staff - Cannot Access Billing Settings
Settings - Update Profile Name and Photo
Settings - Change Password Successfully
Packages - Create New Package with Image
Packages - Plan Limit Enforced (Max Reached)
```

**Rules:**
- Start with the actor
- Use present tense action verbs (Submit, Create, Update, Cancel, View)
- Include the expected outcome for negative/permission tests
- Keep it under 60 characters

---

## 14. Seeding Test Data

For flows to be repeatable, your test data needs to be deterministic. Options:

**Option A: Database seeder (recommended)**
- Write a seeder that creates all test accounts, products, and state
- Seed accounts for each role + plan combination
- Use fixed credentials (e.g., `admin@test.com / test1234`)
- Document all seeded accounts in the seeder file itself

**Option B: Flow-based setup**
- First flow creates the data (register, create product)
- Subsequent flows depend on that data being present
- More fragile — if the first flow fails, all dependent flows fail

**Option C: API setup steps**
- Use `navigate` to API endpoints that reset state before tests
- Only works if your backend exposes test-only reset routes

**Best practice:** Use Option A + document the seeded accounts in a comment block at the top of your seeder. Then reference those credentials in your flows.

---

## 15. How to Generate Flows for a New Project

When starting a new project in maiflow.my:

**Step 1: Map your actors**
List every type of user and their permission level.

**Step 2: Map your features per actor per plan**
Create a matrix: feature × actor × plan → actions available.

**Step 3: Draw dependency chains**
Identify which flows must run before others. Write the chain top-to-bottom.

**Step 4: Write smoke tests first**
One flow per major page — just "does it load?" Give yourself a baseline.

**Step 5: Add CRUD tests**
For every feature: create → assert → edit → assert → delete → assert.

**Step 6: Add permission tests**
For every locked feature: wrong-plan user → sees upgrade prompt. Wrong role → redirected.

**Step 7: Add E2E journey tests**
Build the full user journey flows using the dependency chain from Step 3.

**Step 8: Add edge cases**
Empty forms, invalid inputs, plan limits, session expiry.

---

*This guide is part of the maiflow.my project.*
*Designed to be reusable for any web application E2E test planning.*
