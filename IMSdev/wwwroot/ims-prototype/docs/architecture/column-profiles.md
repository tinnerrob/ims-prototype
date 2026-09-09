# IMS — Column Profiles (Track A)

**Status:** Implemented (data‑grid tables). **Date:** 2026‑09‑09

## Mechanism (`js/grid.js`)
Every data grid renders through `IMSGrid`:
- **Column descriptors** `{ key, header, th/td classes, always?, render(rec) }`.
- **Visibility** persisted per table in `localStorage` under `ims.cols.<tableId>`
  (separate from the business snapshot `ims.store`).
- A **"Columns" gear** on each grid opens a checkbox menu; toggling re‑renders
  the table and persists. "Reset to defaults" clears the key.
- `always:true` columns (primary key + Actions) can’t be hidden.
- `render` fns may read dotted paths via `IMSGrid.getValueByPath` (ready for
  Track B `extended_attributes.*`).

## Covered grids (table id)
- Inventory Items/Stock: `inv-serialized`, `inv-bulk`, `inv-consumable`,
  `inv-parts`, `inv-labor`, `inv-attachments`
- Parties & Orders: `cc-customers`, `cc-contracts`
- Yard: `yard-insp`
- Invoicing: `inv-ledger`
- Categories: `cat-cats`
- Rerents: `rr-list`
- Geo fleet: `geo-fleet`
- Pricing: `tax-grid`, `oh-grid`
- Logistics: `log-dispatch`
- Healthcare catalog (Items & Stock "medical" tab, shown when vertical = Healthcare): `inv-medical`

## Layouts NOT converted (not column grids — skip for Track A)
Scheduler orders/allocations + inventory pool (cards/timeline/drag), Branches
(card grid), Timesheet (timeline). Geo map/legend + scheduler timeline are not
tabular and are excluded by design.
