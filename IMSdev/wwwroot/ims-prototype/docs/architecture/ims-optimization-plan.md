# IMS — Optimization, Data/API, Module Config & Modal Restyle Plan

**Status:** Approved scope / roadmap
**Date:** 2026‑09‑08
**Owner:** Product & Architecture

## 1. Context / where we are
- Inventory‑core first, opt‑in modules (P0–P5 done & pushed).
- Terminology normalized to order/party/item/movement.
- Reads centralized on `IMS.itemRegistry`; writes still direct to global `IMS.*`.
- **No persistence** and no API seam; state lives on a global `IMS` JSON object.
- Module manifest exists (P5) but has no Config UI, no persistence, and not every
  entry point is gated.
- Modals work but have not been audited/restyled to a single modern spec.

## 2. Goals
1. Make data management a clean, JSON‑based, API‑ready layer.
2. Guarantee modules are truly independent (off‑states never break core).
3. Ship a **Config page** to toggle modules, persisted, dependency‑aware.
4. Restyle **all modals** to one clean, modern, readable design (deep per‑modal pass).

## 3. Phase A — JSON data layer + API seam
**Aim:** keep plain JSON, centralize state access so a real API can replace it.

- [ ] A1. Introduce a **store/service** (core): owns `IMS.state` (JSON) and typed
      repositories (`parties`, `orders`, `items`/typed, `movements`, `locations`,
      `policies`, `stock`).
- [ ] A2. Repositories expose `list/query/get/create/update/remove` (+ change
      events) — today in‑memory, tomorrow backed by `apiAdapter` returning JSON.
- [ ] A3. Move **all writes** off direct `IMS.*` mutation into repository methods
      (per module, gated).
- [ ] A4. Optional **persistence plugin**: hydrate/export `IMS.state` to/from
      localStorage as JSON (hidden behind the store so it is swappable).
- [ ] A5. Define the `apiAdapter` interface (async, JSON) and a docs contract so
      server return shapes are locked before the real backend exists.
- [ ] Gate: all 15 views render; create/edit flows write through repos; JSON
      round‑trip (save → reload) is lossless.

## 4. Phase B — Module independence + Config page
**Aim:** each feature is a true module; turning one off never breaks another.

- [ ] B1. **Dependency/impact audit** → `module-dependencies.md` + a table mapping
      each module's nav, routes, badges, notification hooks, sim loops, and any
      data it injects into other views.
- [ ] B2. Expand the manifest with `label, description, requires[], ownedViews[],
      ownedLoops[]`.
- [ ] B3. **Config page** (Administration > Modules): list core vs modules with
      on/off toggles, dependency badges, and a warning when an off‑state would
      orphan another feature.
- [ ] B4. **Persist toggles** (localStorage now; tenant config/API later).
- [ ] B5. Gate **every** entry point by the manifest — not just nav: router,
      notifications bell, global search, dashboard cards that read module data,
      and module sim intervals.
- [ ] B6. Enforce dependency validation on apply (reject/cascade with confirm).
- [ ] Gate: with a module off, core renders and empty/graceful states show; with
      all modules on, nothing regresses (15‑view suite).

## 5. Phase C — Modal restyle (deep dive)
**Aim:** clean, easy to read, modern; one system-wide spec, then per‑modal.

- [ ] C1. Write the **modal design spec** (shared tokens): header/title/icon,
      body spacing, footer alignment, form field rhythm, action button hierarchy,
      focus order, scroll behavior, min widths.
- [ ] C2. Inventory **all modals** by origin module (raw vs form vs detail) and
      open each to audit readability/structure. Examples known:
      openRawModal/openFormModal (common), order/contract modal (scheduler),
      item view + edit modals (inventory), rental/issue wizard (handoff‑wiz),
      timesheet punch/segment, inspection, pricing/tax/overhead, work order,
      customer/party, invoice detail, branch config, category, etc.
- [ ] C3. Centralize base modal chrome in `shared.css` (radius, shadow, backdrop,
      motion) — largely present; extend to fields/buttons alignment.
- [ ] C4. Per‑modal cleanup: replace inline styles with classes, align labels/
      inputs, group long forms into sections, set primary/secondary actions,
      consistent Cancel/Close, empty/loading states.
- [ ] C5. Confirm each modal still opens/closes + saves (interactive/jsdob flow
      per modal).
- [ ] Gate: every modal renders open, reads clearly, and its actions work; zero
      inline `style=` left in modal templates where a class can express intent.

## 6. Non‑negotiables
- Core owns shared data/helpers; modules only consume core or declared deps.
- JSON is the only data shape; no DOM‑backed state.
- Each change ships gated (syntax + 15‑view jsdom + relevant flow).
- No alias layer — names are the real domain terms.

## 7. Suggested execution order
Phase B‑1 (audit + Config UX) → Phase A (data service + API seam) →
Phase C (modal spec + per‑modal restyle) → B‑3..B‑6 (Config build/gating).
