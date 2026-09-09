# IMS — Whole-App Review Audit Matrix

**Status:** In progress (living doc — one row per file/layer)
**Date:** 2026-09-09
**Owner:** Product & Architecture
**Master roadmap:** `app-review-plan.md` (Tracks 1–4)

This is the backbone of the whole-app review. Every file/layer gets a row
tracking dead code, reuse opportunity, module-disconnect, and UI/modal notes.
A `[ ]` status means the detailed per-file pass (T1.0) is still pending; rows
with findings are updated as passes land.

**Legend — status:** `OK` reviewed, no action · `FIX` needs work (see notes) ·
`PEND` not yet deep-reviewed.

---

## Shell & shared foundation

| File / layer | Status | Dead / stale code | Reuse opportunity | Module disconnect | UI / modal notes |
|---|---|---|---|---|---|
| `index.html` | PEND | — | — | — | Shell/nav IA to modernize (Core vs Modules grouping) |
| `css/styles.css` | PEND | overlaps w/ shared.css | consolidate tokens | — | large; token audit needed |
| `css/shared.css` | PEND | — | shared modal/component chrome | — | keep as modal/component spec home |
| `css/dashboard.css` | FIX→done (T1.4) | removed — bento/page layer **folded into `styles.css`** (order-preserved); shared.css kept as component-chrome home | merge into styles.css (done) | — | token source stays in styles.css :root |
| `js/data.js` | PEND | seed-data orphan check | — | — | — |
| `js/common.js` | PEND | some helpers possibly unused | central reuse target (helpers/pricing/modals) | — | modal builders centralize spec |
| `js/grid.js` | PEND | — | shared table renderer (good) | — | column-profile persistence OK |
| `js/metadata.js` | PEND | — | registry (good) | vertical registry is cross-module by design | — |
| `js/store.js` | PEND | `update(idField…)` unused? check | repos are the write seam (good) | core-owned seam | — |
| `js/router.js` | PEND→done (T2.2) | legacy TITLES/RENDER/DESCRIPTIONS/MODULE_VIEW → **single `VIEWS` registry** (derived maps kept) | one declarative registry (done) | manifest + gating present | — |
| `Pages/*` (ASP.NET Razor) | FIX→done (T1.2) | **removed** (default .NET scaffold "Welcome to ASP.NET" Index/Privacy) | none | — | moving to Angular + Wisej.net — scaffold stripped |
| `Program.cs` | FIX→done (T1.2) | rewritten as minimal static host (no Razor); `/` redirects to `/ims-prototype/` | — | — | future Angular + Wisej.net replaces it (documented in header) |

## Page files (views)

| File / layer | Route | Status | Dead / stale | Reuse | Module disconnect | UI / modal |
|---|---|---|---|---|---|---|
| `pages/dashboard.js` | dashboard (core) | PEND | check KPI gating | — | must gate telemetry KPI (already) | — |
| `pages/inventory.js` | inventory (core) | PEND | — | grids near-identical (bulk/consumable/parts) | referential reads of `workOrders`/`timesheets` for detail views — see finding 8 | many modals; re-audit spec |
| `pages/healthcare.js` | inventory medical tab | PEND | — | registry-driven (good) | vertical-specific (by design) | — |
| `pages/contracts.js` | orders (core) | PEND | — | — | — | party/order modals |
| `pages/handoff.js` | handoff (core) | FIX→done (T1) | **legacy `openNewRentalModal`/`createRentalFromModal` + `rn*` modal removed** (was shadowed by handoff-wiz.js); `taxRate()` relocated to `common.js`; kept hoCheckOut/In + custody + day board | hoist needed helpers (done: taxRate) | custody is core (loan is one movement kind) | wizard owns New-Order modal |
| `pages/handoff-wiz.js` | handoff (core) | PEND | overrides handoff.js entry (by design) | multi-step wizard (good) | — | wizard modals conform |
| `pages/scheduler.js` | scheduler (module: scheduling) | PEND | — | — | must be module-gated (yes) | board layout |
| `pages/geo.js` | geo (module: telemetry) | PEND | — | — | sim loop + badge gated | — |
| `pages/logistics.js` | logistics (module) | PEND | — | — | gated | — |
| `pages/maintenance.js` | maintenance (module) | PEND | — | — | gated | work-order modal |
| `pages/timesheet.js` | timesheet (module) | PEND | — | — | gated | punch/segment modals |
| `pages/yard.js` | yard (core) | PEND | — | — | — | inspection modal |
| `pages/invoicing.js` | invoicing (module) | PEND | — | — | gated | invoice detail modal |
| `pages/rerents.js` | rerents (module) | PEND | — | — | gated | — |
| `pages/branches.js` | branches (core) | PEND | — | — | — | — |
| `pages/pricing.js` | pricing (policies) | PEND | — | — | — | tax/overhead modals |
| `pages/categories.js` | categories (core) | PEND | — | — | — | — |
| `pages/config.js` | config (admin) | PEND | — | — | module toggles (good) | — |

