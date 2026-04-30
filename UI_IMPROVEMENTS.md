# Plinth — UI/UX Improvement Plan

**Review date:** 2026-04-30  
**Scope:** All pages, components, and flows — purely UX/UI improvements, not bug fixes  
**Total items:** 38

---

## Priority Levels

| Priority | Meaning |
|----------|---------|
| 🔴 P1 | Core usability — users will struggle without this |
| 🟠 P2 | Noticeable gap — users expect this in any SaaS product |
| 🟡 P3 | Polish — makes the product feel complete and professional |

---

---

# 🔴 P1 — Core Usability

---

## U1 — No search or filter on any list page

**Affected pages:** Units, Sales, Buyers, Users, Handovers, Terminations, Approvals

Every list page loads all records and offers no way to search, filter, or sort. With even a moderate amount of data this becomes unusable.

**Recommended additions per page:**

| Page | Filters needed |
|------|----------------|
| Units | Search by unit number, filter by status, filter by project |
| Sales | Search by buyer name or unit, filter by status |
| Buyers | Search by name, phone, or Emirates ID |
| Users | Filter by role, filter by active/inactive |
| Handovers | Filter by status |
| Terminations | Filter by status |
| Approvals | Already filtered (pending / history) — add search by unit number |

---

## U2 — No pagination — all data loads at once

**Affected pages:** All list pages

All list queries have no `LIMIT`/`OFFSET`. As data grows, pages will load slowly or time out. The dashboard stats query also runs 9 separate SQL queries on every page load.

**Recommended approach:**
- Add server-side pagination (page size 20–50) with a simple "Load more" button or numbered pages
- For the dashboard stats, combine into fewer queries

---

## U3 — Forms use `alert()` for errors — feels broken in a modern app

**Affected pages:** `units/new`, `units/[id]`, `sales/new`, `buyers/new`, `users/new`

Every form uses:
```js
alert(tc("error"))          // or
alert(data.error || ...)
```
Browser `alert()` blocks the thread, looks out of place, and provides no styling. The app already has the `sonner` toast library installed but unused in forms.

**Fix:** Replace every `alert()` with a `toast.error(message)` call using the already-installed Sonner. Add `<Toaster />` to the root layout if not already present.

---

## U4 — No success feedback after creating or saving anything

**Affected pages:** All create/edit forms

After a successful form submission the app silently redirects. Users have no confirmation that their action worked.

**Fix:** Show a success toast before or after redirect:
```js
toast.success("Unit created successfully");
router.push(`/${locale}/units`);
```

---

## U5 — Total price field on new sale form does not auto-fill from selected unit

**File:** `app/[locale]/(dashboard)/sales/new/page.tsx`

When a unit is selected from the dropdown, its price is shown (`AED 1,200,000`) but the "Total Price" input field stays blank. The user has to manually type the price again, risking mismatches.

**Fix:** When a unit is selected, auto-populate `totalPrice` from the unit's price:
```js
onValueChange={(v) => {
  const unit = units.find(u => u.id === v);
  setForm({ ...form, unitId: v, totalPrice: unit?.price?.toString() || "" });
}}
```

---

## U6 — No way to create or manage payment plans from the UI

**File:** `app/api/payment-plans/route.ts` (GET only, no POST)

The "New Transaction" form has a payment plan selector, but there is no UI to create payment plans. The only way to have plans in the system is via the seed script. If the seed hasn't been run or a custom plan is needed, the dropdown is empty with no explanation.

**Fix:** Add a payment plans management page (or a modal on the projects/settings page) with a POST endpoint to create/edit plans.

---

## U7 — No edit or delete for buyers

**File:** `app/[locale]/(dashboard)/buyers/page.tsx`

The buyers list shows cards with contact info but has no edit or delete button. Typos in names, phone numbers, or Emirates IDs cannot be corrected through the UI.

**Fix:** Add an edit form (reuse the new buyer form) and a delete confirmation.

---

## U8 — No edit or delete for projects

**File:** `app/[locale]/(dashboard)/projects/page.tsx`

Same as buyers — projects can be created via dialog but not renamed, relocated, or deleted. The API has no PATCH or DELETE endpoint for projects either.

**Fix:** Add edit (name, location, area) and delete (with "cannot delete if units exist" guard) to both the API and UI.

---

---

# 🟠 P2 — Expected in any SaaS product

---

## U9 — Notes inputs use single-line `<Input>` — should be `<Textarea>`

**Files:** `sales/new/page.tsx`, `sales/[id]/page.tsx` (notes), `handovers/[id]/page.tsx` (inspection notes)

Notes fields are rendered as `<Input className="h-11" />` — a single-line text field. Notes are typically multi-line content.

**Fix:** Replace with `<Textarea rows={3} />` (shadcn/ui `textarea` component).

