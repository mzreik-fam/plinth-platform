# Plinth — Full Platform Audit

**Date:** 2026-04-30  
**Scope:** Performance · UX patterns · UI → Function → Database per page

---

## What Was Fixed ✅

| Fix | Status |
|-----|--------|
| Payment fields (camelCase → snake_case) | ✅ |
| Portal link includes locale prefix | ✅ |
| totalPaid on sale detail filters confirmed only | ✅ |
| Dashboard occupancy rate uses `Number()` | ✅ |
| Sidebar `isActive` exact-matches dashboard home | ✅ |
| `<Toaster>` added to layout | ✅ |

---

## Still Broken After Fixes

### 1 · Termination SQL fix is still wrong
**File:** `app/api/terminations/route.ts:82`

New code: `CURRENT_DATE + (${step.deadline_days} || ' days')::INTERVAL`

Still fails. When neon sends `step.deadline_days` as an integer, PostgreSQL evaluates `30 || ' days'` and throws `ERROR: operator does not exist: integer || text`. You cannot concatenate integer with text without a cast.

**Correct fix:**
```sql
CURRENT_DATE + (${step.deadline_days} * INTERVAL '1 day')
```

---

### 2 · Sidebar avatar initial still always "U"
**File:** `components/layout/sidebar.tsx:167 and 171`

```jsx
{user.fullName?.charAt(0)?.toUpperCase() || "U"}  // line 167 — fullName undefined → "U"
<p>{user.full_name}</p>                            // line 171 — correct
```

`/api/users/me` returns `full_name` (raw DB key). The initial reads `fullName` (undefined). The name display reads `full_name` (works). Half-fixed. Fix line 167 to use `user.full_name`.

---

### 3 · Portal total paid still includes unconfirmed payments
**File:** `app/api/portal/[token]/route.ts:34`

```js
payments.reduce((sum, p) => sum + Number(p.amount), 0)  // all statuses
```
Fix: `.filter(p => p.status === 'confirmed').reduce(...)`

---

### 4 · LocaleSwitcher still returns null
**File:** `components/layout/locale-switcher.tsx` — language switching non-functional.

---

### 5 · HTML `lang` still hardcoded to `"en"`
**File:** `app/[locale]/layout.tsx:26` — `<html lang="en"` not updated.

---

### 6 · Three translation keys still missing from `en.json` and `ar.json`
- `units.handed_over` — units list badge and edit dropdown crash for handed-over units
- `sales.terminated` — sales list row crashes for terminated transactions
- `common.view` — View button on sales list shows raw key string

---

### 7 · Dashboard "Pending Approvals" counts the wrong thing
**File:** `app/api/dashboard/stats/route.ts:72`

```sql
SELECT COUNT(*) FROM units WHERE status = 'draft'
```
The approvals page shows `unit_approvals WHERE status = 'pending'`. These two numbers diverge — a unit can be draft with no pending approval, or an approval can be pending after re-submission. The dashboard number does not match the approvals page.

**Fix:** `SELECT COUNT(*) FROM unit_approvals WHERE status = 'pending'`

---

### 8 · Dashboard pipeline bar width still arbitrary
**File:** `app/[locale]/(dashboard)/page.tsx:228`

`Math.min(value * 10, 100)%` — 10 items fills the bar entirely. Meaningless with real data.

---

---

# 1 · Speed Audit

---

## S1 — Sidebar fires 2 DB calls on every page navigation

**File:** `components/layout/sidebar.tsx:52–66`

```js
useEffect(() => {
  fetch("/api/users/me")
  fetch("/api/notifications?unread=true")
}, []);
```

The sidebar is a Client Component inside the dashboard layout. `useEffect` with `[]` runs every time the sidebar mounts. Because Next.js App Router remounts layout children on client-side navigation, **these two fetches fire on every single page transition** across the entire app — not once per session.

**Impact:** ~2 extra Neon round-trips (~30–80ms each) added to every page load.

**Fix:**
- Store the user object in React context after login. The sidebar reads from context — zero extra fetches on navigation.
- Add `Cache-Control: private, max-age=60` to `/api/users/me` as a fallback.

---

## S2 — Dashboard runs 9 separate SQL queries

**File:** `app/api/dashboard/stats/route.ts`

Nine sequential `await sql` calls. Each is a separate HTTP round-trip to Neon.  
9 × ~40ms = **~360ms minimum** before the dashboard can render — before React paints anything.

**Fix:** Collapse into 2–3 queries using subquery aggregation:

