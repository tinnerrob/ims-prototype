# IMS — Industrial Rental Suite (Prototype)

A single-page-application (SPA) prototype for managing an industrial equipment rental
business. It is a static HTML / Bootstrap 5 / vanilla-JavaScript build — no build step,
no framework — that renders 14 views into a single `#content` container and keeps all
client-side state in memory (mocked data).

It covers the full rental lifecycle: **inventory → scheduling → dispatch/geo tracking →
service & maintenance → labor → yard inspections → cycle invoicing → sub-rentals →
administration**.

---

## 1. Tech Stack & Requirements

| Concern      | Choice |
|--------------|--------|
| UI           | Static HTML5, Bootstrap 5.3 (CDN), Bootstrap Icons 1.11 (CDN) |
| Scripting    | Vanilla JS (ES2015+), strict mode, no build tooling / no framework |
| Styling      | A single `css/styles.css` theme (CSS variables, flex/grid layouts) |
| Data         | Mocked in `js/data.js` as a global `IMS` object (in-memory only) |
| Runtime      | Any modern browser; open `index.html` directly or serve it |

No dependencies are vendored locally — Bootstrap and Bootstrap Icons load from a CDN.
There is no backend; all CRUD mutates in-memory objects and re-renders the view.

---

## 2. File / Directory Structure

The JavaScript that used to live in one monolithic `js/app.js` has been split into a
**common foundation**, one file **per page**, and a **router/bootstrap** file. All files
share the global scope and are loaded as classic `<script>` tags **in order** in
`index.html`. Order matters: `data.js` → `common.js` → page files → `router.js` (the
`RENDER` map and `init()` are defined last so every view function exists).

```
wwwroot/ims-prototype/
├── index.html          # SPA shell: sidebar nav, topbar, #content, script tags
├── css/
│   └── styles.css      # Theme, layout, components, scheduler & table styles
└── js/
    ├── data.js         # Mocked IMS data + settings (the "database")
    ├── common.js       # Shared foundation (see below)
    ├── router.js       # Nav router (TITLES/RENDER/showView) + init() bootstrap
    └── pages/          # One file per page/view
        ├── dashboard.js     # Executive KPIs & dashboards
        ├── inventory.js     # 7 resource types: serialized, bulk, consumables, parts, labor, kits, attachments
        ├── scheduler.js     # Contract queue, resource pool, timeline, booking, conflicts
        ├── contracts.js     # Customers & contracts (header management)
        ├── geo.js           # GPS telemetry simulation + geofence monitoring
        ├── maintenance.js   # Service & maintenance (work orders)
        ├── timesheet.js     # Labor & timesheets
        ├── yard.js          # Yard inspections (check-in/out, overage)
        ├── logistics.js     # Dispatch board
        ├── invoicing.js     # Cycle invoicing engine + ledger + CSV
        ├── rerents.js       # Sub-rentals
        ├── branches.js      # Branch / yard profiles
        ├── pricing.js       # Pricing rules, tax schedule, overhead fees
        └── categories.js    # Resource category management
```

### `js/common.js` contents (shared by every page)
- DOM helpers `$` / `$$` + event-delegation helper `delegate(parent, event, selector, handler)` (one listener per container instead of per element), formatting helpers (`fmtMoney`, `fmtDate`, `fmtPct`, …).
- Global `App` state object (active view, filters, scheduler position, sim timer).
- Date/duration helpers (`parseDT`, `daysBetween`, `countWeekdays`, `addDays`, `dayOffset`).
- **Pricing rules engine**: `rateBasis`, `computeLineTotal`, `computeLineCost`,
  `computeDepreciation`, `contractEquipBase`, `contractTotals`, `overheadCalc`,
  `RISK_PREMIUM`, `BILLING_CYCLES`, `customerCycleDays`.