---

## U10 — Financial statement has a Download icon with no functionality

**File:** `app/[locale]/(dashboard)/financial-statement/page.tsx` line 15

The `Download` icon is imported from lucide-react but never rendered in the JSX. There is no export or print capability despite the financial statement being a document users will want to save.

**Fix:** Either implement a print view (`window.print()` with a print stylesheet) or PDF export, or remove the import if not planned.

---

## U11 — No breadcrumb or contextual navigation

**Affected pages:** `units/[id]`, `sales/[id]`, `handovers/[id]`, `terminations/[id]`

Detail pages only have a back arrow. There is no indication of where you are in the hierarchy (e.g. "Units / Villa A-101") and no way to jump to related records without going back.

**Fix:** Add a simple breadcrumb component above the page title showing the section and record name. Link each segment.

---

## U12 — Transaction detail page has no links to related records

**File:** `app/[locale]/(dashboard)/sales/[id]/page.tsx`

The transaction detail shows buyer name, unit number, and agent name as plain text. There is no way to click through to the buyer profile, unit detail, or agent profile from this page.

**Fix:** Make buyer name, unit number, and agent name into links:
```jsx
<Link href={`/${locale}/units/${transaction.unit_id}`}>{transaction.unit_number}</Link>
```

---

## U13 — Unit detail page does not show images or features despite schema support

**File:** `app/[locale]/(dashboard)/units/[id]/page.tsx`

The `units` table has `images JSONB` and `features JSONB` columns. Neither is shown in the unit detail view or edit form. The new unit form also has no way to add images or features.

**Fix:** Add an images gallery section (even a placeholder "upload images" area) and a features tag input to the unit detail/edit page.

---

## U14 — Documents section in financial statement shows files but has no upload UI anywhere

**File:** `app/[locale]/(dashboard)/financial-statement/page.tsx`

The financial statement lists documents (contracts, ID copies, receipts, etc.) but there is no upload button anywhere in the platform. The `documents` table and API route exist but no UI connects to them.

**Fix:** Add a document upload section to the financial statement or sales detail page. Even a simple file input that calls `POST /api/documents` (needs to be created) would unblock this.

---

## U15 — No audit log viewer

The `audit_logs` table is defined in the schema, but no API endpoint reads from it and no UI displays it. Admins have no way to see who did what and when.

**Fix:** Add a simple `GET /api/audit-logs` endpoint and an "Activity" tab or page showing recent actions (entity type, action, user, timestamp).

---

## U16 — Pipeline bar chart uses arbitrary width calculation

**File:** `app/[locale]/(dashboard)/page.tsx` line 228

```js
style={{ width: `${Math.min(value * 10, 100)}%` }}
```
This makes 10 items = 100% width, which is completely arbitrary and misleading. With 11+ confirmed sales the bars are all maxed at 100%.

**Fix:** Calculate the width relative to the total across all statuses:
```js
const total = (stats?.sales?.eoi_count || 0) + (stats?.sales?.booking_pending_count || 0) + ...;
style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }}
```

---

## U17 — Termination "Terminate" button on sale detail has no confirmation dialog

**File:** `app/[locale]/(dashboard)/sales/[id]/page.tsx` lines 165–183

Clicking "Terminate" immediately fires the API call with no confirmation step. Terminating a transaction is irreversible — it updates the transaction and unit status and creates DLD steps.

**Fix:** Add a confirmation dialog (shadcn `AlertDialog`) before the termination API call:
```
"Are you sure you want to terminate this transaction? This will initiate the DLD termination process and cannot be undone."
```

---

## U18 — Mobile sidebar does not close after navigating to a page

**File:** `components/layout/sidebar.tsx` — Sheet component

The mobile sidebar uses a shadcn `Sheet`. After tapping a navigation link, the sheet stays open and the user has to manually close it. This breaks the expected mobile navigation pattern.

**Fix:** Track open state and close the sheet on link click:
```jsx
const [open, setOpen] = useState(false);
// Pass open/onOpenChange to Sheet
// Wrap NavItem links to call setOpen(false) on click
```

---

## U19 — No user profile or settings page

The sidebar shows the logged-in user's name and role but there is no way to change the password, update the name, or manage account settings. There is no `/settings` or `/profile` route.

**Fix:** Add a `/settings` or `/profile` page with at minimum:
- Change password form
- Update full name / email
- Theme preference (currently only available via the toggle, not persisted)

---

## U20 — Approvals page does not auto-refresh after action

**File:** `app/[locale]/(dashboard)/approvals/page.tsx` lines 38–45

After clicking Approve or Reject, `loadApprovals()` is called to reload the list. This is correct, but there is no loading state during the review action — the buttons stay active and the user can click again while the request is in flight, potentially double-submitting.

