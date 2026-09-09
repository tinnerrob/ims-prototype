# IMS — AI Onboarding / Project Overview

> **Purpose of this doc:** give an agent (or a human) with **zero prior context**
> a fast, accurate mental model of the app so it can read, modify, and test code
> without guessing. Read this first; then use the deeper architecture docs linked
> at the end. This doc is **living** — keep it in sync when behavior changes.

**Status:** current as of 2026-09-09 · **Entry point to run/test:** see §7.

---

## Table of contents
1. [Purpose](#1-purpose)
2. [How it functions](#2-how-it-functions)
3. [Existing functionality](#3-existing-functionality)
4. [Proposed new functionality](#4-proposed-new-functionality)
5. [File structure](#5-file-structure)
6. [Data structure](#6-data-structure)
7. [Working here: invariants & gates](#7-working-here-invariants--gates)
8. [Reference docs](#8-reference-docs)

---

## 1. Purpose

**IMS** is an **Inventory Management System** first, extended by opt-in industry
modules. The core is a smart, generic engine for **items, locations, and
movements** that different industries plug modules onto (rentals/loans,
dispatch/logistics, scheduling/allocations, labor, field service, telemetry).

> **Thesis:** *Rental is not the product — rental is one module built on inventory
> movements. Dispatch, scheduling, labor, field service, and telemetry are modules
> too.* The core never depends on any module.

This repository is the **static SPA prototype** (vanilla JS + Bootstrap, no build
step, mocked in-memory data) that demonstrates the full architecture before a
real backend/UI is built. Data today is seeded in memory and persisted to
`localStorage` through a JSON store (`IMS.store`) that is shaped to be swapped for
a real `apiAdapter` later.

---

## 2. How it functions

### 2.1 Runtime shape
Single-page application. One shell (`index.html`) holds the sidebar nav + topbar
+ an empty `#content` container. Each "view" is a **render function** that fills
`#content`'s innerHTML and wires up event handlers. There is no router URL
syncing; navigation is in-memory (`App.view`) and driven by nav clicks.

### 2.2 Script load order (critical)
All JS shares the **global scope** and loads as classic `<script>` tags **in
order** in `index.html`. Order matters:

```
data.js        → builds the IMS global object (seed data + settings)
metadata.js    → IMS.metadata registry (core cols + per-vertical extended attrs)
store.js       → IMS.store (typed repos + JSON persistence + normalizeCore)
common.js      → App state + shared helpers/formatting + pricing engine + modals
grid.js        → window.IMSGrid (data-table + column-profile renderer)
pages/*.js     → one render file per view (all define top-level functions)
router.js      → TITLES/RENDER/DESCRIPTIONS maps, module manifest, showView(), init()
```

`router.js` defines `init()` bound to `DOMContentLoaded`, which hydrates
persisted state, normalizes core fields, applies module-nav hiding, seeds a
breach alert, scopes seed invoice amounts, starts sim loops, and shows the
dashboard. **`init()` must run last** because it references every view render
function.

### 2.3 View rendering
`showView(id)`:
1. Guards against disabled modules (falls back to `dashboard`).
2. Sets `App.view`, toggles `.nav-item` active state, writes the page title/sub.
3. Clears `#content` and calls `RENDER[id]()`.
4. Scrolls to top.

Each page file exposes one-or-more functions that populate `#content` and then
attach `click`/`change` handlers (usually via `delegate` or direct listeners).
Tables are produced by `window.IMSGrid.render(tableId, columns, rows, opts)`.

### 2.4 Data persistence & the store seam
- Reads: views read live collections directly off the `IMS` global (or through
  `IMS.itemRegistry` for the unified item catalog).
- Writes: business writes should go through **`IMS.store.repo(name)`** which
  exposes `list/get/create/update/remove` and fires change events. `create`/
  `update`/`remove` trigger `save()` (localStorage, key `ims.store`, `_v=2`).
- Fallback: when `IMS.store` is absent, writers fall back to direct array
  mutation (e.g. `IMS.parties.push(rec)`). Prefer the store seam.
- `normalizeCore()` (in `init`) stamps canonical core fields + an
  `extended_attributes` bucket on every item so consumers can rely on them.

### 2.5 Modules: on/off & gating
- A module manifest in `router.js` (`MODULE_VIEW`, `MODULE_META`, `MODULE_DEPS`)
  maps each module view to an industry module key.
- Flags live in `IMS.settings.featureModules` (persisted to localStorage as
  `ims.featureModules`) and are surfaced in the **Config / Feature Modules**
  view, where users toggle them with dependency validation.
- Gating touches every entry point: nav items, notifications bell route, global
  search route, telemetry sim interval, and the dashboard's telemetry KPI card.
- `showView` refuses to render a disabled module's view (falls back to
  dashboard). Core is always on.

### 2.6 Sim / live loops
Only the **geo/telemetry** module runs a `setInterval` (`geoSimTick`, 2500 ms) to
animate GPS drift. It starts in `init()` only when telemetry is enabled and is a
live loop (field writes are intentionally direct, not persisted business state).

---
## 3. Existing functionality

### 3.1 Views grouped Core vs Industry Modules
Route ids (used by nav `data-view` and `RENDER`) are in `router.js`.

**Core (always on)**
| Route | Render fn | What it does |
|---|---|---|
| `dashboard` | `renderDashboard` | Fleet book value, physical utilization, geofence alert count, annualized revenue; active-order profitability table; reorder warnings; recent alerts; fleet status summary |
| `inventory` | `renderInventory` | Items & Stock: typed catalog tabs — serialized, bulk, consumable, stock parts, labor, kits, attachments (+ a vertical-driven `medical` tab). CRUD + detail modals + receiving flow + extended-attributes editor |
| `orders` | `renderOrdersParties` | Parties (customers/vendors/sites) + order headers with filters |
| `handoff` | `renderHandoff` | Item Hand-Off / custody: issue out, receive/return, chain-of-custody movement log; includes the multi-step **New Order / Check-Out wizard** (`handoff-wiz.js`) |
| `yard` | `renderYard` | Receiving / Inspections: check-in/out with meter/fuel, inspection log, overage flags |
| `branches` | `renderBranches` | Locations: branch/yard profiles |
| `categories` | `renderCategories` | Categories & Types: manage category options per resource type |
| `config` | `renderConfig` | Administration: enable/disable industry modules (dependency-aware) |

**Industry modules (opt-in)**
| Route | Module key | Render fn | What it does |
|---|---|---|---|
| `scheduler` | `scheduling` | `renderScheduler` | Allocations: booking board (contract queue, resource pool, timeline), drag-drop, conflict detection |
| `geo` | `telemetry` | `renderGeo` | Live GPS telemetry sim, geofences, breach/re-entry alert log |
| `logistics` | `dispatch` | `renderLogistics` | Dispatch board + driver/truck assignment |
| `maintenance` | `service` | `renderMaintenance` | Field service / maintenance work orders with parts/labor roll-ups |
| `timesheet` | `labor` | `renderTimesheet` | Labor time records against orders/work orders |
| `invoicing` | `billing` | `renderInvoicing` | Cycle invoicing engine, ledger, "Run Next Cycle", CSV export |
| `rerents` | `rentals` | `renderRerents` | Rentals/sub-rentals from third-party vendors |

### 3.2 Cross-cutting systems
- **Grid + column profiles (`grid.js`, `window.IMSGrid`)**: most data tables render
  through `IMSGrid.render(id, columns, rows, opts)` with per-table hide/show +
  persistence (`ims.cols.<id>`).
- **Metadata registry + verticals (`metadata.js`)**: core columns per item type,
  plus per-industry-vertical `extended_attributes` definitions. The active vertical
  is chosen on the Feature Modules view (HeavyEquipment, Healthcare, Rental,
  Lumberyard, Warehouse). `IMS.metadata.ext(rec, key)` reads the bucket.
- **Unified item catalog (`IMS.itemRegistry`)**: one read path over the typed item
  tables (`serialized/bulk/consumable/part/kit/attachment/labor/healthcare`).
- **Modal system (`common.js`)**: `openFormModal` (field-list forms, JSONB-bucket
  aware) and `openRawModal` (read-only/custom). Both emit the shared modal chrome
  from `shared.css`. See `docs/architecture/modal-design-spec.md`.
- **Pricing engine (`common.js`)**: `rateBasis`, `computeLineTotal`,
  `computeLineCost`, `orderEquipBase`, `orderTotals`, `overheadCalc`,
  `customerCycleDays`, plus constants (`RISK_PREMIUM`, `BILLING_CYCLES`).
- **Notifications / search / badges**: topbar bell (routes to geo or dashboard),
  global search (Enter routes to geo or inventory), status/active badges
  (`statusBadge`, `activeBadge`, `updateBadges`).

---

## 4. Proposed new functionality

Driven by `docs/architecture/app-review-plan.md` (the master roadmap). Summarized:

- **T1 — Clean & reuse:** remove dead/stale code (e.g. the shadowed legacy
  `openNewRentalModal`/`createRentalFromModal` flow in `handoff.js`, the default
  ASP.NET Razor scaffold `Pages/*`, CSS overlap across `styles.css`/`shared.css`/
  `dashboard.css`); centralize repeated markup/helpers into reusable builders.
- **T2 — IMS-first + hard module disconnect:** prove modules never read/write each
  other's data and core never touches a module; regroup nav into Core vs Industry
  Modules; collapse router maps into one declarative module registry; bake
  "module-off → core OK" proofs into the gate.
- **T3 — Modern UI + modal consistency:** enforce design tokens/utilities, remove
  remaining inline `style=`, consistent shell/nav/components, and a machine-checked
  modal-consistency contract (header/footer anatomy, a11y, no inline styles).
- **Audit deliverable:** a per-file `app-review-audit.md` matrix tracking dead
  code, reuse opportunities, module-disconnect findings, and UI/modal notes.

Each change ships small, gated, and one commit.

---


## 5. File structure

```
wwwroot/ims-prototype/
├── index.html              # SPA shell: sidebar nav, topbar, #content, ordered <script>/<link> tags
├── css/
│   ├── styles.css          # Primary theme: tokens, layout, components, scheduler & table styles
│   ├── shared.css          # Shared components (modals, badges, buttons) — modal chrome spec lives here
│   └── dashboard.css       # Dashboard/panel-specific styles (candidate for consolidation into styles.css)
└── js/
    ├── data.js             # Seeds the IMS global: every collection + settings (the in-memory "database")
    ├── metadata.js         # IMS.metadata: core cols + per-vertical extended-attribute registry; ext() accessor
    ├── store.js            # IMS.store: typed repositories, change events, JSON persistence, normalizeCore
    ├── common.js           # Shared foundation: App state, $/$$, formatters, pricing engine, modal builders, accessors
    ├── grid.js             # window.IMSGrid: data-table renderer + column-profile persistence
    ├── router.js           # TITLES/RENDER/DESCRIPTIONS maps, module manifest, showView(), init() bootstrap
    └── pages/              # One (or two) files per view
        ├── dashboard.js    # renderDashboard
        ├── inventory.js    # renderInventory + all item/stock modals, receiving, extended-attrs editor
        ├── healthcare.js   # medical vertical grid/modal used by inventory's "medical" tab
        ├── scheduler.js    # renderScheduler (allocations board)
        ├── contracts.js    # renderOrdersParties + party/order modals
        ├── geo.js          # renderGeo + telemetry sim
        ├── maintenance.js  # renderMaintenance + work-order modal
        ├── timesheet.js    # renderTimesheet + punch/segment modals
        ├── handoff.js      # renderHandoff + custody (check-out/in, movements) — legacy New-Order modal is shadowed
        ├── handoff-wiz.js  # Multi-step New-Order/Check-Out wizard (overrides handoff.js entry point)
        ├── yard.js         # renderYard (receiving/inspections)
        ├── logistics.js    # renderLogistics
        ├── invoicing.js    # renderInvoicing
        ├── rerents.js      # renderRerents
        ├── branches.js     # renderBranches
        ├── pricing.js      # renderPricing (tax/overhead)
        ├── categories.js   # renderCategories
        └── config.js       # renderConfig (Feature Modules toggles)
└── test/
    ├── gate.js             # jsdom test suite (npm test): renders views, opens/saves/closes modals, store/metadata checks
    └── lint.js             # node --check on every JS file (npm run check)
└── docs/
    ├── AI-ONBOARDING.md    # This file
    └── architecture/       # Deeper design docs (see §8)
```



---

## 6. Data structure

Everything lives on the global **`IMS`** object (seeded in `data.js`). Persisted
collections are listed in `store.js` `ARRAY_NAMES`. Core fields are stamped by
`normalizeCore()`; industry-specific fields live in each record's
`extended_attributes` object (`IMS.metadata.ext(rec, key)` to read).

| `IMS.<collection>` | Kind | Representative fields |
|---|---|---|
| `parties` | customers/vendors/sites | `id`, `name`, `contact`, `phone`, `email`, `billingAddress`, `billingCycle`, `notes`, `active` |
| `orders` | order headers | `orderId`, `partyId`, `party`, `orderType`, `startDate`, `endDate`, `status`, `counter`, `jobSite`, `geofenceRadius`, `overheads`, `lineItems[]`, `siteLat`, `siteLng` |
| `orders[].lineItems` | order lines | `id`, `type`, `refId`, `qty`, `pricingMatrix`, `weekendPolicy`, `riskPremium`, `startDate`, `endDate`, `customRates`, `freq`, `depositPct`, `unitPrice`, `flatTotal` |
| `movements` | custody log | `id` (`MV-nnn`), `refType`, `refId`, `kind` (issue/return/receive/transfer/adjust), `orderId`, `party`, `location`, `at`, `by`, `note` |
| `itemInstances` | serialized fleet | `id`, category, status, lat/lng, rates, deposit; vertical fields under `extended_attributes` |
| `bulkResources` | quantity items | `sku`, `name`, owned/available/out, rates |
| `consumables` | consumable stock | `sku`, `name`, `qtyOnHand`, `reorderPoint`, cost/retail |
| `parts` | stock parts | `partId`, description, bin, `qtyOnHand`, cost |
| `kits` / `attachments` | assemblies/fit | `kitId`/`accId`, name, `qtyOwned`, components/fit matrix |
| `labor` | employees | role, certs, hourly cost/billable |
| `assetAttachments` | asset↔attachment fit | refs + compatibility |
| `workOrders` | field service | WO + parts/labor roll-ups |
| `timesheets` | labor punches | time records vs orders/WOs |
| `inspections` | yard check-in/out | `inspId`, asset, meter/fuel, checks, overage |
| `receivings` | goods receipts | received stock log (consumables/bulk/parts) |
| `dispatches` | logistics board | dispatchId, order, driver/truck, status |
| `vehicles` | trucks | fleet for dispatch |
| `invoices` | cycle invoices | invId, orderId, cycle, baseAmount, overheads, tax, status |
| `rentals` | sub-rentals | vendor + spread |
| `healthcare` | medical catalog | 2nd vertical; core + `extended_attributes` |
| `itemRegistry` | unified read path | `getByType(type)`, `typeKey`, `idKey` over the typed tables |
| `settings` | config | `branches`, `taxSchedules`, `overheads`, `categories`, `pricing`, `featureModules`, `vertical` |
| `metadata` | registry | `IMS.metadata`: `vertical()`, `registryFor(v)`, `ext(rec,key)`, `verticals`, `mkName` |
| `store` | service | `IMS.store`: `repo(name)`, `on(fn)`, `save()`, `hydrate()`, `normalizeCore()`, `setAutoSave(v)` |

**Repository table map** (`IMS.store.repo(name)` resolves via `store.js table()`):
canonical names above **plus** item-catalog aliases (`serialized→itemInstances`,
`bulk→bulkResources`, `consumable`, `part`, `kit`, `attachment`) and settings
collections (`branches`, `taxSchedules`, `overheads`, and `categories.<type>`).

**Worked read/write example (one bulk item):**
```js
// READ
const r = IMS.itemRegistry.getByType("bulk").find(x => x.sku === "BL-100"); // or repo("bulk").get(x => x.sku === "BL-100")
const reorder = IMS.metadata.ext(r, "reorderPoint");                        // vertical field in the bucket

// WRITE (prefer the store seam so change events fire + auto-save)
IMS.store.repo("bulk").update("sku", "BL-100", { extended_attributes: { reorderPoint: 12 } });
```

---

## 7. Working here: invariants & gates

**Invariants an agent must preserve**
1. **Core owns shared data/helpers; modules only consume core or declared deps.**
   No module reads/writes another module's tables/state. Core never references a
   module.
2. **JSON is the only data shape; no DOM-backed state** (state lives in `IMS`, not
   in rendered DOM). Don't store the source of truth in the DOM.
3. **No alias layer** — names are the real domain terms (`party`, `order`, `item`,
   `movement`).
4. **Writes go through `IMS.store.repo`** when available; direct array mutation is
   the fallback only.
5. **Script load order matters** (see §2.2); define page functions before
   `router.js` runs `init()`.

**Test gates (run from `wwwroot/ims-prototype/`)**
- `npm run check` — `node --check` every JS file (syntax).
- `npm test` — jsdom gate: renders all views, opens/saves/closes modals, exercises
  store/persistence/metadata round-trips.
- Smoke: open `index.html` in a browser (Bootstrap/Icons load from CDN, so an
  internet connection is needed for full styling).

---

## 8. Reference docs
All under `docs/architecture/`:
- `app-review-plan.md` — the master review/modernization roadmap (this doc's sibling).
- `ims-core-and-modules.md` — core-vs-module architecture + terminology decisions.
- `module-dependencies.md` — dependency graph + what each module gates.
- `modal-design-spec.md` — the modal consistency spec + inventory.
- `metadata-extended-attributes.md` — metadata registry + vertical buckets.
- `column-profiles.md` — grid column-profile coverage.
- `api-adapter.md` — the JSON store → API seam contract.
- `p4-terminology-migration.md` — rename log (customer→party, contract→order, …).
- `next-session-seed.md` — handoff seed for continuing work.

