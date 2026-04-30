# Plinth — Audit V2

**Date:** 2026-04-30  
**Based on:** Fresh re-read of all files after first round of fixes  
**Format:** Each issue has a clear description, the exact file and line, and the exact fix

---

## Summary

| Priority | Count |
|----------|-------|
| 🔴 Critical — broken features | 4 |
| 🟠 High — wrong behaviour / data errors | 3 |
| 🟡 Medium — UI display bugs / UX issues | 10 |
| 🔵 UX — layout pattern changes | 3 |

---

---

# 🔴 CRITICAL

---

## C1 — Termination steps still fail to insert — SQL fix introduced a new error

**File:** `app/api/terminations/route.ts` — line 82

**What breaks:**  
Creating a termination case fails silently. The case record inserts, but all 4 DLD step records fail. Steps 2, 3, 4 (30, 60, 90 day deadlines) throw a PostgreSQL type error and the whole operation errors out.

**Why:**  
The previous fix changed the SQL to:
```sql
CURRENT_DATE + (${step.deadline_days} || ' days')::INTERVAL
```
This still fails. When neon sends `step.deadline_days` as an integer bind parameter, PostgreSQL evaluates `30 || ' days'` and throws:
```
ERROR: operator does not exist: integer || text
```
You cannot concatenate integer with text in PostgreSQL without an explicit cast.

**Fix — change line 82 to:**
```sql
CURRENT_DATE + (${step.deadline_days} * INTERVAL '1 day')
```

---

## C2 — Invited users get redirected to login — cannot accept invitation

**File:** `middleware.ts` — line 6

**What breaks:**  
A brand-new user who has never logged in clicks the invitation link in their email. They land on `/en/invite/[token]`. The middleware has no session cookie for them and redirects them to `/en/login`. They never reach the set-password page.

> **Note:** If you tested this while logged in as admin on the same browser, it worked because your existing `plinth_session` cookie passed the middleware check. Test it in an incognito window with no existing session — you will be blocked.

**Fix — add `/invite` to the public routes list:**
```js
// middleware.ts line 6
const publicRoutes = ['/login', '/portal', '/invite'];
```

---

## C3 — Portal shows wrong "Total Paid" — includes pending and rejected payments

**File:** `app/api/portal/[token]/route.ts` — line 34

**What breaks:**  
The buyer-facing portal shows an inflated "Total Paid" and a deflated "Remaining Balance". A pending payment of AED 100,000 that hasn't been confirmed yet is counted as paid.

**Fix:**
```js
// Before:
const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

// After:
const totalPaid = payments
  .filter((p: any) => p.status === 'confirmed')
  .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
```

---

## C4 — Sidebar avatar always shows "U" — user name initial broken

**File:** `components/layout/sidebar.tsx` — lines 167 and 240

**What breaks:**  
Every user in the app sees "U" as their avatar initial in the sidebar instead of their actual first initial.

**Why:**  
`/api/users/me` returns the raw database field `full_name` (snake_case). The sidebar reads `user.fullName` (camelCase) which is always `undefined`. The `|| "U"` fallback always triggers.

The name text on line 171 and 244 uses `user.full_name` correctly — it's only the initial that's broken.

**Fix — lines 167 and 240, change `user.fullName` to `user.full_name`:**
```jsx
// line 167 and line 240 — both occurrences:
{user.full_name?.charAt(0)?.toUpperCase() || "U"}
```

---

---

# 🟠 HIGH

---

## H1 — Dashboard "Pending Approvals" stat shows the wrong number

**File:** `app/api/dashboard/stats/route.ts` — line 72

**What breaks:**  
The dashboard "Pending Approvals" count does not match what you see on the Approvals page. They can show completely different numbers.

**Why:**  
The dashboard counts `units WHERE status = 'draft'`. The approvals page shows `unit_approvals WHERE status = 'pending'`. A unit can be in draft status with no pending approval (e.g. it was rejected and never re-submitted). Conversely, an approval can be pending after re-submission even if the unit is no longer draft.

**Fix:**
```sql
-- Before:
SELECT COUNT(*) as count FROM units WHERE status = 'draft'

-- After:
SELECT COUNT(*) as count FROM unit_approvals WHERE status = 'pending'
```

---

## H2 — "Start Handover" creates duplicate handover records

**File:** `app/api/handovers/route.ts` — POST handler

