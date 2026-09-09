# IMS — Metadata Registry & Multi-Vertical Extended Attributes (Track B)

**Status:** Implemented end‑to‑end (two verticals). **Date:** 2026‑09‑09

## Model
- **Core** on every item: `id, sku, name, status, purchase_value (purchaseValue),
  location_id (locationId), created_at (createdAt)`.
- **Extended** attributes per industry vertical live in a JSONB‑style bucket:
  `extended_attributes.<field_key>`. What belongs in the bucket is declared by the
  **metadata registry** (`js/metadata.js` → `IMS.metadata.registry`):
  `{ vertical, field_key, display_label, data_type, validation_rules, path,
     is_searchable, is_sortable }`.

## Verticals
- **HeavyEquipment** (primary): `serial_vin, meter_hours, fuel_type, make, model,
  telemetry_gps_enabled`. These serialized fields are fully **relocated** into
  `extended_attributes` (flat keys removed) — see the B3 section.
- **Healthcare** (2nd vertical): `lot_number, expiration_date,
  sterilization_status, fda_class` — a medical/device catalog shown as the
  **Items & Stock "medical" tab** (vertical = Healthcare, chosen on Feature
  Modules), replacing the serialized-equipment tab.

## Vertical drives Items & Stock
The active vertical (set on **Feature Modules** → `IMS.metadata.setVertical`,
persisted `ims.vertical`) controls which item tabs appear on Items & Stock:
- **HeavyEquipment** (default): serialized, attachments, kits + the shared base
  (bulk, consumable, parts/stock, labor).
- **Rental**: serialized, attachments, kits + shared base (rented equipment).
- **Healthcare**: a medical/device catalog instead of serialized/attachments/kits,
  plus the shared base (bulk, consumable, parts, labor).
- **Lumberyard** / **Warehouse**: a base stock catalog (bulk, consumable, parts,
  labor) — quantity/bin-based, no rented serialized equipment.

Base item shape: `id, tenant_id, sku-or-model, status, location_id` plus the
vertical's `extended_attributes`. Each vertical has its own registry rows
(`Rental`, `Lumberyard`, `Warehouse` included).

There is no separate Healthcare page — the same Items & Stock table is
"industry-aware" and shows the tabs for the active vertical.

## Implementation status (Track B)
- **B0** registry module `js/metadata.js` (`IMS.metadata`): `registryFor`,
  `findEntry`, `ext`, `getPath`, plus convenience `mk/mdl/mkName`.
- **B1** `ext(item, ref)` reads `extended_attributes` first, else the flat `path`
  — so rendering is identical whether storage is flat or normalized.
- **B2** `openFormModal` supports `bucket:"extended_attributes"` fields (values
  save under `vals.bucket[key]`).
- **B3‑lite** `IMS.store.normalizeCore()` stamps canonical core + an empty
  `extended_attributes` bucket on every item (runs at boot after hydrate).
- **B3‑full (HeavyEquipment)** `normalizeCore` relocates serialized
  `serial_vin/make/model/meter_hours/fuel_type` into the bucket and deletes the
  flat keys; all consumers read via `ext()/mk/mdl/mkName`.
- Structural (non‑vertical) fields — serialized `category` + rates/deposit/geo,
  and the bulk/consumable/part/kit/attachment stock fields — are intentionally
  kept core (they feed pricing/invoicing/stock).

## How to add a field / vertical (repeatable recipe)
1. Add a registry row (`vertical`, `field_key`, …). Give it a `path` while the
   value still lives flat (or `path:null` if bucket‑only).
2. Add it to the type’s `RELOC` list in `store.normalizeCore` to move existing
   flat values into the bucket (and delete the flat key) at boot.
3. Declare it as a `bucket:"extended_attributes"` field in the item form and
   read it via `IMS.metadata.ext(item, field_key)`.
4. Gate with `npm test` (registry + relocation assertions live in
   `test/gate.js`).
