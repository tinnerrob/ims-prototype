# IMS — Optimization, Data/API, Module Config & Modal Restyle Plan

**Status:** Approved scope / roadmap
**Date:** 2026‑09‑08
**Owner:** Product & Architecture

## Update (2026‑09‑09) — execution status vs. this roadmap
Checkboxes below were refreshed to match what is actually committed/pushed on
`main` (previously several were still marked open even though the work landed).
Status key: `[x]` = shipped, `[~]` = partial, `[ ]` = not started.
- **Phase A**: `store.js` scaffold + typed repositories, change events, the
  `apiAdapter` contract, and localStorage persistence landed. Writes are routed
  through repositories for parties/orders/movements/labor **and** the inventory
  item catalog + settings/rental collections (A‑3); persistence snapshots the
  full seeded table set with auto‑save (A‑4).
- **Phase B**: dependency/impact audit, Config page, toggle persistence,
  nav/router + telemetry gating, and dependency validation all shipped.
- **Phase C**: modal restyle shipped end‑to‑end (C3 chrome → C4 per‑modal → C5
  open/close/save verified); see `modal-design-spec.md` completion notes.
- The per‑change gate (syntax `node --check` + a jsdom render/modal suite) has
  been run ad‑hoc; it is **not** committed to the repo (no `package.json` yet).

## 1. Context / where we are
- Inventory‑core first, opt‑in modules (P0–P5 done & pushed).
- Terminology normalized to order/party/item/movement.
- Reads centralized on `IMS.itemRegistry`; writes for parties/orders/movements
  and the item catalog + settings/rental collections go through `IMS.store`
  repositories; only a few in‑place field updates (stock/status bookkeeping)
  still mutate records directly.
- JSON persistence (localStorage behind `IMS.store`) snapshots the full seeded
  table set with auto‑save on repo change events.
- Module manifest exists with a Config UI, toggle persistence, and gating.
- Modals restyled to a single modern spec (Phase C done).

## 2. Goals
1. Make data management a clean, JSON‑based, API‑ready layer.
2. Guarantee modules are truly independent (off‑states never break core).
3. Ship a **Config page** to toggle modules, persisted, dependency‑aware.
4. Restyle **all modals** to one clean, modern, readable design (deep per‑modal pass).

## 3. Phase A — JSON data layer + API seam
**Aim:** keep plain JSON, centralize state access so a real API can replace it.

- [x] A1. Store/service scaffold (`js/store.js`) owns typed repositories over the
      core JSON tables; wired: `parties`, `orders`, `movements`, `labor`.
- [x] A2. Repositories expose `list/get/create/update/remove` + change events —
      in‑memory today, backable by `apiAdapter` JSON tomorrow.
- [x] A3. Writes routed through repositories across the domain: parties / orders /
      movements / labor, the inventory item catalog (serialized/bulk/consumable/
      part/kit/attachment), settings (branches, tax schedules, overheads,
      categories per type), and rentals. (A few in‑place field updates for
      stock/status bookkeeping still mutate records directly — convert to
      `repo.update` if a change event is required.)
- [x] A4. Persistence plugin: `save()`/`hydrate()` snapshot the full seeded table
      set behind the store (versioned `_v=2`); repo change events auto‑save.
- [x] A5. `apiAdapter` interface + contract documented (`api-adapter.md`).
- [x] Gate: all views render; create/edit/remove flows write through repos; JSON
      round‑trip (save → reload) is lossless for the persisted set.

## 4. Phase B — Module independence + Config page
**Aim:** each feature is a true module; turning one off never breaks another.

- [x] B1. **Dependency/impact audit** → `module-dependencies.md` + a table mapping
      each module's nav, routes, badges, notification hooks, sim loops, and any
      data it injects into other views.
- [x] B2. Manifest carries `label, description` (router `MODULE_META`) + per‑view
      module mapping; dependency relationships documented and enforced (B6).
- [x] B3. **Config page** (Administration > Modules): list core vs modules with
      on/off toggles, dependency badges, and a warning when an off‑state would
      orphan another feature.
- [x] B4. **Persist toggles** to localStorage (`ims.featureModules`).
- [x] B5. Gate **every** entry point by the manifest — router/nav, notifications
      bell, global search, dashboard KPI cards, and module sim intervals.
- [x] B6. Enforce dependency validation on apply (reject/cascade with confirm).
- [x] Gate: with a module off, core renders and empty/graceful states show; with
      all modules on, nothing regresses (view suite).

## 5. Phase C — Modal restyle (deep dive)
**Aim:** clean, easy to read, modern; one system-wide spec, then per‑modal.

- [x] C1. Write the **modal design spec** (shared tokens): header/title/icon,
      body spacing, footer alignment, form field rhythm, action button hierarchy,
      focus order, scroll behavior, min widths.
- [x] C2. Inventory **all modals** by origin module (raw vs form vs detail) and
      open each to audit readability/structure. Examples known:
      openRawModal/openFormModal (common), order/contract modal (scheduler),
      item view + edit modals (inventory), rental/issue wizard (handoff‑wiz),
      timesheet punch/segment, inspection, pricing/tax/overhead, work order,
      customer/party, invoice detail, branch config, category, etc.
- [x] C3. Centralize base modal chrome in `shared.css` (radius, shadow, backdrop,
      motion, internal body scroll + persistent footer).
- [x] C4. Per‑modal cleanup: replace inline styles with classes, align labels/
      inputs, group long forms into sections, set primary/secondary actions,
      consistent Cancel/Close, empty/loading states.
- [x] C5. Confirm each modal still opens/closes + saves (interactive/jsdob flow
      per modal).
- [x] Gate: every modal renders open, reads clearly, and its actions work; modal
      inline `style=` hints moved to utilities (text‑xs/xs2/12, mt‑*) where a
      class can express intent. See `modal-design-spec.md` completion notes.

## 6. Non‑negotiables
- Core owns shared data/helpers; modules only consume core or declared deps.
- JSON is the only data shape; no DOM‑backed state.
- Each change ships gated (syntax + 15‑view jsdom + relevant flow).
- No alias layer — names are the real domain terms.

## 7. Suggested execution order
Phase B‑1 (audit + Config UX) → Phase A (data service + API seam) →
Phase C (modal spec + per‑modal restyle) → B‑3..B‑6 (Config build/gating).

> Executed as suggested above (B1 → A → C → B3‑B6), and Phase A‑3/A‑4 closed
> out (2026‑09‑09) with item catalog + settings/rental writers routed through
> repositories and full‑set JSON persistence with auto‑save. Open/optional next:
> commit the jsdom gate as a `package.json` harness, and migrate any remaining
> in‑place stock/status field updates onto `repo.update` if a change event is
> required.