```sql
-- Replace 6 of the 9 queries with this single round-trip:
SELECT
  (SELECT COUNT(*) FROM unit_approvals WHERE status = 'pending') AS pending_approvals,
  (SELECT COUNT(*) FROM handovers WHERE status != 'completed') AS active_handovers,
  (SELECT COUNT(*) FROM termination_cases WHERE status = 'active') AS active_terminations,
  (SELECT COUNT(*) FROM snagging_tickets WHERE status IN ('open','in_progress')) AS open_snagging,
  (SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false) AS unread,
  (SELECT COALESCE(SUM(penalty_amount), 0) FROM penalties WHERE status = 'active') AS penalty_total,
  (SELECT COUNT(*) FROM penalties WHERE status = 'active') AS penalty_count;
```

Result: 9 round-trips → 3.

---

## S3 — No HTTP caching — every navigation refetches everything

No `Cache-Control` headers on any API response. Navigating back to a page always re-fetches all data from Neon even when nothing has changed.

**Add these headers to API responses:**

| Endpoint | Suggested `max-age` | Reason |
|---|---|---|
| `GET /api/users/me` | 60s | Rarely changes mid-session |
| `GET /api/projects` | 300s | Infrequently updated |
| `GET /api/payment-plans` | 300s | Rarely updated |
| `GET /api/dashboard/stats` | 30s | Acceptable staleness for a dashboard |
| `GET /api/units` | 30s | Unit status updates don't need instant reflection |
| `GET /api/buyers` | 60s | Contact info rarely changes |

---

## S4 — No pagination — unbounded queries on all list pages

Every list endpoint returns all records with no `LIMIT`. As data grows:

| Endpoint | Risk at scale |
|---|---|
| `GET /api/transactions` | 1000+ rows → slow query + large payload |
| `GET /api/units` | 500+ units → slow |
| `GET /api/buyers` | Unbounded |
| `GET /api/users` | Unbounded |

**Minimum fix:** Add `LIMIT 200` to all list queries as a safety cap.  
**Proper fix:** Add `?page=1&limit=50` parameters to all list endpoints.

---

## S5 — Cron has N+1 query pattern inside loops

**File:** `app/api/cron/route.ts:86–108`

For each transaction, for each milestone:
```js
const existingPayment = await sql`SELECT SUM(amount) FROM payments WHERE transaction_id = ${tx.transaction_id}`
```
50 transactions × 4 milestones = **200 queries inside a loop**.

**Fix:** Pre-fetch all payment totals in one query before the loop:
```sql
SELECT transaction_id, COALESCE(SUM(amount), 0) AS paid
FROM payments WHERE status = 'confirmed'
GROUP BY transaction_id
```
Then look up `paidByTx[tx.transaction_id]` inside the loop — zero extra queries.

---

## S6 — No Neon connection pooling

No pooled connection string configured. Serverless cold starts add 100–300ms to the first request after idle.

**Fix:** Switch `DATABASE_URL` to Neon's pooled connection string (PgBouncer). One environment variable change.

---

---

# 2 · UX — Cards vs Tables

---

## Buyers → Change to table

**Current:** Card grid showing name, phone, email, emirates ID.

Cards add no value for administrative records. With 50+ buyers you need to scan quickly, sort by name, filter by nationality. A table does all of this; cards do none of it.

**Recommended columns:**
`Full Name | Phone | Email | Emirates ID | Nationality | Created | Actions`

---

## Projects → Change to table

**Current:** Card grid with name, location, area, status.

Projects are few (5–20) and purely data. A table is faster to scan and inline Edit/Delete fit naturally in a row. The existing dialog-based Create can stay.

**Recommended columns:**
`Name | Location | Area | Status | Actions (Edit, Delete)`

---

## Users → Change to table

**Current:** Card grid with name, username, email, role, status badge.

This is an admin management screen. Every SaaS admin panel uses tables for user management. Cards make role comparison slow and waste vertical space.

**Recommended columns:**
`Full Name | Username | Email | Role | Status | Created | Actions (Edit, Deactivate)`

---

## Units → Keep cards, add table view toggle

Unit cards show type, bedrooms, bathrooms, price, area — spatial data that benefits from visual grouping. Keep cards as default. Add a compact table view toggle for bulk management (filtering by project, sorting by price).

---

## Sales, Handovers, Terminations, Approvals → Already correct ✅

---

---

# 3 · UI → Function → Database Audit

---

## Dashboard

**UI → `GET /api/dashboard/stats` → 9 SQL queries → JSON object**