## Test harness & docs

| File | Status | Notes |
|---|---|---|
| `test/gate.js` | OK | jsdom suite: views render, modals open/save/close, store/metadata. **Add module-off proofs (T2.3) + modal-contract assertions (T3.4.2).** |
| `test/lint.js` | OK | `node --check` all JS |
| `docs/AI-ONBOARDING.md` | OK (new) | Track 4 deliverable |
| `docs/architecture/app-review-plan.md` | OK (new) | Master roadmap |
| `docs/architecture/*.md` (specs) | OK | existing specs referenced, not duplicated |

---

## Known findings (highest-confidence, queued)
1. **[x] `handoff.js` dead entry (FIXED, T1):** legacy single-scroll New-Order modal
   (`openNewRentalModal`, `createRentalFromModal` + `rn*` helpers) removed — it was
   shadowed by `handoff-wiz.js`. Shared `taxRate()` relocated to `common.js`. Gates green.
2. **[x] Dead-code sweep (FIXED, T1):** removed six top-level defs referenced nowhere
   else (whole-corpus scan): `blockMs` + `globalBookedQty` (scheduler.js),
   `hoScheduledIds` + `mvKindLabel` (handoff.js), `labInspectorHTML` (timesheet.js),
   `getMedical` (healthcare.js). Re-scan = 0 candidates. Gates green.
3. **[x] ASP.NET Razor scaffold (FIXED, T1.2):** `Pages/*` removed + `Program.cs` reduced
   to a minimal static host (`/` redirects to `/ims-prototype/`). Product moves to
   Angular + Wisej.net, so the .NET host is preview-only. Build + runtime smoke OK.
4. **[x] CSS consolidation — dashboard.css folded into `styles.css` (FIXED, T1.4):** single file for tokens/layout; shared.css kept as component-chrome home. Remaining: styles.css `.kpi*` block vs shared.css `.kpi*` gradient re-definitions overlap → needs **browser visual QA** before dedup (T3 candidate, flagged in shared.css row).
5. **[x] Reuse: option-builder consolidation (FIXED, T1.3):** duplicate `opt` (inventory.js) / `_op` (healthcare.js) select-option builders → single shared `opt` in `common.js`. Gates green. Further builder extraction deferred to T3 (settled UI).
6. **Inline `style=` audit (FIX):** **75** occurrences across 14 page files —
   worst: scheduler.js (21), timesheet.js (11), geo.js (11), inventory.js (8).
   Each is a candidate for a token/utility class (T3.1/T3.4.2).
7. **Modal a11y contract (T3.4):** gate now asserts on representative real modals
   (inventory serialized, customer edit, yard inspection): `role=dialog`/`aria-modal`,
   `aria-labelledby`→title, footer has Cancel + `.btn-ims` primary, no inline style on
   chrome. **[x] machine-checked.** Remaining T3 is visual: sweep every modal in
   `modal-design-spec.md`, restyle non-conforming ones, `.kpi*` dedup + shell/tokens
   (needs browser QA).
8. **[T2.0] Cross-module referential reads (documented exception):** core `inventory.js`
   reads `workOrders` (service) + `timesheets` (labor) to show related-item counts in
   detail views; labor `timesheet.js` reads `workOrders` (service) for clock-in targets.
   All module tables are seeded in core regardless of module toggle, so toggling a module
   UI off never breaks these reads (proved by the T2.3 gate). For the future Angular/Wisej
   backend these cross-feature references should be explicit model relationships (or moved
   behind a declared `requires[]`), not implicit global-table reads.
9. **[x] T2.2 + T2.3 (done):** single-source `VIEWS` registry in `router.js` (derives
   RENDER/TITLES/DESCRIPTIONS/MODULE_VIEW); gate now proves each module off → nav hidden,
   route falls back to dashboard, and every core view renders. Gates green.
10. **[T2.4] Vocabulary audit (PARTIAL):** core UI + seed copy still carries domain terms
    `rental`/`contract`/`customer`/`Check-Out` (domain-appropriate for the active rental
    vertical; not renamed). Fixed the factually-wrong **stale `data.js` schema headers**
    (`customers`→`parties`, `contract_id`→`orderId`/`partyId`, snake_case→live camelCase) for
    parties/orders/inspections/dispatches/cycle_invoices/re_rents. Full copy normalization is
    deferred to the Angular/Wisej migration (fresh model) rather than churning prototype UI.
11. **[T1.3] Remaining reuse deferred:** leftover duplication is **interactive action-button /
    page-header markup** whose handlers the gate renders but can't click-verify; blind refactor
    risks silent regressions. Extract during the browser visual pass (`app-review-visual.md`).