- Status badge helpers (`statusBadge`, `recActive`, `activeBadge`, `activeCell`).
- Reusable Bootstrap modal builder (`openFormModal`, `openRawModal`, `fieldHTML`, …).
- Shared accessors (`getContract`, `getCustomer`, `customerName`, `liStart`, `liEnd`,
  `liDays`, `toISO`, `TYPE_LABEL`, `isQuantityType`, `resourceCapacity`,
  `syncInventoryOnStage`, `reorderCount`, `inProgressWO`, `updateBadges`, `emptyRow`).

### `js/router.js` contents
- `TITLES`, `RENDER`, `DESCRIPTIONS` maps and `showView(id)`.
- `init()` (runs on `DOMContentLoaded`) — wires nav/search, seeds one breach event,
  scopes seed invoice base amounts, starts the geo simulation loop, opens the dashboard.
---

## 3. The 14 Views / Pages

| # | View (nav key)    | File                 | What it does |
|---|-------------------|----------------------|--------------|
| 1 | Dashboard         | `dashboard.js`       | Fleet book value, physical utilization, geofence alert count, annualized revenue run-rate; active-contract profitability table; reorder warnings; recent alerts; fleet status & bulk-out summary |
| 2 | Inventory & Assets| `inventory.js`       | Master lists & CRUD for 7 separate resource types — Serialized Equipment, Bulk Resources, Consumables, Stock Inventory, Labor/Employees, Attachments, Kits — in that order; detail views & editing |
| 3 | Scheduler         | `scheduler.js`       | 3-column booking board: Active Contracts queue, Resource Pool, and a Day/Week/Month timeline; drag-and-drop + quantity booking; **conflict detection**; bar resize |
| 4 | Customers & Contracts | `contracts.js`   | Customer records (with per-customer billing cadence) and contract header management |
| 5 | Geo Asset Tracking| `geo.js`             | Live fleet telemetry simulation, map with geofences, breach/re-entry alert log, asset status table |
| 6 | Logistics Board   | `logistics.js`       | Pending dispatches + driver/truck assignment grid |
| 7 | Service & Maintenance | `maintenance.js` | Work orders with parts/labor cost roll-ups |
| 8 | Labor & Timesheets| `timesheet.js`       | Time punches against contracts/work orders, cost & billable value |
| 9 | Yard Inspections  | `yard.js`            | Asset check-in/check-out with meter/fuel and **overage** flags |
|10 | Cycle Invoicing   | `invoicing.js`       | Per-customer billing cycles, ledger, "Run Next Cycle", CSV export, invoice detail modal |
|11 | Sub-Rentals       | `rerents.js`         | Third-party vendor sub-rentals with spread analysis |
|12 | Branch / Yard Profiles | `branches.js`   | Manage branch locations |
|13 | Pricing Rules     | `pricing.js`         | Rate engine settings, localized tax schedule (with live county/city lookup), overhead fee config |
|14 | Resource Categories | `categories.js`    | Manage active category options for every resource type |

---

## 4. Layout & Responsive Design

### App shell
- `.app-shell` = flex row (sidebar + main). Sidebar is `position: sticky; height: 100vh`
  with scrollable nav. On ≤992px it collapses into an off-canvas drawer.
- `.main` is a flex column: `.topbar` (sticky) + `.content`.

### Page body (`css/styles.css`)
- The app is a **fixed-height, non-scrolling shell**: `.content` is
  `height: calc(100vh - 66px)` with `overflow-y: auto` as a fallback. Content that is
  meant to scroll (tables, the scheduler) scrolls **inside its own container**, not the
  page.
- Data tables use `.table-wrap` = `flex: 0 1 auto; overflow: auto` so a table is only as
  tall as its rows and becomes scrollable when it outgrows the page (sticky header).

### Scheduler 3-column grid
- `.scheduler-3col` = CSS grid `340px 1fr 320px`, `height: calc(100vh - 200px)`.
  1. **Left — Active Contracts** queue + **Resource Pool** (tabbed by resource type).
  2. **Middle — Timeline** (Day/Week/Month) with contract bars and per-line-item rows.
  3. **Right — Scheduling Conflicts** list (replaced the old contract-details inspector).
