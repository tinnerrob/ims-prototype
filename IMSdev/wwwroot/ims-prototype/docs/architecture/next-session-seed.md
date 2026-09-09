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

## Then remaining roadmap
Phase C finish, then re‑run the full regression; revisit
`ims-optimization-plan.md` (Phase A‑3 item‑table writers, Phase B any leftover
entry points) as needed.

## Files/docs to rely on
- `docs/architecture/ims-optimization-plan.md` — master plan.
- `docs/architecture/modal-design-spec.md` — modal spec + inventory.
- `docs/architecture/module-dependencies.md`, `api-adapter.md`,
  `p4-terminology-migration.md`, `ims-core-and-modules.md`.
