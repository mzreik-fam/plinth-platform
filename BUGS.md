# Plinth — Full Bug Report

**Review date:** 2026-04-30  
**Files reviewed:** ~60 (every API route, every page, all lib files, migrations, translations)  
**Total issues:** 22

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 4 | Features broken entirely, data incorrect |
| 🟠 High | 7 | Wrong visible behaviour, data errors |
| 🟡 Medium | 11 | Noticeable issues, broken UI elements, missing functionality |

---

## Schema Note

`lib/schema.ts` is missing 7 tables and 3 columns that are used throughout the app. However, `migrate-phase2.ts` creates all of them, so **they exist in the live database** assuming migrations were run. The schema file is just incomplete as a documentation/fresh-setup artifact — it is called out separately as **M12**.

---

---

# 🔴 CRITICAL

---

## C1 — Payment recording is completely broken

**File:** `app/[locale]/(dashboard)/sales/[id]/page.tsx` lines 64–73  
**Also:** `app/api/payments/route.ts` line 25

### What happens
The payment form on the sale detail page sends camelCase field names:
```json
{ "transactionId": "...", "paymentMethod": "bank_transfer", "referenceNumber": "..." }
```
The payments API destructures snake_case field names:
```js
const { transaction_id, amount, payment_method, reference_number } = body;
```
`transaction_id` and `payment_method` are always `undefined`. The API immediately returns:
```
400 — "Transaction, amount and payment method required"
```
**No payment has ever been recordable from the UI.**

### Fix
Change the page to send snake_case — or update the API to read camelCase (consistent with how every other route in the codebase handles it):
```js
// page.tsx — change the body to:
body: JSON.stringify({
  transaction_id: id,
  amount: Number(paymentForm.amount),
  payment_method: paymentForm.paymentMethod,
  reference_number: paymentForm.referenceNumber,
})
```

---

## C2 — SQL syntax error inserting termination steps — all non-zero deadlines fail

**File:** `app/api/terminations/route.ts` line 82

### What happens
```js
CURRENT_DATE + INTERVAL '${step.deadline_days} days'
```
The neon `sql` tagged template literal uses **parameterized queries** — it never does string interpolation. The expression `${step.deadline_days}` becomes the placeholder `$5` in the transmitted SQL text. PostgreSQL receives:
```sql
CURRENT_DATE + INTERVAL '$5 days'
```
Inside a string literal, `$5` is just the characters `$` and `5` — PostgreSQL cannot parse `'$5 days'` as an interval and throws an error.

Steps 2, 3, and 4 (30, 60, 90 day deadlines) all fail to insert, aborting the entire termination case creation. **No termination case with DLD steps can be created.**

### Fix
```sql
CURRENT_DATE + (${step.deadline_days} * INTERVAL '1 day')
```

---

## C3 — Buyer portal broken — RLS throws error without tenant context

**File:** `app/api/portal/[token]/route.ts`

### What happens
All tables have Row Level Security enabled with this policy:
```sql
USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
```
`current_setting('setting', missing_ok)` throws a PostgreSQL error when the setting is not defined and `missing_ok` is not `true`. The portal route never calls `set_config(...)`, so every query fails with:
```
ERROR: unrecognized configuration parameter "app.current_tenant_id"
```
**The buyer portal page always returns a 500 error.**

### Fix (two parts)
1. Update all RLS policies to use `current_setting('app.current_tenant_id', true)` (adds `missing_ok = true`) so an unset context returns NULL instead of throwing.
2. The portal query already filters by the globally unique `portal_token`, so no tenant context is needed. The policy will evaluate to `tenant_id = NULL::UUID` which is `false`, blocking the query — so the portal also needs the tenant to be derived from the token itself:
```sql
-- In the portal query, join and set context first, or
-- grant the portal endpoint access via a service-role approach
```
Simplest safe fix: add `missing_ok = true` to ALL RLS policies so the portal can read its own row by token.

---

## C4 — Sidebar shows "U" and blank name — `/api/users/me` returns snake_case, sidebar reads camelCase