- The timeline tracks scroll horizontally and vertically; month view expands contract
  rows into per-resource lanes.

### KPI / dashboards
- `.kpi-grid` (4 KPI cards) and `.dash-grid` (2-column panel grid, collapses to 1 column
  at ≤1200px). The dash-grid is a scroll container within the fixed shell.

---

## 5. Scheduler — Booking, Conflicts & the Timeline

### Resource Pool & Booking
- The Resource Pool lists every resource type. Drag a card onto a **contract bar** to
  book it for the contract's window.
  - **Quantity types** (bulk/consumable/part/kit/attachment) open a quantity prompt; if
    the amount exceeds what's available it shows an **Overbooking** confirmation.
  - **Unique types** (serialized/labor) are booked directly.
- Booking **is always allowed**, even when it creates a scheduling conflict. Only truly
  invalid bookings are blocked: inactive resources, a resource already on the same
  contract, or a serialized asset that is **In Shop**.
- Contract bars can be **resized** by dragging their left/right handles, and a
  serialized contract auto-grows when a resource extends beyond it.

### Conflict detection & highlighting
- `resourceConflict(li, c)` detects overlaps with other active contracts.
- `collectConflicts()` (scheduler) reports every resource booked on 2+ overlapping
  contracts:
  - **Hard conflicts** for serialized/labor (a unit cannot be in two places).
  - **Overbooked quantity** only when the sum booked in the overlap exceeds capacity
    (legitimate shared splits are *not* flagged).
- On the timeline, a conflicted row is highlighted **red** (`.tl-row.conflict`) and the
  bar shows **"Booked <contract>"** / **"Overbooked"**.
- The right pane is a live **Scheduling Conflicts** list (resource, Hard/Overbooked
  badge, overlap dates, and the two contracts involved). It updates immediately after
  each booking.

---

## 6. Pricing & Billing Engine

### Rate basis (per line item)
- `rateBasis` / `computeLineTotal` choose Daily, Weekly, or Monthly by rental length:
  - `days ≥ 28` → Monthly (`ceil(days/28)` months)
  - `days ≥ 7` → Weekly (`ceil(days/7)` weeks)
  - otherwise → Daily (weekend policy applies)
- `pricingMatrix`: `standard` (D/W/M), `min` (enforce a daily minimum of 3 days), `flat`.
- `weekendPolicy`: `bill` (1.0×), `skip` (0.0× weekends), `overtime` (1.5×).
- `riskPremium`: `standard` (+0%), `coastal` (+15%), `hazmat` (+25%) — multiplies the
  subtotal.
- Kits/attachments bill at a daily rate; labor/consumables/parts bill per unit (qty × rate).

### Billing cycles (per customer)
- Each customer has a `billingCycle`: **daily / weekly / bi-weekly / monthly / quarterly**
  → `BILLING_CYCLES = { 1, 7, 14, 28, 84 }` days. Set it on the customer record.
- `customerCycleDays(contract)` returns the cadence for a contract's customer, defaulting
  to the global `settings.pricing.cycleDays` (28).
- "Run Next Cycle" creates the next invoice for every non-paid contract using **that
  customer's** cycle length.

### Whole-unit weekly/monthly allocation ("advance to next cycle")
- Weekly/monthly items bill in **whole units**, never prorated by the day.
- Each unit is billed in the cycle that contains the **majority** of its booked days
  (`wholeUnitsBilled`, using the upper-median day). So if more of a week falls on the
  *next* cycle — or it splits evenly (e.g., 2 days / 2 days) — the whole week is **advanced
  to the later cycle** rather than billed in the current one.
- Because every unit lands in exactly one cycle, summing consecutive cycles never
  double-bills and always equals the full-contract total.

