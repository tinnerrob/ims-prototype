# IMS — Visual QA Checklist (T3, browser pass)

**Status:** Ready for a human/browser pass (this work cannot be verified in jsdom)
**Date:** 2026-09-09
**Specs:** extends `modal-design-spec.md` + `app-review-plan.md` Track 3.
**How to run:** `cd IMSdev && dotnet run`, then open http://localhost:5000/ (redirects to
`/ims-prototype/`). DevTools: clear `localStorage` keys `ims.store` + `ims.featureModules`
once, and hard-refresh. Tick boxes as you go; paste findings back here or into the audit matrix.

---

## 1. Shell & navigation (T3.2)
- [ ] Sidebar reads "Core" (Inventory, Movement & Custody) vs "Modules · Opt-in" vs "Administration" — clear visual separation.
- [ ] Topbar title/subtitle update per view; active nav item highlighted.
- [ ] Responsive: sidebar collapses to off-canvas ≤992px (`#menuToggle` opens it); tables scroll within their own container.
- [ ] Empty states (empty filters, no rows) render a clear "No records" message; no dead space or overflow.
- [ ] Notifications bell + global search route correctly (telemetry off → core fallback).

## 2. Cross-file T3 code targets (from the audit matrix)
- [ ] **`.kpi*` dedup:** `css/styles.css` flat `.kpi*` block vs `css/shared.css` gradient `.kpi*` (shared loads after → wins). Confirm intended look on invoicing/rerents/dashboard KPI cards, then delete the overridden styles.css block.
- [ ] **Inline `style=` → utilities (T3.1):** audit the ~25 static cosmetic ones (font-size 10/10.5/11/11.5/12px, font-weight 500, margins) across page files; replace with `text-xs`/`text-xs2`/`text-12`/`fw-*`/`mt-*`. **Leave** the dynamic geometry ones (scheduler timeline `left/width`, geo pins `top/left`, grid `grid-template-columns`) inline — they are per-element.
- [ ] **Boot-error panel** (router.js `bootError`) renders acceptably if you force an init error.

## 3. Modal visual pass (T3.4) — open each, confirm spec
For every modal below, check (from `modal-design-spec.md`): centered/right size, header (icon + title + `X`), body scrolls internally, footer pins with **Cancel/Close + primary `.btn-ims`**, grouped sections on long forms, no inline styles on chrome, first field focused, no horizontal page shift. Structural parts are already machine-checked in the gate — here you confirm the **look**.

| Area | Modal(s) to open |
|---|---|
| Orders/Parties | order detail, order editor (scheduler), customer/party view + edit |
| Items & Stock | serialized / bulk / consumable / part / labor view + edit; kit; attachment; extended-attributes |
| Item Hand-Off | New-Order / Check-Out wizard (`handoff-wiz.js`), return/check-in prompt |
| Allocations | schedule time, booking qty, overbook |
| Receiving | inspection add/edit, overage |
| Timesheets | punch clock, edit segment |
| Field Service | work order |
| Billing | invoice detail |
| Rentals | sub-rental (rerent) |
| Admin | tax config, overhead config, branch config, category add/rename |

## 4. Final record
- [ ] Confirm `npm run check` + `npm test` green after any visual code change.
- [ ] Update `app-review-audit.md` findings 4 & 7 (and per-file rows) to `[x]` as items are verified.
- [ ] Keep `AI-ONBOARDING.md` + `modal-design-spec.md` in sync if the modal spec changes.