**File:** `app/api/users/me/route.ts` lines 14–18  
**Also:** `components/layout/sidebar.tsx` lines 162–169

### What happens
The login API explicitly maps database fields to camelCase before returning:
```js
return NextResponse.json({ user: { fullName: user.full_name, ... } });
```
But `/api/users/me` returns the raw database row directly:
```js
return NextResponse.json({ user: users[0] }); // { full_name: "..." }
```
The sidebar fetches `/api/users/me` on mount and reads `user.fullName` — which is `undefined`. The avatar shows **"U"** and the name field is **blank** for every logged-in user.

### Fix
Map the field in `/api/users/me`:
```js
return NextResponse.json({
  user: { ...users[0], fullName: users[0].full_name }
});
```

---

---

# 🟠 HIGH

---

## H1 — Copy portal link generates wrong URL — missing locale prefix

**File:** `app/[locale]/(dashboard)/sales/[id]/page.tsx` line 83

### What happens
```js
const url = `${window.location.origin}/portal/${transaction.portal_token}`;
```
The portal page lives at `app/[locale]/portal/[token]/page.tsx`. Without the locale prefix, the URL `/portal/xxx` hits the root redirect which sends the user to `/en`, never reaching the portal.

### Fix
```js
const url = `${window.location.origin}/${locale}/portal/${transaction.portal_token}`;
```

---

## H2 — Total paid includes pending and rejected payments — wrong balances shown

**Files:** `app/api/portal/[token]/route.ts` line 34, `app/[locale]/(dashboard)/sales/[id]/page.tsx` line 91

### What happens
Both locations sum all payments regardless of status:
```js
payments.reduce((sum, p) => sum + Number(p.amount), 0)
```
A pending or rejected payment of AED 50,000 inflates "Total Paid" by AED 50,000 and deflates "Remaining Balance" by the same — both in the internal sales view and the buyer-facing portal.

### Fix
```js
payments
  .filter(p => p.status === 'confirmed')
  .reduce((sum, p) => sum + Number(p.amount), 0)
```

---

## H3 — Draft (unapproved) units can be transacted

**File:** `app/api/transactions/route.ts` line 67

### What happens
```js
if (unitCheck[0].status !== 'available' && unitCheck[0].status !== 'draft') {
  return NextResponse.json({ error: 'Unit is not available' }, { status: 400 });
}
```
Draft units have not passed the approval workflow. The condition explicitly allows creating EOIs on unapproved units.

### Fix
```js
if (unitCheck[0].status !== 'available') {
  return NextResponse.json({ error: 'Unit is not available' }, { status: 400 });
}
```

---

## H4 — Race condition: two concurrent requests can double-book the same unit

**File:** `app/api/transactions/route.ts` lines 59–93

### What happens
The booking flow is three separate unprotected queries:
1. `SELECT status FROM units WHERE id = ...` — availability check
2. `INSERT INTO transactions ...` — create transaction
3. `UPDATE units SET status = 'pre_booked' ...` — lock unit

Two simultaneous POST requests for the same unit both pass step 1 before either runs step 3. Both transactions are created, the unit ends up with two active EOIs.

### Fix
Replace the separate check with an atomic update that returns nothing if the unit is already taken:
```sql
UPDATE units
SET status = 'pre_booked', updated_at = NOW()
WHERE id = ${data.unitId} AND status = 'available'
RETURNING id
```
Only proceed with the transaction insert if this returns a row.

---

## H5 — New user form offers roles the API rejects — silent failure

**File:** `app/[locale]/(dashboard)/users/new/page.tsx` lines 14–21  
**Also:** `app/api/users/route.ts` lines 19–24

### What happens
The form presents 6 role options including `agency_admin` and `agency_agent`. The API Zod schema only accepts:
```js
role: z.enum(['super_admin', 'project_manager', 'admin', 'internal_agent'])
```
Submitting with `agency_admin` or `agency_agent` results in a Zod parse error caught as a 500, returning the generic `tc("error")` alert with no explanation.