| UI element | DB query | Correct? |
|---|---|---|
| Available / Pre-Booked / Booked / Handed Over counts | `COUNT FILTER (WHERE status=...)` on units | ✅ |
| Total Revenue | `SUM(total_price) WHERE status='confirmed'` | ✅ |
| Occupancy Rate calculation | `(booked + handed_over) / total` with `Number()` | ✅ fixed |
| Pending Approvals | `COUNT units WHERE status='draft'` | ❌ wrong — should query `unit_approvals` |
| Pipeline bar counts | `COUNT per transaction status` | ✅ correct counts, wrong bar widths |
| Upcoming Payments | CTE counting transactions with unpaid balances | ✅ count only, no amounts shown |
| Active Penalties | `COUNT + SUM FROM penalties WHERE status='active'` | ✅ |
| Unread notifications | `COUNT WHERE user_id AND is_read=false` | ✅ |

---

## Units List

**UI → `GET /api/units` → `SELECT u.*, p.name FROM units LEFT JOIN projects ORDER BY created_at DESC`**

| Action | UI calls | DB operation | Works? |
|---|---|---|---|
| View unit | Link to `/units/:id` | — | ✅ |
| Edit unit | Link to `/units/:id?edit=1` | — | ✅ |
| Delete unit | `DELETE /api/units/:id` | `DELETE FROM units WHERE id=...` | ⚠️ no error shown on FK violation |
| New Unit button | Link to `/units/new` | — | ✅ |

**Problem:** The delete handler ignores the API response. When a unit has transactions, the database returns a foreign key violation error, but the UI silently refreshes the list. The unit stays in place with no explanation given to the user.

---

## Unit Detail / Edit

**UI → `GET /api/units/:id` → `SELECT u.*, p.name FROM units LEFT JOIN projects WHERE u.id=...`**

| Action | UI calls | DB operation | Works? |
|---|---|---|---|
| Edit form submit | `PATCH /api/units/:id` | `UPDATE units SET ...` | ✅ |
| Request Approval button | `POST /api/unit-approvals` | UPSERT `unit_approvals` | ✅ |
| Request Approval feedback | `alert("Approval requested!")` | — | ⚠️ uses `alert()`, no loading state |

**Problem:** The edit form status dropdown includes `pre_booked`, `booked`, `handed_over`, `terminated`. These statuses should only be set by the system through transactions, handovers, and terminations — not manually edited. A user can force a unit to "handed_over" status without going through the handover process at all.

---

## New Unit

**UI fetches `/api/projects` on mount → submits `POST /api/units`**  
**API:** `INSERT INTO units` + `INSERT INTO unit_approvals ON CONFLICT DO NOTHING`

| Check | Result |
|---|---|
| Project dropdown populated | ✅ fetches `/api/projects` |
| Empty projects handled | ❌ blank dropdown, no "Create a project first" message |
| `status = 'available'` on create | ⚠️ bypasses approval — unit goes live without review |
| Error feedback | ⚠️ generic `alert(tc("error"))` — Toaster is installed but unused here |

---

## Sales List

**UI → `GET /api/transactions` → `SELECT t.*, u.unit_number, u.unit_type, b.full_name, a.full_name FROM transactions LEFT JOIN units LEFT JOIN buyers LEFT JOIN users ORDER BY created_at DESC`**

**Problem:** `t(tx.status)` is called for every row. The translation key `sales.terminated` is missing. Any transaction with status `terminated` throws a next-intl rendering error for that row, breaking the entire list.

---

## New Sale

**UI fetches 4 endpoints in parallel on mount:**

| Fetch | Works? | Issue |
|---|---|---|
| `GET /api/units?status=available` | ✅ | |
| `GET /api/buyers` | ✅ | |
| `GET /api/payment-plans` | ✅ | Empty if no plans seeded — no message shown |
| `GET /api/users?role=internal_agent` | ❌ for `internal_agent` users | Requires `canManageUsers` → 403 → silent empty dropdown |

**Submit → `POST /api/transactions` → INSERT transaction + UPDATE unit to `pre_booked`**

Problems:
- No atomic lock — race condition can double-book the same unit under concurrent requests
- Draft units are still transactable (status check still allows `draft`)

---

## Sale Detail

**UI → `GET /api/transactions/:id` → transaction + payments with LEFT JOINs**

| Action | UI calls | DB operation | Works? |
|---|---|---|---|
| Move to Booking Pending | `PATCH {status:'booking_pending'}` | UPDATE transactions | ✅ |
| Confirm Booking | `PATCH {status:'confirmed'}` | UPDATE transactions + units to `booked` | ✅ |
| Cancel | `PATCH {status:'cancelled'}` | UPDATE transactions + units to `available` | ✅ |
| Record Payment | `POST /api/payments` snake_case fields | INSERT payments + email | ✅ fixed |
| Copy Buyer Portal Link | builds `/${locale}/portal/${token}` | — | ✅ fixed |
| Start Handover | `POST /api/handovers` | INSERT handovers + email to buyer | ⚠️ no duplicate check |
| Terminate | `POST /api/terminations` | INSERT case + 4 steps + UPDATE tx + unit | ⚠️ SQL still broken |
| Financial Statement link | link to `/financial-statement?transaction_id=` | — | ✅ |
| Total Paid display | `.filter(confirmed).reduce(...)` | — | ✅ fixed |

