# P4 — Terminology Migration Plan (contract→order, customer→party, items registry)

**Status:** In progress
**Owner:** Architecture
**Date:** 2026‑09‑08

## Why a plan first
`contract` appears ~623×, `serialized` ~133×, and `customer` ~110× across the JS
modules. These identifiers are cross‑cutting, so renames are done **one concept
at a time** as codemods, with a full jsdom regression after each commit. No DB
exists, so we adopt the new names for real — no aliases.

## Acceptance gate (run after every codemod commit)
1. `node --check` on every touched JS file.
2. jsdom: all 15 views render without throwing.
3. jsdom flow checks: hand‑off issue/return + movement model, rental wizard
   create (billable loan), allocations (scheduler) render, invoice/compute totals.
4. No leftover old identifiers for the concept being renamed (grep = 0).

## Ordered codemods

### 1. data layer + accessors (foundation)
Rename the collection and its core accessor, then cascade references.

### 2. Concept renames (do one per commit, in this order — least coupled first)
| # | Rename | Notes |
|---|---|---|
| A | `customer` → `party` | `IMS.customers→parties`, `getCustomer→getParty`, `.customerId→.partyId`, `.customer→.party`, `customerName→partyName`, `nextCustomerId→nextPartyId`, id prefix `CUST-`→`PTY-` |
| B | `contract` → `order` | `IMS.contracts→orders`, `getContract→getOrder`, `.contractId→.orderId`, `contractTotals→orderTotals`, `nextContractId→nextOrderId`, UI modals (`contractDetailModal→orderDetailModal`, etc.), id prefix `CT-`→`ORD-` |
| C | `serializedAssets` → `itemInstances` | keep `item_type='serialized'` items; rename collection + fields |
| D | unified **items registry** | `bulkResources/consumables/parts` (+ kits/attachments) under `items[]` with `itemType`, typed views/accessors |
| E | UI/domain strings | purge remaining "rental/contract/equipment" framing from module pages (Rentals module keeps its own language) |

## Glossary (canonical)
`party`, `order` / `orderType`, `item`, `itemInstance`, `location`, `movement`,
`stockLevel`, `policy`, `allocation`. See `ims-core-and-modules.md`.

## Notes / decisions
- Renames must update: seed data, id prefixes, accessors in `common.js`, all
  page modules, router copy, and any string/CSS class that leaks the old term.
- The **Rentals / Sub‑Rentals module** may keep "rental" phrasing internally,
  but its data still speaks `order_type='loan'` + `movement kind='issue'`.
- Do NOT rename in the same commit as unrelated features.

## Next action
Run codemod **2.A (customer → party)** as the first implementation commit, then
2.B (contract → order), etc. Each committed with the acceptance gate green.