**Fix:** Add a loading/disabled state to the approve/reject buttons while the PATCH request is pending.

---

## U21 — Sales list has no date column

**File:** `app/[locale]/(dashboard)/sales/page.tsx`

The transactions list shows buyer, unit, status, and price, but no creation date. Users cannot tell if a transaction is from today or six months ago without opening it.

**Fix:** Add a `created_at` column to the list, formatted as a relative date ("2 days ago") or short date.

---

## U22 — Buyer profile has no transaction history

**File:** `app/[locale]/(dashboard)/buyers/page.tsx`

The buyers list shows contact info only. There is no way to see how many transactions a buyer has, or navigate to their purchase history, without going to the sales page and searching manually.

**Fix:** Add a transaction count badge to each buyer card and a "View Transactions" link that navigates to the sales page filtered by buyer.

---

## U23 — `Passport Number` field on new buyer form is in the API but missing from the UI

**File:** `app/[locale]/(dashboard)/buyers/new/page.tsx`

The `buyers` table has a `passport_number` column. The API accepts `passportNumber`. The new buyer form has Emirates ID, Nationality, and Address, but no Passport Number field. UAE buyers often use passport number as their primary ID.

**Fix:** Add a Passport Number field to the new buyer form next to Emirates ID.

---

---

# 🟡 P3 — Polish

---

## U24 — Status badge colors use hardcoded Tailwind classes that break in dark mode

**File:** `app/[locale]/(dashboard)/sales/page.tsx` lines 19–25

```js
eoi: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20",
```
These are defined as card background colors but the badge colors (`statusColors`) map to non-existent shadcn variants like `"warning"` and `"success"` which are not in the default shadcn/ui Badge component. The badges will silently fall back to the `secondary` variant and show grey for all statuses.

**Fix:** Either extend the Badge component with custom `warning` and `success` variants, or map to existing variants with inline class overrides.

---

## U25 — `role` display uses `replace("_", " ")` — only replaces the first underscore

**Files:** `components/layout/sidebar.tsx:169`, `users/page.tsx:91`

```js
user.role?.replace("_", " ")      // "project_manager" → "project manager" ✓
user.role.replace(/_/g, " ")      // correct: use regex with global flag
```
`String.replace("_", " ")` only replaces the first underscore. `project_manager` becomes `project manager` (fine), but future roles with multiple underscores would only have the first one replaced.

**Fix:** Use the global regex: `user.role.replace(/_/g, " ")`

---

## U26 — Empty states on Handovers and Terminations have no actionable CTA

**Files:** `handovers/page.tsx:71-73`, `terminations/page.tsx:51-53`

Both show:
```
"No handovers found. Create one from a confirmed transaction."
"No termination cases found. Create one from a transaction."
```
These are instructional but the user has to remember to go to Sales, find a confirmed transaction, and start from there. There is no link to help them.

**Fix:**
```jsx
<p className="text-muted-foreground">No handovers yet.</p>
<Link href={`/${locale}/sales`}>
  <Button variant="outline" size="sm">Go to Sales</Button>
</Link>
```

---

## U27 — Buyer portal is extremely sparse — missing payment plan milestones

**File:** `app/[locale]/portal/[token]/page.tsx`

The portal API returns `payment_plan_milestones` but the page doesn't display them. The buyer can see their payment history but has no way to see when future installments are due.

**Fix:** Add a "Payment Schedule" section to the portal page that renders each milestone from `transaction.payment_plan_milestones` with its due date calculated from `booking_date` + `due_days_from_booking`.

---

## U28 — Portal page has no Plinth branding beyond a text heading

**File:** `app/[locale]/portal/[token]/page.tsx` lines 41–43

The portal just shows the text "Plinth" and "Buyer Portal". The buyer-facing portal is a branding touchpoint that should look polished.

**Fix:** Add the same logo/icon used in the sidebar, a branded header background, and the property project name prominently.

---

## U29 — Termination step fields fire individual API calls on every blur

**File:** `app/[locale]/(dashboard)/terminations/[id]/page.tsx` lines 157–200

Each field (notice date, notice method, courier tracking, receipt date, notes) calls `updateStep(step.id, { field: value })` independently on `onBlur`. Filling in all 5 fields fires 5 separate PATCH requests.

**Fix:** Group all step fields in local state and add a single "Save Step Details" button that sends one PATCH with all changed fields.

---

## U30 — No loading skeleton — pages flash blank before data loads

**Affected pages:** All list and detail pages

Pages show a spinner or "Loading..." text while fetching. A content skeleton (placeholder shimmer matching the page layout) would feel much more polished and reduce perceived load time.

**Fix:** Use shadcn's `Skeleton` component to build per-page skeletons matching the expected content shape.