**Problems:**
- Clicking "Start Handover" twice creates two handover records for the same transaction. The API has no uniqueness constraint on `(transaction_id)` in the handovers table.
- "Terminate" button fires immediately on one click with no confirmation dialog. It changes transaction status, unit status, and creates 4 DLD steps — all irreversible.

---

## Buyers

**UI → `GET /api/buyers` → `SELECT id, full_name, email, phone, emirates_id, nationality, created_at FROM buyers`**

Problems:
- Card layout (should be table — see UX section)
- No edit button — typos in names/phones cannot be corrected
- No delete button
- No link to the buyer's transactions
- `passport_number` column exists in DB but is never displayed or editable

---

## New Buyer

**Submit → `POST /api/buyers` → `INSERT INTO buyers`**

Problems:
- No Zod validation in the API. Missing `phone` field (NOT NULL in schema) returns a DB constraint error caught as a generic 500 "Failed to create buyer" — no useful message
- No `passport_number` field in the form
- Uses `alert()` for errors despite Toaster being available

---

## Users

**UI → `GET /api/users` → `SELECT id, email, username, full_name, role, is_active, created_at FROM users`**

Problems:
- Card layout (should be table — see UX section)
- No edit button
- No deactivate/delete button — inactive users can never be managed through the UI
- No password reset

---

## New User

**Submit → `POST /api/users` with Zod validation**

**Zod allows:** `['super_admin', 'project_manager', 'admin', 'internal_agent']`  
**Form offers:** also `agency_admin` and `agency_agent`

Selecting either of the extra roles causes a Zod parse error → 500 → generic "Something went wrong" alert. The user has no idea what happened.

---

## Projects

**UI → `GET /api/projects` → `SELECT id, name, location, area, status FROM projects`**

Problems:
- Card layout (should be table — see UX section)
- No `PATCH /api/projects/:id` endpoint — nothing in the entire platform can edit a project
- No `DELETE /api/projects/:id` endpoint
- Status badge is shown but can never be changed
- If project creation fails, the dialog closes with no error message shown

---

## Approvals

**UI → `GET /api/unit-approvals` + `GET /api/users/me`**  
**API → `SELECT ua.*, u.unit_number, p.name, req.full_name, rev.full_name FROM unit_approvals JOIN units JOIN projects LEFT JOIN users`**

| Action | UI calls | DB operation | Works? |
|---|---|---|---|
| Approve | `PATCH /api/unit-approvals/:id {status:'approved'}` | UPDATE unit_approvals + UPDATE units to `available` + email | ✅ |
| Reject | `PATCH /api/unit-approvals/:id {status:'rejected'}` | UPDATE unit_approvals | ✅ |
| `canReview` role check | reads `user?.role` from `/api/users/me` | — | ✅ (`role` is same in snake/camelCase) |

Problems:
- No loading/disabled state on Approve and Reject buttons — double-clicking submits two requests
- No confirmation dialog before approving (publishes unit to `available` and sends an email)

---

## Financial Statement

**UI → `GET /api/financial-statement?transaction_id=...` → 4 queries: transaction, payments, penalties, documents**

| Element | Source | Works? |
|---|---|---|
| Total Price | `transaction.total_price` | ✅ |
| Total Paid | sum of confirmed payments | ✅ |
| Outstanding | `totalPrice - totalPaid + totalPenalties` | ✅ |
| Progress bar | `progressPercent` from API | ✅ |
| Payment plan milestones | `transaction.payment_plan_milestones` JSONB | ✅ |
| Documents list | `documents` array | ✅ shown, no upload UI |

**Problem:** Navigating directly to `/financial-statement` without a `?transaction_id=` parameter shows "Transaction ID required" as plain centered text with no back link or redirect. Dead end.

---

## Handover Detail

**UI → `GET /api/handovers/:id` → handover + snagging tickets**

| Action | Works? |
|---|---|
| Mark BCC Uploaded | ✅ |
| Confirm Handover Payment | ✅ |
| Confirm DLD & Oqood | ⚠️ COALESCE boolean bug — cannot be set back to `false` |
| Set Inspection Date | ⚠️ `onChange` fires API call on every keystroke |
| Complete Key Handover | ✅ — updates unit to `handed_over` |
| Add snagging ticket | ✅ — inserts + sends email to buyer |
| Update ticket status | ✅ — auto-updates handover status when all tickets closed |

