# IMS — Module Dependencies & Impact Audit

**Status:** Analysis (Phase B‑1)
**Date:** 2026‑09‑08

## Purpose
Guarantee modules are truly independent: turning a module **off** must never
break the inventory core or orphan another feature. This document records the
dependency graph, the entry points each module owns, and exactly what must be
gated for each module. It feeds the Config page (Phase B‑3) and gating pass
(Phase B‑5).

## Terminology
- **Core (always on):** Parties, Orders (+ lines), Items/Stock (typed, via the
  item registry), Movements, Locations, Categories, Policies (pricing).
- **Module:** an opt‑in industry feature layered on core.

## Core tables (owners)
`parties`, `orders` + `order_lines`, `items`/typed stock (itemInstances, bulk,
consumables, parts, kits, attachments behind `IMS.itemRegistry`), `movements`,
`locations`, `policies`/categories settings.

## Module map

| Module (manifest key) | Owned views | Requires (core or modules) | Owned entry points / loops | Gating notes if disabled |
|---|---|---|---|---|
| Scheduling / Allocations (`scheduling`) | scheduler | orders, items | nav `scheduler` | hide nav; no sim. Core unaffected. |
| Logistics & Dispatch (`dispatch`) | logistics | orders, items, locations (telemetry optional) | nav `logistics` | hide nav. Uses orders/items only. |
| Fleet Telemetry (`telemetry`) | geo | itemInstances (core), locations | nav `geo` + `navGeoBadge`, notification bell → geo, `geoSimTick` interval, dashboard "Out‑of‑Geofence Alerts" KPI | Must gate badge, bell route, sim tick, and the dashboard KPI when off. |
| Labor & Timesheets (`labor`) | timesheet | orders (optional), labor crew (core array) | nav `timesheet` | hide nav; timesheet records reference orders optionally. |
| Field Service (`service`) | maintenance | items, stock parts/consumables, labor | nav `maintenance` | hide nav; draws stock/labor via core. |
| Rentals & Sub‑Rentals (`rentals`) | rerents | orders, parties | nav `rerents` | hide nav; the issue/loan flow lives in core Hand‑Off but stays functional (loan is one movement kind). |
| Billing & Invoicing (`billing`) | invoicing | orders + policies | nav `invoicing` | hide nav; invoicing only derives from billed orders; core never requires it. |

## Cross‑module touchpoints that must be gated (not just nav)
1. **Router**: `showView` already falls back to dashboard for disabled modules ✅.
2. **Notifications bell** → routes to `geo`; when `telemetry` off it should no‑op
   or open core alerts feed.
3. **Global search** → Enter routes to `geo`; when `telemetry` off, route to core
   (Items & Stock).
4. **`navGeoBadge`** (telemetry) → count only when module on.
5. **Dashboard module data**: reorder warnings (core stock), "Out‑of‑Geofence
   Alerts" (telemetry), fleet status (core itemInstances), active orders
   (core). Only telemetry KPI should hide when `telemetry` off.
6. **Sim loops**: `initSim` + `geoSimTick` belong to telemetry; stop when off.
7. **Shared globals**: telemetry/orders/item reads all go through core registry /
   repos (after Phase A) — modules never import each other directly.

## Dependency rules (enforced by Config in B‑6)
- A module may depend only on **core** or on another module **declared in
  `requires[]`** (currently none required — all are core‑only, which is the
  cleanest state and must be preserved).
- Turning a module off hides its owned views and stops its owned loops; it never
  changes core data or other modules.
- No module may write another module's data directly.

## Config‑validation examples
- `telemetry off` → must clear/ignore `navGeoBadge`, stop sim, hide dashboard KPI.
- `billing off` → invoicing nav hidden; orders still created (chargeable flag
  stays but no billing UI).
- All other modules off → core (Items & Stock, Locations, Categories, Parties &
  Orders, Item Hand‑Off, Receiving) must render and function.

## Next steps
Build the Config page (B‑3) against this map, then apply the gating pass (B‑5)
to the cross‑module touchpoints above, then persist toggles (B‑4) and enforce
validation (B‑6).