### Fix
Either add `'agency_admin'` and `'agency_agent'` to the Zod enum in the API, or remove those two options from the UI dropdown. Both is cleanest.

---

## H6 — Dashboard occupancy rate uses string concatenation instead of addition

**File:** `app/[locale]/(dashboard)/page.tsx` line 186

### What happens
Neon returns `COUNT(*)` results as strings (PostgreSQL BIGINT). The calculation:
```js
Math.round(((stats.units.booked + stats.units.handed_over) / stats.units.total) * 100)
```
becomes `("5" + "3") / "8"` = `"53" / 8` = `6.625` → `7%` instead of the correct `100%`. The occupancy rate is wrong for any non-zero data.

### Fix
```js
Math.round(
  ((Number(stats.units.booked) + Number(stats.units.handed_over)) / Number(stats.units.total)) * 100
)
```

---

## H7 — Boolean and numeric fields can never be updated to `false` or `0` via PATCH

**Files:**
- `app/api/handovers/[id]/route.ts` lines 70–79
- `app/api/terminations/[id]/route.ts` lines 67–73
- `app/api/snagging-tickets/[id]/route.ts` lines 28–36

### What happens
All three PATCH routes use this pattern:
```js
field = COALESCE(${body.field || null}, field)
```
If `body.field` is `false`, `false || null` evaluates to `null`. COALESCE then falls back to the existing column value. **Boolean fields like `dld_registration_confirmed` and `oqood_paid` can never be set back to `false`. Numeric fields can never be set to `0`.**

In the handover workflow, the "Confirm DLD & Oqood" button sets these to `true`. There is no way to undo it.

### Fix
Replace every `body.field || null` with:
```js
body.field !== undefined ? body.field : null
```

---

---

# 🟡 MEDIUM

---

## M1 — Three translation keys missing from both `en.json` and `ar.json`

**Files:** `messages/en.json`, `messages/ar.json`

### Missing keys

| Key | Used in | What breaks |
|-----|---------|-------------|
| `units.handed_over` | `units/page.tsx:92`, `units/[id]/page.tsx:131` | Badge shows raw key or throws in dev mode |
| `sales.terminated` | `sales/page.tsx:95` via `t(tx.status)` | Terminated transaction badge breaks |
| `common.view` | `sales/page.tsx:124` via `tc("view")` | View button shows raw key |

### Fix
Add to both `en.json` and `ar.json`:
```json
// en.json
"units":  { "handed_over": "Handed Over" }
"sales":  { "terminated": "Terminated" }
"common": { "view": "View" }

// ar.json
"units":  { "handed_over": "مسلم" }
"sales":  { "terminated": "منتهي" }
"common": { "view": "عرض" }
```

---

## M2 — Locale switcher is a stub — returns null

**File:** `components/layout/locale-switcher.tsx`

### What happens
```js
export function LocaleSwitcher() {
  return null;
}
```
The component renders nothing. Despite full Arabic translations in `ar.json`, **language switching is non-functional**. The button visible in the sidebar layout renders as empty space.

### Fix
Implement using next-intl's navigation helpers from `@/lib/i18n`:
```tsx
"use client";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/lib/i18n";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function toggle() {
    router.replace(pathname, { locale: locale === "en" ? "ar" : "en" });
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle}>
      {locale === "en" ? "ع" : "EN"}
    </Button>
  );
}
```
Also add `'ar'` to the locales array in `lib/i18n.ts`.

---

## M3 — No RTL support for Arabic locale

**File:** `app/[locale]/layout.tsx` lines 25–28

### What happens
The HTML element has no `dir` attribute and `lang` is hardcoded to `"en"`. When Arabic is selected, the layout does not mirror. All content remains left-to-right. Arabic text renders correctly but all UI elements (sidebar on left, text alignment, flex direction) stay in LTR orientation.

The `font-sans` class uses Geist, a Latin typeface. Arabic characters fall back to a system serif font, producing poor typography.