**What breaks:**  
Clicking the "Start Handover" button more than once on a confirmed transaction creates multiple handover records for the same transaction. Each one sends a notification email to the buyer.

**Fix — add an existence check before inserting:**
```js
// Add this before the INSERT:
const existing = await sql`
  SELECT id FROM handovers WHERE transaction_id = ${transaction_id} LIMIT 1
`;
if (existing.length > 0) {
  return NextResponse.json({ handover: existing[0] });
}
```

---

## H3 — Three translation keys missing — causes rendering errors on live data

**Files:** `messages/en.json` and `messages/ar.json`

**What breaks:**  
- Any unit with status `handed_over` causes the units list and unit edit page to throw a rendering error
- Any transaction with status `terminated` causes the sales list to throw a rendering error  
- The "View" button on the sales list shows the raw key string `common.view`

**Fix — add to both `en.json` and `ar.json`:**

```json
// en.json — add inside "units":
"handed_over": "Handed Over"

// en.json — add inside "sales":
"terminated": "Terminated"

// en.json — add inside "common":
"view": "View"
```

```json
// ar.json — add inside "units":
"handed_over": "مسلم"

// ar.json — add inside "sales":
"terminated": "منتهي"

// ar.json — add inside "common":
"view": "عرض"
```

---

---

# 🟡 MEDIUM

---

## M1 — Raw underscore values show in dropdowns on first render (6 places)

**Root cause:**  
shadcn's `<SelectValue />` with no children renders the raw `value` string (e.g. `internal_agent`) instead of the display label (e.g. `Internal Agent`) before `SelectContent` mounts. This affects every Select that has a programmatic default value set in state.

---

### M1a — Invite / New User — Role selector

**File:** `app/[locale]/(dashboard)/users/new/page.tsx` — line 128

Shows: `internal_agent`  
Should show: `Internal Agent`

```jsx
// Before:
<SelectTrigger className="h-11"><SelectValue /></SelectTrigger>

// After:
<SelectTrigger className="h-11">
  <SelectValue>
    {roleOptions.find(r => r.value === form.role)?.label}
  </SelectValue>
</SelectTrigger>
```

---

### M1b — Sale Detail — Payment method selector

**File:** `app/[locale]/(dashboard)/sales/[id]/page.tsx` — payment form Select

Shows: `bank_transfer`  
Should show: `Bank Transfer`

Add a label map near the top of the component:
```js
const paymentMethodLabels: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  cash: 'Cash',
  card: 'Card',
};
```

Then update the SelectValue:
```jsx
// Before:
<SelectTrigger><SelectValue /></SelectTrigger>

// After:
<SelectTrigger>
  <SelectValue>
    {paymentMethodLabels[paymentForm.paymentMethod]}
  </SelectValue>
</SelectTrigger>
```

---

### M1c — New Unit — Unit type selector

**File:** `app/[locale]/(dashboard)/units/new/page.tsx` — unit type Select

Shows: `apartment`  
Should show: `Apartment`

```jsx
// Before:
<SelectTrigger className="h-11"><SelectValue /></SelectTrigger>

// After:
<SelectTrigger className="h-11">
  <SelectValue>{t(form.unitType)}</SelectValue>
</SelectTrigger>
```

---

### M1d — New Unit — Status selector

**File:** `app/[locale]/(dashboard)/units/new/page.tsx` — status Select

Shows: `draft`  
Should show: `Draft`

```jsx
// Before:
<SelectTrigger className="h-11"><SelectValue /></SelectTrigger>

// After:
<SelectTrigger className="h-11">
  <SelectValue>{t(form.status)}</SelectValue>
</SelectTrigger>
```

---

### M1e — Unit Detail/Edit — Unit type selector

**File:** `app/[locale]/(dashboard)/units/[id]/page.tsx` — unit type Select in edit form

Shows: raw DB value e.g. `villa`  
Should show: `Villa`

```jsx
// Before:
<SelectTrigger><SelectValue /></SelectTrigger>

// After:
<SelectTrigger>
  <SelectValue>{form.unit_type ? t(form.unit_type) : ''}</SelectValue>
</SelectTrigger>
```

---

### M1f — Unit Detail/Edit — Status selector

**File:** `app/[locale]/(dashboard)/units/[id]/page.tsx` — status Select in edit form

Shows: raw DB value e.g. `pre_booked`  
Should show: `Pre-Booked`