---

## Termination Detail

**UI → `GET /api/terminations/:id` → case + steps**

| Action | Works? |
|---|---|
| Fill step fields (onBlur) | ✅ — but fires 5 individual PATCH calls per step |
| Mark step complete | ✅ — advances `current_step`, notifies buyer |
| Step 4 complete | ✅ — marks case `completed` |

**Problem:** Each input field (notice date, method, courier tracking, receipt date, notes) fires its own PATCH on blur. Filling all 5 fields = 5 API calls. Should all be batched behind a single "Save Step" button.

---

## Buyer Portal

**UI → `GET /api/portal/:token` → transaction + payments (bypasses RLS)**

| Element | Works? |
|---|---|
| Unit details (number, type, area) | ✅ |
| Total Price | ✅ |
| Total Paid | ❌ includes pending and rejected payments |
| Remaining Balance | ❌ wrong because Total Paid is wrong |
| Payment history list | ✅ shown |
| Payment plan schedule (milestones + due dates) | ❌ data is in the API response but not rendered |

---

---

# 4 · Priority Action List

## Fix Immediately (still broken)

| # | Issue | File | Effort |
|---|---|---|---|
| 1 | Termination SQL — `integer \|\| text` fails | `app/api/terminations/route.ts:82` | 1 line |
| 2 | Sidebar avatar uses `fullName` (undefined) | `components/layout/sidebar.tsx:167` | 1 word |
| 3 | Portal totalPaid includes unconfirmed | `app/api/portal/[token]/route.ts:34` | 1 line |
| 4 | 3 missing translation keys | `messages/en.json` + `messages/ar.json` | 6 lines |
| 5 | Pending approvals stat uses wrong table | `app/api/dashboard/stats/route.ts:72` | 1 query |
| 6 | Duplicate handovers — no uniqueness check | `app/api/handovers/route.ts` | small |
| 7 | New user: agency roles in form but blocked by API | `users/new/page.tsx` or `users/route.ts` | small |

## Convert to Tables (UX)

| Page | Columns |
|---|---|
| Buyers | Full Name · Phone · Email · Emirates ID · Nationality · Created · Actions |
| Projects | Name · Location · Area · Status · Actions (Edit, Delete) |
| Users | Full Name · Username · Email · Role · Status · Created · Actions |

## Speed (highest ROI first)

| # | Fix | What it saves |
|---|---|---|
| 1 | Cache user in React context — stop per-page sidebar fetch | −2 DB calls per every navigation |
| 2 | Collapse dashboard 9 queries → 3 | ~300ms off every dashboard load |
| 3 | Add `Cache-Control` headers to list/reference endpoints | Eliminates back-navigation refetches |
| 4 | Fix cron N+1 — pre-fetch payment totals before loop | Cron: 200 queries → ~5 |
| 5 | Enable Neon connection pooling | −100–300ms cold start latency |
| 6 | Add `LIMIT 200` safety cap to all list queries | Prevents future slowdowns as data grows |

## UX Improvements

| # | Issue | Recommended Fix |
|---|---|---|
| 1 | Terminate button — no confirmation | Add `AlertDialog` before POST |
| 2 | Start Handover — can create duplicates | Check for existing handover; show link if found |
| 3 | Unit edit — allows workflow-only statuses | Restrict dropdown to `draft` and `available` |
| 4 | New unit — empty project dropdown | Show "Create a project first" if projects list is empty |
| 5 | Handover inspection date `onChange` | Change to `onBlur` |
| 6 | Termination step — 5 individual PATCHes | Add "Save Step" button to batch all fields |
| 7 | All forms use `alert()` for errors | Replace with `toast.error()` — Toaster is already in layout |
| 8 | No success feedback after form saves | Add `toast.success()` before redirect |
| 9 | Portal — no payment schedule shown | Render `payment_plan_milestones` with calculated due dates |
| 10 | Financial statement — dead end without transaction_id | Add redirect to `/sales` with a message |
| 11 | Approvals — no loading state on buttons | Disable buttons while PATCH is in flight |
| 12 | Delete unit — silent failure | Show `toast.error()` when DELETE returns an error |
| 13 | Projects — no edit or delete at all | Add `PATCH` and `DELETE` endpoints + UI buttons |
| 14 | Buyers — no edit, no transaction link | Add edit form + "View Transactions" link per buyer |
| 15 | Dashboard pipeline bars — arbitrary width | Calculate width relative to total transactions |
