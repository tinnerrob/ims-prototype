# IMS — Next Session Seed (Handoff)

**Purpose:** A fresh session can continue from here without guesswork. Everything
is committed/pushed to `main`.

## Current state (verified)
- Inventory‑core first + opt‑in modules (P0–P5), terminology normalized
  (order/party/item/movement), item registry (P4‑D), module Config page +
  gating + dependency validation (P5/B), JSON store/API seam + persisted writes
  (Phase A), Phase C modal restyle **complete** (C3 chrome → C4 per‑modal →
  C5 open/close/save verified for every modal across all modules).
- **Column profiles (Track A) complete**: every data grid (inventory 6, parties &
  orders 2, yard, invoicing, categories, rerents, geo, pricing ×2, logistics,
  healthcare) renders through `js/grid.js` with per‑table hide/show + persistence
  (`ims.cols.<id>`). See `docs/architecture/column-profiles.md`.
- **Metadata registry + multi‑vertical (Track B) complete end‑to‑end**:
  `js/metadata.js` registry; `extended_attributes` JSONB bucket; HeavyEquipment
  registry fields relocated (`serial_vin/make/model/meter_hours/fuel_type`); a
  working 2nd **Healthcare** vertical catalog. See
  `docs/architecture/metadata-extended-attributes.md`.
- Latest work: multi‑vertical Healthcare catalog + docs/cleanup (see git log).
- All gates: `npm run check` (`node --check` every JS file) + `npm test`
  (jsdom suite: all views render, every modal + grid opens/saves/closes,
  store/persistence seam, metadata registry/relocation, healthcare round‑trip).

## Whole‑App Review 2026‑09‑09 — T1/T2 done, T3 structural done (see `app-review-plan.md`)
A full codebase review was executed in gated, one‑commit increments (all pushed):
- **T1 Clean & reuse:** removed the shadowed legacy New‑Order modal from
  `handoff.js` (relocated `taxRate()` → `common.js`); removed 6 dead top‑level
  defs (whole‑corpus scan now returns 0); stripped the default ASP.NET Razor
  scaffold (`Pages/*`) and reduced `Program.cs` to a minimal static host
  (product moves to **Angular + Wisej.net**); folded `dashboard.css` into
  `styles.css`; consolidated duplicate `opt()`/`_op` select‑option builders into
  one shared `opt()`.
- **T2 IMS‑first + module disconnect:** single‑source **`VIEWS` registry** in
  `router.js` (derives RENDER/TITLES/DESCRIPTIONS/MODULE_VIEW); gate now proves
  each of the 7 modules off → nav hidden + route falls back to dashboard + every
  core view still renders; recorded the two cross‑module referential reads as a
  documented exception; fixed stale `data.js` schema headers (party/order vocab).
- **T3 UI/modal (structural):** added a **modal‑consistency contract sweep** to
  the gate (role/aria, labelled title, footer Cancel + `.btn-ims`, no inline
  chrome style) and a **startup‑error surface** (no silent blank page — surfaced
  after a real incident caused by stale browser cache/persisted `localStorage`).
- **Docs added:** `docs/AI-ONBOARDING.md`, `docs/architecture/app-review-plan.md`,
  `docs/architecture/app-review-audit.md`, `docs/architecture/app-review-visual.md`.
- **Remaining (browser visual pass only):** `docs/architecture/app-review-visual.md`
  covers the `.kpi*` dedup (styles.css vs shared.css), remaining static inline‑
  style→utility conversions, shell/nav polish, and a full per‑modal visual review.
  Interactive action‑button reuse is deferred to that pass (handlers not
  click‑verifiable by the gate).


## Running a check gate (jsdom)
Load `index.html` (CDN scripts are skipped in tests), inline every local script
under `js`, stub `window.alert/scrollTo/bootstrap.Modal`, dispatch
`DOMContentLoaded`, then:
- render every view in `TITLES` (must not throw),
- open/close/save the modal under test,
- assert on `IMS` state / DOM.

## Phase C4 — modal restyle, in order (COMPLETE — each below committed with its own gate)
Base chrome (C3) is already in `shared.css`. Now work top‑down by usage. For each
modal: open it, apply the spec in `modal-design-spec.md`, remove inline
`style=` where a class expresses intent, group long forms into sections
(`.divider` + bold titles), align fields, keep Cancel + primary action, then
verify open/close/save.

1. **Generic builders (style once, benefit all):** `openRawModal`, `openFormModal`
   (`js/common.js`) — confirm they emit the spec structure (footer actions,
   header close, internal body scroll). Usually just polish + class alignment.
2. **Orders/Parties:** order detail (`orderDetailModal`), order editor
   (`openOrderModal`, scheduler), customer/party view+edit (`customerModal`,
   contracts).
3. **Items & Stock (inventory.js):** serialized/bulk/consumable/part/labor
   detail + edit; **kit modal**; **attachment modal** (long forms: group into
   sections, align columns, consistent Cancel/Save).
4. **Item Hand‑Off:** return/check‑in prompt (`hoCheckInModal`), issue/loan
   wizard panes (`handoff‑wiz.js`).
5. **Allocations (scheduler.js):** schedule time, booking qty, overbook.
6. **Receiving (yard.js):** inspection add/edit, overage preview.
7. **Timesheets:** punch clock, edit time segment.
8. **Field service:** work order modal.
9. **Billing:** invoice detail.
10. **Rentals:** sub‑rental (rerent) modal.
11. **Admin:** tax config, overhead config, branch config, category add/rename.

Each becomes one small commit with its own open/close/save check.

## After C4 → C5
Confirm every modal from the inventory opens/closes/saves and reads clearly.
**Done** — covered by the jsdom suite added during C4 (renders all 16 views and
opens/saves/closes each modal).

## Remaining roadmap
The whole‑app review (T1–T3) is done except the **browser visual pass**:
- Run the app (`cd IMSdev && dotnet run` → http://localhost:5000/) and work
  `docs/architecture/app-review-visual.md` — `.kpi*` dedup, inline‑style→utility
  cleanup, shell/nav polish, and open every modal to confirm the spec.
- Product direction: the current .NET host is a minimal static host to be
  **replaced by an Angular + Wisej.net** stack; the JSON `apiAdapter` seam and the
  `VIEWS`/module registry are the contracts to carry forward.

## Files/docs to rely on
- `docs/architecture/app-review-plan.md` — whole‑app review roadmap (master).
- `docs/architecture/app-review-audit.md` — per‑file/layer review matrix.
- `docs/architecture/app-review-visual.md` — browser visual QA checklist (remaining T3).
- `docs/AI-ONBOARDING.md` — zero‑context project overview for new agents.
- `docs/architecture/ims-optimization-plan.md` — earlier data/API/module roadmap.
- `docs/architecture/modal-design-spec.md` — modal spec + inventory.
- `docs/architecture/module-dependencies.md`, `api-adapter.md`,
  `p4-terminology-migration.md`, `ims-core-and-modules.md`.