```jsx
// Before:
<SelectTrigger><SelectValue /></SelectTrigger>

// After:
<SelectTrigger>
  <SelectValue>{form.status ? t(form.status) : ''}</SelectValue>
</SelectTrigger>
```

Note: `units.handed_over` is also missing from translations (covered in H3 above). Fix H3 first so this doesn't break.

---

## M2 — Invite acceptance: redirect after success hardcoded to `/en/login`

**File:** `app/[locale]/invite/[token]/page.tsx` — line 83

**What happens:**  
After the invited user sets their password, the "Go to Login" button pushes them to `/en/login` regardless of their locale. If Arabic is ever active, they go to the wrong locale.

**Fix:**
```jsx
// Add at the top of the component:
const locale = useLocale(); // import from 'next-intl'

// Line 83 — change:
router.push("/en/login")
// To:
router.push(`/${locale}/login`)
```

---

## M3 — "Terminate" button has no confirmation — one click is irreversible

**File:** `app/[locale]/(dashboard)/sales/[id]/page.tsx` — Terminate button

**What happens:**  
One click immediately calls `POST /api/terminations`, which changes the transaction status to `terminated`, changes the unit status to `terminated`, and creates 4 DLD process steps. There is no "are you sure?" step. This cannot be undone through the UI.

**Fix:** Wrap in a shadcn `AlertDialog` before firing the API call:
```jsx
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">
      <AlertTriangle className="h-4 w-4 mr-1" />
      Terminate
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Terminate this transaction?</AlertDialogTitle>
      <AlertDialogDescription>
        This will initiate the DLD termination process. The transaction and unit
        will be marked as terminated. This cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleTerminate} className="bg-destructive text-destructive-foreground">
        Yes, Terminate
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```
Move the termination API call into a separate `handleTerminate` function.

---

## M4 — Unit edit form allows manually setting workflow-only statuses

**File:** `app/[locale]/(dashboard)/units/[id]/page.tsx` — status Select in edit form

**What happens:**  
The edit form lets any user with edit access set a unit's status to `pre_booked`, `booked`, `handed_over`, or `terminated` directly — bypassing transactions, handovers, and the termination process entirely.

**Fix:** Remove those options from the edit form's status dropdown. Only `draft` and `available` should be editable manually:
```jsx
<SelectContent>
  <SelectItem value="draft">{t("draft")}</SelectItem>
  <SelectItem value="available">{t("available")}</SelectItem>
</SelectContent>
```

---

## M5 — Handover inspection date fires API on every keystroke

**File:** `app/[locale]/(dashboard)/handovers/[id]/page.tsx` — inspection date input

**What happens:**  
The datetime-local input uses `onChange`, which fires on every character typed. Each keystroke sends a `PATCH /api/handovers/:id` request with a partial or invalid date string.

**Fix:** Change `onChange` to `onBlur`:
```jsx
// Before:
onChange={(e) => updateHandover({inspection_date: e.target.value, status: "snagging"})}

// After:
onBlur={(e) => {
  if (e.target.value) {
    updateHandover({inspection_date: e.target.value, status: "snagging"});
  }
}}
```

---

## M6 — Termination step fields fire individual API calls — should be batched

**File:** `app/[locale]/(dashboard)/terminations/[id]/page.tsx`

**What happens:**  
Each input field (notice date, notice method, courier tracking, receipt confirmed, notes) fires its own `PATCH /api/termination-steps/:id` call on `onBlur`. Filling in all 5 fields sends 5 separate API requests.

**Fix:** Track all field changes in local state and add a single "Save" button that sends one PATCH with all changed fields at once.

---

## M7 — New unit page shows blank project dropdown with no guidance

**File:** `app/[locale]/(dashboard)/units/new/page.tsx`

**What happens:**  
If no projects have been created yet, the project dropdown is empty with no message. A new user creating their first unit has no idea what to do.

**Fix:** Show a helpful message when the projects list is empty:
```jsx
{projects.length === 0 ? (
  <div className="text-sm text-muted-foreground p-2">
    No projects yet.{" "}
    <Link href={`/${locale}/projects`} className="underline">
      Create a project first
    </Link>
  </div>
) : (
  projects.map((p: any) => (
    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
  ))
)}
```

---

## M8 — Financial statement page dead-end when accessed without a transaction ID

**File:** `app/[locale]/(dashboard)/financial-statement/page.tsx` — lines 34–36