### Fix
```jsx
<html
  lang={locale}
  dir={locale === 'ar' ? 'rtl' : 'ltr'}
  suppressHydrationWarning
  className={`${GeistSans.variable} ${GeistMono.variable}`}
>
```
Add a suitable Arabic web font (e.g. IBM Plex Arabic, Cairo) as a CSS fallback.

---

## M4 — HTML `lang` attribute hardcoded to `"en"` regardless of locale

**File:** `app/[locale]/layout.tsx` line 25

### What happens
```jsx
<html lang="en" suppressHydrationWarning>
```
When the active locale is Arabic, screen readers, browser translation, and spell-checkers all treat the page as English. Covered by the fix in M3.

---

## M5 — Sidebar "Dashboard" item is active on every page

**File:** `components/layout/sidebar.tsx` lines 73–76

### What happens
```js
const isActive = (href: string) => {
  const fullPath = `/${locale}${href}`;       // href="" → "/en"
  return pathname === fullPath || pathname.startsWith(fullPath + "/");
};
```
The dashboard item has `href = ""`, so `fullPath = "/en"`. The condition `pathname.startsWith("/en/")` is true for every authenticated route. The Dashboard nav item is **always highlighted** regardless of which page is active.

### Fix
```js
const isActive = (href: string) => {
  if (href === "") return pathname === `/${locale}`;
  const fullPath = `/${locale}${href}`;
  return pathname === fullPath || pathname.startsWith(fullPath + "/");
};
```

---

## M6 — Handover inspection date input fires an API call on every keystroke

**File:** `app/[locale]/(dashboard)/handovers/[id]/page.tsx` lines 212–216

### What happens
```jsx
<Input
  type="datetime-local"
  onChange={(e) => updateHandover({ inspection_date: e.target.value, status: "snagging" })}
/>
```
`onChange` fires on every character typed or each click when selecting the date. Each fires a `PATCH /api/handovers/:id` request with a partial/invalid datetime string. This floods the API and can write garbage data to `inspection_date`.

### Fix
Use `onBlur` to fire only when the user finishes:
```jsx
<Input
  type="datetime-local"
  onBlur={(e) => { if (e.target.value) updateHandover({ inspection_date: e.target.value, status: "snagging" }); }}
/>
```

---

## M7 — Delete unit shows no error when deletion fails

**File:** `app/[locale]/(dashboard)/units/page.tsx` lines 43–47

### What happens
```js
async function deleteUnit(id: string) {
  if (!confirm(tc("confirm"))) return;
  await fetch(`/api/units/${id}`, { method: "DELETE" });
  fetchUnits();
}
```
Units that have transactions cannot be deleted (`ON DELETE RESTRICT` on the foreign key). The API returns a 500, but the page ignores the response, refreshes the list, and the unit silently remains. The user has no idea why nothing happened.

### Fix
```js
async function deleteUnit(id: string) {
  if (!confirm(tc("confirm"))) return;
  const res = await fetch(`/api/units/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Cannot delete unit. It may have active transactions.");
    return;
  }
  fetchUnits();
}
```

---

## M8 — Agents dropdown is silently empty for `internal_agent` users on the new sale form

**File:** `app/[locale]/(dashboard)/sales/new/page.tsx` lines 48–52

### What happens
```js
fetch("/api/users?role=internal_agent")
```
`internal_agent` is permitted to create transactions (`canCreateTransactions`), but the `/api/users` endpoint requires `canManageUsers` which excludes `internal_agent`. The fetch returns a 403. The error is swallowed and the agents dropdown loads empty with no explanation.

### Fix
Option A — add a dedicated read-only endpoint (e.g. `GET /api/agents`) that any `canCreateTransactions` role can access.  
Option B — catch the 403 in the UI and show "Not available for your role" in the dropdown.

---

## M9 — Cron endpoint has no auth when `CRON_SECRET` is unset

**File:** `app/api/cron/route.ts` line 13

### What happens
```js
if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```
If `CRON_SECRET` is not set in the environment, `cronSecret` is falsy and the entire `if` block is skipped. Any unauthenticated request to `GET /api/cron` can expire EOIs, send mass emails to buyers, and insert penalty records.

### Fix
Fail closed — require the secret to always be present:
```js
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

