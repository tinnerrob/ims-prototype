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
| `css/dashboard.css` | FIX | small (80 ln); confirm it even needs separate load vs styles.css | merge into styles.css | — | see T1.4 |
| `js/data.js` | PEND | seed-data orphan check | — | — | — |
| `js/common.js` | PEND | some helpers possibly unused | central reuse target (helpers/pricing/modals) | — | modal builders centralize spec |
| `js/grid.js` | PEND | — | shared table renderer (good) | — | column-profile persistence OK |
| `js/metadata.js` | PEND | — | registry (good) | vertical registry is cross-module by design | — |
| `js/store.js` | PEND | `update(idField…)` unused? check | repos are the write seam (good) | core-owned seam | — |
| `js/router.js` | PEND | TITLES/RENDER/MODULE_* duplicated in one spot | target: one declarative registry (T2.2) | manifest + gating present | — |
| `Pages/*` (ASP.NET Razor) | FIX | default .NET scaffold ("Welcome to ASP.NET" Index/Privacy) | none | — | decide strip vs future host (T1.2) |
| `Program.cs` | FIX | only `UseFileServer()` | — | — | trim if scaffold stripped |

## Page files (views)

| File / layer | Route | Status | Dead / stale | Reuse | Module disconnect | UI / modal |
|---|---|---|---|---|---|---|
| `pages/dashboard.js` | dashboard (core) | PEND | check KPI gating | — | must gate telemetry KPI (already) | — |
| `pages/inventory.js` | inventory (core) | PEND | — | grids near-identical (bulk/consumable/parts) | — | many modals; re-audit spec |
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
2. **ASP.NET Razor scaffold (FIX):** default template dead weight vs the static SPA;
   owner decision on strip-vs-keep.
3. **CSS consolidation (FIX):** `dashboard.css` (and overlaps in `styles.css`) → token
   consolidation into one theme.
4. **Inline `style=` audit (FIX):** **75** occurrences across 14 page files —
   worst: scheduler.js (21), timesheet.js (11), geo.js (11), inventory.js (8).
   Each is a candidate for a token/utility class (T3.1/T3.4.2).
5. **Modal a11y contract check (T3.4):** `role="dialog"`/`aria-modal` present in
   the shared builders (`common.js`) but worth an automated assertion across every
   emitted modal; `.btn-ims` primary used ~29× (footer-consistency lint).