### Invoice math
`invoiceCompute(inv)` computes, from `baseAmount` (the cycle-scoped rental for that
period):
- `envFee` = base × env-fee %, `waiver` = base × 3% (if damage waiver), `fuel` = fixed
  charge, `tax` = (base+env+fee+waiver) × tax-rate, `total` = sum of all.
- Invoices are scoped to a single cycle: `contractRentalForPeriod` sums each line item's
  `liAmountForPeriod` over `[cycleStart, cycleEnd]` (whole units + one-time charges billed
  in the period containing the rental start).
- CSV export (`invoiceDetailCSV`) writes one row per line item + adjustment rows
  (Environmental Fee, Fuel Charge, Damage Waiver, Tax) — **no** summary "Total" row, so it
  imports cleanly.

---

## 7. Geo Asset Tracking

- `initSim()` + `geoSimTick()` (a `setInterval` in `init`) simulate GPS drift for rented
  assets every 2.5s, animating map pins.
- Each job site is a **geofence** (`geofenceRadius`, site lat/lng). When an asset exits
  (breach) or re-enters, a `pushAlert` is logged (up to 40 entries).
- The map renders yard + job sites + asset pins with a scale; alerts appear in a
  scrollable log and drive the nav badge / dashboard alert count.

---

## 8. Data Model (`js/data.js`)

The global `IMS` object holds all mocked data:

| Key | Description |
|-----|-------------|
| `serializedAssets` | Fleet: id, make/model, rates (daily/weekly/monthly), GPS, status, meter hours |
| `bulkResources`    | Quantity items: sku, name, owned/available/out, rates |
| `consumables`      | Consumable stock: sku, on-hand, reorder point, cost/retail |
| `labor`            | Employees: role, certs, hourly cost/billable |
| `parts`            | Stock parts: bin, on-hand, cost |
| `customers`        | Customer records incl. **`billingCycle`** |
| `contracts`        | Rental contracts: customer, dates, geofence, `lineItems[]` |
| `workOrders`       | Maintenance work orders |
| `timesheets`       | Labor punches |
| `kits` / `attachments` / `assetAttachments` | Kit assemblies & attachment fit matrix |
| `vehicles`         | Trucks for dispatch |
| `inspections`      | Yard check-in/out records |
| `dispatches`       | Logistics dispatch board |
| `invoices`         | Cycle invoices (cycle, period, overheads, status) |
| `rentals`          | Sub-rentals |
| `settings`         | branches, taxSchedules, categories, pricing, overheads |

---

## 9. Running It

Open `wwwroot/ims-prototype/index.html` in a browser. Because Bootstrap loads from a CDN,
an internet connection is needed for full styling; the app itself is otherwise
self-contained. Any static file server works too (e.g. `python3 -m http.server`).

> Note: `parseDT` treats date-only ISO strings (`"YYYY-MM-DD"`) as **local** midnight (not
> UTC) so cycle arithmetic, `addDays`, and date display are correct across timezones.

---

## 10. Testing

The prototype is validated with **jsdom** node scripts (not committed) that load
`index.html` with all JS inlined and assert: all 14 views render, conflicted bookings are
allowed and listed, weekly whole-unit billing advances correctly, per-customer cycle
lengths resolve, seed invoices are cycle-scoped, and the CSV has no Total row.

To lint/syntax-check the split files:

```bash
cd wwwroot/ims-prototype
for f in js/common.js js/router.js js/pages/*.js; do node --check "$f"; done
```

---

## 11. Key Behavioral Notes / Quirks

- **Scheduling conflicts are allowed** but flagged red and shown in the right pane.
- **Billing is per-customer cadence** and **whole-unit** for weekly/monthly rentals.
- Seed invoices are scoped to a single cycle; "Run Next Cycle" advances each non-paid
  contract by its customer's cycle length.
- The right pane of the scheduler is now a **conflict list**, not contract details
  (contract editing is still available by double-clicking a contract bar).
- All data is in-memory: **refreshing the page resets everything** to the mock seed.

