# IMS — Inventory‑Core Architecture with Pluggable Industry Modules

**Status:** Approved direction / roadmap
**Owner:** Product & Architecture
**Date:** 2026‑09‑08

## 1. Thesis
At its core, IMS is an **Inventory Management System (IMS)**. It must be a
smart, generic engine for items, locations, and movements that different
industries can extend with **modules**: logistics/dispatch, scheduling,
rentals/loans, labor, field service, and more. Modules are **turned on/off** —
the core never depends on them.

> Rental is not the product. Rental is *one module* built on inventory
> movements. Dispatch, scheduling, and labor are modules too.

## 2. Architecture: Core + Modules

**Core (always on, industry‑agnostic):**
- Parties (customers, vendors, internal depts, sites)  → `parties`
- Locations (yards, branches, warehouses, bins)      → `locations`
- Items (typed catalog) & item instances             → `items`, `item_instances`
- Stock levels / reorder                              → `stock_levels`
- Movements (receive, issue, return, transfer, adjust, count) → `movements`
- Orders & order lines (planned/authorized need)      → `orders`, `order_lines`
- Policy framework (pricing/deposit, optional)        → `policies`

**Modules (opt‑in; each owns its extension tables + features):**
| Module | Enables | Owns / adds |
|---|---|---|
| **Rentals / Loans** | loan orders, deposits, rates, due‑at rules, invoicing | `order_type=loan`, policy pricing/deposit, `invoices` |
| **Dispatch / Logistics** | vehicles, drivers, routes, pickups/deliveries | order_type=delivery, `vehicles`, `routes` |
| **Scheduling / Allocations** | planned availability of items over time | `allocations`, timeline views |
| **Labor / Time** | work against orders, time records, crew | `labor_rates`, `time_records` (party type) |
| **Field Service / Maintenance** | work orders on instances | work‑order entities over `item_instances` |
| **Future modules** | anything layered on items/movements | additive |

**Module enablement model (prototype):**
A central `module` manifest (id, label, on, requiredTables, navGroup) drives the
UI. When a module is off: its nav entries, page titles, and workflows hide;
core data/flow is unaffected. (Server later mirrors this as license/feature
flags per tenant.)

## 3. Locked terminology decisions (actual renames — no DB yet)
Adopt these everywhere (data identifiers, JS, UI copy), no alias layer:

| Current | Adopt | Notes |
|---|---|---|
| `customer` | `party` (type: customer/vendor/branch/employee/site) | neutral across industries |
| `contract` | `order` (+ `order_type`) | legal‑sounding rental term removed |
| `rental` | module `loan` (`order_type=loan`) | only when Rentals module on |
| `check‑out / check‑in` | `issue / return` movements | generic custody verbs |
| `handoff` (events) | `movement` | chain of custody generalized |
| `serializedAssets` | `item_instances` (of serialized `items`) | catalog vs physical split |
| `bulkResources/consumables/parts` | `items` typed registry | one catalog, typed views |
| `baseDaily/Weekly/Monthly`, `deposit` | `policies` (optional) | core never requires pricing |
| `branch/yard/bin` | `locations` (type + parent) | unified hierarchy |
| `job site / geofence` | `locations` + telemetry extension | site = a location; geofence optional |
| `scheduler` | `allocations` module | plans inventory over time |
| `invoicing` | derived invoices from billed orders | billing never required |

## 4. Canonical entity model (target schema)
`parties`, `locations`, `items`, `item_instances`, `stock_levels`, `orders`,
`order_lines`, `movements`, `policies`, plus module tables (`invoices`,
`vehicles`, `routes`, `allocations`, `labor_rates`, `time_records`, …).

Suggested identifier renames: `IMS.contracts→orders`,
`IMS.customers→parties`, `IMS.serializedAssets→itemInstances`,
`bulkResources/consumables/parts → items registry`,
`IMS.handoffs→movements`.

## 5. Roadmap (execution order, impact)
- **P0 — Reframe nav & copy** to core‑first, module‑aware IA (low risk).
- **P1 — Generalize movement model** (`issue/return/transfer/receive`, party +
  location aware) (structural unlock).
- **P2 — Decouple pricing/billing into optional `policies`** (core is pricing‑free).
- **P3 — Scheduler → `allocations` module.**
- **P4 — Adopt terminology in schema + code for real** (no aliases; per‑module
  renames with jsdom regression each step).
- **P5 — Introduce `module` manifest** and gate nav/features so Rental, Dispatch,
  Scheduling, and Labor each read as an industry module on the IMS core.

## 6. Decisions (locked)
- Use **`party`** (type field carries customer/vendor/branch/employee/site).
- Use **`order`** + `order_type` (contract removed from core vocabulary).
- **One unified typed `items` registry** with typed views.
- Pricing/deposit are **optional `policies`**; the core is pricing‑free.
- **`module` manifest** so Rentals/Dispatch/Scheduling/Labor are opt‑in modules
  over the IMS core.

## 7. Next action
Persist this file, then execute P0 → P5, committing after each module.