**What happens:**  
If a user navigates directly to `/financial-statement` without a `?transaction_id=` parameter, they see "Transaction ID required" as plain centred text with no back link or next step.

**Fix:**
```jsx
if (!transactionId) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-muted-foreground">Select a transaction to view its financial statement.</p>
      <Link href={`/${locale}/sales`} className="mt-4">
        <Button variant="outline">Go to Sales</Button>
      </Link>
    </div>
  );
}
```

---

## M9 — Delete unit silently fails when unit has transactions

**File:** `app/[locale]/(dashboard)/units/page.tsx` — `deleteUnit` function

**What happens:**  
If a unit has transactions, the database rejects the delete (foreign key constraint). The API returns an error, but the page ignores the response and just refreshes the list. The unit stays in place with no message to the user.

**Fix:**
```js
async function deleteUnit(id: string) {
  if (!confirm(tc("confirm"))) return;
  const res = await fetch(`/api/units/${id}`, {method: "DELETE"});
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    toast.error(data.error || "Cannot delete this unit. It may have active transactions.");
    return;
  }
  fetchUnits();
}
```

---

## M10 — Forms still use `alert()` for errors — Toaster is already installed

**Files:** `units/new/page.tsx`, `units/[id]/page.tsx`, `buyers/new/page.tsx`, `users/new/page.tsx`, `sales/new/page.tsx`

**What happens:**  
Error messages pop up as native browser `alert()` dialogs which block the thread, look out of place, and cannot be styled. The Sonner Toaster component is already added to the root layout and ready to use.

**Fix — replace every `alert(...)` with `toast.error(...)` or `toast.success(...)`:**
```js
// At the top of each file:
import { toast } from "sonner";

// Replace:
alert(data.error || tc("error"))
// With:
toast.error(data.error || tc("error"))

// And after successful form submit, before redirect:
toast.success("Unit created successfully")
router.push(`/${locale}/units`)
```

---

---

# 🔵 UX — Convert Cards to Tables

Cards are appropriate for visual/spatial data (units with type, price, bedrooms). They are the wrong pattern for administrative records where users need to scan fast, compare values, and find specific entries. The three pages below should be converted to tables. Everything else — data fetching, API calls, empty states, header buttons — stays the same.

---

## UX1 — Buyers page: convert from card grid to table

**File:** `app/[locale]/(dashboard)/buyers/page.tsx`

**Why cards are wrong here:**  
With 50+ buyers you need to scan by name, find by phone, or filter by nationality. Cards waste vertical space and make this impossible at a glance.

**New table columns:**

| Full Name | Phone | Email | Emirates ID | Nationality | Created |

**Notes:**
- `created_at` formatted with `.toLocaleDateString()`
- No actions column for now — edit/delete not yet in the API
- Keep the existing empty state card and loading spinner unchanged
- Keep the "New Buyer" button in the header unchanged

---

## UX2 — Projects page: convert from card grid to table

**File:** `app/[locale]/(dashboard)/projects/page.tsx`

**Why cards are wrong here:**  
Projects are few (5–20 typically) and purely administrative data. A table is faster to read and easier to extend with edit/delete actions later.

**New table columns:**

| Name | Location | Area | Status |

**Notes:**
- `status` shown as a `<Badge>` — `default` variant for `active`, `secondary` for anything else (same as current card badge logic)
- Keep the existing Dialog-based "New Project" button — it works and does not need to change
- Keep the existing empty state and loading spinner unchanged
- No actions column for now — no edit/delete endpoint exists in the API yet

---

## UX3 — Users page: convert from card grid to table

**File:** `app/[locale]/(dashboard)/users/page.tsx`

**Why cards are wrong here:**  
This is an admin management screen. Every SaaS admin panel uses tables for user management. Cards make role comparison slow and hide the information density you need.

**New table columns:**

| Full Name | Username | Email | Role | Status | Created |

**Notes:**
- Role: use `.replace(/_/g, ' ')` with the **global regex** `/g` — not `.replace("_", " ")` which only replaces the first underscore. Then capitalise first letter: `role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())`
- Status: `<Badge variant="default">Active</Badge>` or `<Badge variant="secondary">Inactive</Badge>` based on `user.is_active`
- `created_at` formatted with `.toLocaleDateString()`
- Keep the "Invite User" button in the header unchanged
- Keep the existing empty state and loading spinner unchanged
- No actions column for now — edit/deactivate not yet in the API