---

## M10 — Payment reminder emails sent every day with no deduplication — up to 7 duplicates per milestone

**File:** `app/api/cron/route.ts` lines 98–107

### What happens
The cron runs daily at 9 AM. For any transaction whose milestone due date falls within the next 7 days, it sends a reminder email on **every single run** within that window. A buyer with one upcoming payment receives the same email every day for up to 7 days.

### Fix
Track sent reminders. Add a `payment_reminders` table (or a `reminder_sent_at` column on `payments`) and skip the send if a reminder for this transaction + milestone already exists within the past 24 hours.

---

## M11 — Unsafe SQL construction in transaction PATCH

**File:** `app/api/transactions/[id]/route.ts` lines 96–103

### What happens
```js
const query = `UPDATE transactions SET ${updates.join(', ')}, updated_at = NOW() WHERE ...`;
const result = await sql([query] as unknown as TemplateStringsArray, ...values);
```
This casts a runtime-built string to `TemplateStringsArray` via `as unknown as`. The neon driver's template literal API is designed to receive the frozen string parts array that the JavaScript runtime creates — not a runtime-constructed array. This bypasses the intended API contract.

Field names are hardcoded (not user input) so there is **no SQL injection risk today**, but this pattern could break silently on driver updates or with future changes that add user-controlled field names.

### Fix
Restructure as individual conditional updates, or use neon's `sql` fragment composition to build parts safely.

---

## M12 — `lib/schema.ts` is incomplete — missing 7 tables and 3 columns

**File:** `lib/schema.ts`

### What happens
The main schema file only defines the 9 base tables. All of the following exist in the live database (created by `migrate-phase2.ts`) but are absent from `lib/schema.ts`:

**Missing tables:**
- `unit_approvals`
- `penalties`
- `handovers`
- `snagging_tickets`
- `termination_cases`
- `termination_steps`
- `notifications`

**Missing columns:**
- `payment_plans.penalty_rate`
- `units.reviewed_by`
- `units.approved_at`

Running `migrate()` from `lib/schema.ts` on a fresh database produces a broken setup — handovers, terminations, snagging, approvals, notifications, and penalty calculation all fail.

### Fix
Merge all DDL from `migrate-phase2.ts` and `migrate-area.ts` into `lib/schema.ts` so the schema file is the single authoritative source. Remove the separate migration scripts or keep them only for reference.

---

---

# Appendix — Files Changed per Bug

| File | Bugs |
|------|------|
| `app/[locale]/(dashboard)/sales/[id]/page.tsx` | C1, H1, H2 |
| `app/api/payments/route.ts` | C1 |
| `app/api/terminations/route.ts` | C2 |
| `app/api/portal/[token]/route.ts` | C3, H2 |
| `lib/schema.ts` | C3 (RLS policy fix), M12 |
| `app/api/users/me/route.ts` | C4 |
| `app/api/transactions/route.ts` | H3, H4 |
| `app/[locale]/(dashboard)/users/new/page.tsx` | H5 |
| `app/api/users/route.ts` | H5 |
| `app/[locale]/(dashboard)/page.tsx` | H6 |
| `app/api/handovers/[id]/route.ts` | H7 |
| `app/api/terminations/[id]/route.ts` | H7 |
| `app/api/snagging-tickets/[id]/route.ts` | H7 |
| `messages/en.json` | M1 |
| `messages/ar.json` | M1 |
| `components/layout/locale-switcher.tsx` | M2 |
| `app/[locale]/layout.tsx` | M3, M4 |
| `components/layout/sidebar.tsx` | M5 |
| `app/[locale]/(dashboard)/handovers/[id]/page.tsx` | M6 |
| `app/[locale]/(dashboard)/units/page.tsx` | M7 |
| `app/[locale]/(dashboard)/sales/new/page.tsx` | M8 |
| `app/api/cron/route.ts` | M9, M10 |
| `app/api/transactions/[id]/route.ts` | M11 |