---

## U31 — Unit status can be manually changed to any value in the edit form

**File:** `app/[locale]/(dashboard)/units/[id]/page.tsx` lines 123–135

The edit form lets any user with edit access set the unit status to `pre_booked`, `booked`, `handed_over`, or `terminated` directly. These statuses should only be set by the system as a result of transactions, handovers, or terminations — not by manual edit.

**Fix:** In the edit form, restrict status options to `draft` and `available`. Workflow statuses should be read-only in the unit edit form.

---

## U32 — Snagging ticket severity selector uses a raw HTML `<select>`

**File:** `app/[locale]/(dashboard)/handovers/[id]/page.tsx` lines 258–265

The "New Snagging Ticket" dialog uses a plain HTML `<select>` element while the rest of the form uses shadcn `<Select>`. This is visually inconsistent — the native select looks different in every browser and doesn't match the design system.

**Fix:** Replace with shadcn `<Select>` component.

---

## U33 — Projects page `Table` import is unused — page uses card grid instead

**File:** `app/[locale]/(dashboard)/projects/page.tsx` lines 19–25

The page imports `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` from the UI library but renders a card grid layout instead. The imports are dead code.

**Fix:** Remove the unused table imports.

---

## U34 — `financial-statement` page shows "Transaction ID required" as plain text with no redirect

**File:** `app/[locale]/(dashboard)/financial-statement/page.tsx` lines 34–36

```jsx
if (!transactionId) {
  return <div className="text-center py-8">Transaction ID required</div>;
}
```
If a user navigates directly to `/financial-statement` without a `?transaction_id=` parameter, they see a centered text message with no way forward. This is a dead end.

**Fix:** Redirect to the sales page or show a prompt with a link:
```jsx
return (
  <div className="text-center py-16">
    <p className="text-muted-foreground">Select a transaction to view its statement.</p>
    <Link href={`/${locale}/sales`}><Button className="mt-4">Go to Sales</Button></Link>
  </div>
);
```

---

## U35 — Request Approval button on unit detail has no loading state or success message

**File:** `app/[locale]/(dashboard)/units/[id]/page.tsx` lines 168–180

```jsx
<Button variant="outline" onClick={async () => {
  const res = await fetch("/api/unit-approvals", { ... });
  if (res.ok) alert("Approval requested!");
}}>
  Request Approval
</Button>
```
Uses an `alert()`, no loading spinner during the request, no error handling if the request fails.

**Fix:** Add a loading state to the button and replace `alert()` with a Sonner toast.

---

## U36 — Approve/Reject actions on approvals page have no confirmation

**File:** `app/[locale]/(dashboard)/approvals/page.tsx` lines 91–109

Clicking "Approve" or "Reject" immediately fires the PATCH. Approving a unit publishes it to `available` status and sends an email. Rejecting sends a different email. Both are consequential and should be confirmed.

**Fix:** Add an `AlertDialog` confirmation step before submitting the review action.

---

## U37 — Dark mode — status background colors on sales cards use light-only classes

**File:** `app/[locale]/(dashboard)/sales/page.tsx` lines 19–25

```js
eoi: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20",
confirmed: "bg-green-50 border-green-200 dark:bg-green-950/20",
```
The `eoi` and other statuses have dark mode overrides, which is good. But `cancelled` and `terminated` both map to `"bg-red-50 border-red-200 dark:bg-red-950/20"` — no dark mode class for the border color. Minor inconsistency.

**Fix:** Add dark mode border classes to all status entries.

---

## U38 — No `<title>` or `<meta>` tags on dashboard pages — browser tabs all show "Plinth"

**File:** `app/[locale]/layout.tsx`

There is a root metadata export in `en.json` (`metadata.title`) but no per-page `metadata` exports. Every page tab shows "Plinth - Real Estate Project Management" regardless of what page is open.

**Fix:** Add per-page metadata exports to the server layout or use Next.js `generateMetadata` in each page for context-aware tab titles like "Sales | Plinth" or "Unit A-101 | Plinth".

---

---

# Appendix — Pages with Most Issues

| Page | Issues |
|------|--------|
| `sales/[id]/page.tsx` | U3, U4, U10, U12, U17 |
| `units/[id]/page.tsx` | U3, U4, U13, U31, U35 |
| All list pages | U1, U2, U21 |
| `handovers/[id]/page.tsx` | U29, U32 |
| `terminations/[id]/page.tsx` | U29 |
| `financial-statement/page.tsx` | U10, U14, U34 |
| `portal/[token]/page.tsx` | U27, U28 |
| `approvals/page.tsx` | U20, U36 |
| `buyers` | U7, U22, U23 |
| `projects` | U8, U33 |
| Layout / Global | U3, U4, U18, U19, U38 |
