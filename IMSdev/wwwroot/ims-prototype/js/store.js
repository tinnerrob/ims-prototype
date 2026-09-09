/* =========================================================
   IMS — store.js  (JSON data service / API seam)
   Central access to the core JSON collections. Views will read
   and write through repositories; a future `apiAdapter` can back
   these same methods (async, JSON) without touching modules.
   Business data persists as JSON (localStorage) behind `save`.
   ========================================================= */
"use strict";

IMS.store = (function(){
  const listeners = [];
  let autoSave = true;

  /* Resolve a live array (or settings/category table) for a table name.
     Both canonical table names and the item-catalog type aliases used by the
     item registry resolve here, so CRUD writers can use one seam for any
     collection. */
  function table(name){
    const map = {
      parties: IMS.parties, orders: IMS.orders, movements: IMS.movements, labor: IMS.labor,
      itemInstances: IMS.itemInstances, bulkResources: IMS.bulkResources,
      consumables: IMS.consumables, parts: IMS.parts, kits: IMS.kits, attachments: IMS.attachments,
      workOrders: IMS.workOrders, timesheets: IMS.timesheets, inspections: IMS.inspections,
      rentals: IMS.rentals, vehicles: IMS.vehicles, dispatches: IMS.dispatches,
      invoices: IMS.invoices, assetAttachments: IMS.assetAttachments,
      /* item-catalog type aliases (mirror itemRegistry.typeKey) */
      serialized: IMS.itemInstances, bulk: IMS.bulkResources, consumable: IMS.consumables,
      part: IMS.parts, kit: IMS.kits, attachment: IMS.attachments,
      /* settings collections */
      branches: IMS.settings.branches, taxSchedules: IMS.settings.taxSchedules,
      overheads: IMS.settings.overheads
    };
    if (map[name]) return map[name];
    /* per-type category lists live under settings.categories (key e.g. "parts") */
    if (name.indexOf("categories.") === 0){
      const key = name.slice("categories.".length);
      return (IMS.settings.categories || {})[key] || null;
    }
    return null;
  }

  function emit(name){
    listeners.forEach(fn => { try { fn(name); } catch(_) {} });
    if (autoSave) save();
  }

  function repo(name){
    const arr = table(name);
    return {
      name,
      list(){ return arr ? arr.slice() : []; },
      get(pred){ return arr ? arr.find(pred) || null : null; },
      create(rec){
        if (!arr) throw new Error("Unknown store table: " + name);
        arr.push(rec); emit(name); return rec;
      },
      update(idField, id, patch){
        if (!arr) return null;
        const rec = arr.find(r => r[idField] === id);
        if (rec){ Object.assign(rec, patch); emit(name); return rec; }
        return null;
      },
      remove(idField, id){
        if (!arr) return false;
        const i = arr.findIndex(r => r[idField] === id);
        if (i >= 0){ arr.splice(i, 1); emit(name); return true; }
        return false;
      }
    };
  }

  const STORE_KEY = "ims.store";
  const SNAPSHOT_VERSION = 2;

  /* Every top-level array the app seeds. Save reads the LIVE arrays, so any
     change (repo-driven or direct) present at save time is captured. */
  const ARRAY_NAMES = [
    "parties", "orders", "movements", "labor",
    "itemInstances", "bulkResources", "consumables", "parts", "kits", "attachments",
    "assetAttachments", "workOrders", "timesheets", "inspections",
    "dispatches", "invoices", "rentals", "vehicles"
  ];
  /* settings keys persisted (featureModules is owned by the Config page/loader) */
  const SETTINGS_KEYS = ["branches", "taxSchedules", "categories", "overheads", "pricing"];

  /* JSON persistence behind the store (swap for API in future). */
  function save(){
    const snap = { _v: SNAPSHOT_VERSION, settings: {} };
    ARRAY_NAMES.forEach(n => { if (Array.isArray(IMS[n])) snap[n] = IMS[n]; });
    SETTINGS_KEYS.forEach(k => { if (IMS.settings[k] !== undefined) snap.settings[k] = IMS.settings[k]; });
    try { if (window.localStorage) localStorage.setItem(STORE_KEY, JSON.stringify(snap)); } catch(_) {}
  }
  function hydrate(){
    try {
      if (!window.localStorage) return;
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw);
      if (!snap || snap._v !== SNAPSHOT_VERSION) return;
      /* restore arrays in place so live references (registry views) survive */
      ARRAY_NAMES.forEach(k => {
        if (Array.isArray(snap[k]) && Array.isArray(IMS[k])){ IMS[k].length = 0; snap[k].forEach(r => IMS[k].push(r)); }
      });
      if (snap.settings && IMS.settings){
        SETTINGS_KEYS.forEach(k => { if (snap.settings[k] !== undefined) IMS.settings[k] = snap.settings[k]; });
      }
    } catch(_) {}
  }

  /* B3-lite: stamp every item record with the canonical CORE fields and an
     `extended_attributes` JSONB bucket. Additive — legacy flat fields are left
     intact so no consumer changes; the bucket is where vertical fields land
     after the (deferred) full relocation. */
  function ensureCoreFields(){
    const types = (IMS.itemRegistry && Object.keys(IMS.itemRegistry.idKey || {})) || [];
    const now = new Date().toISOString().slice(0, 19);
    types.forEach(t => {
      (IMS.itemRegistry.getByType(t) || []).forEach(r => {
        if (!r) return;
        const idKey = IMS.itemRegistry.idKey[t];
        const pk = r[idKey] != null ? r[idKey] : r.id;
        if (r.id == null) r.id = pk;
        if (r.sku == null) r.sku = (t === "serialized" || t === "bulk" || t === "consumable" || t === "part") ? pk : (pk || "");
        if (r.name == null){
          if (t === "serialized") r.name = ((r.make ? r.make + " " : "") + (r.model || "")).trim() || pk;
          else if (r.description) r.name = r.description;
          else r.name = pk;
        }
        if (r.status == null) r.status = r.active === false ? "Inactive" : "Active";
        if (r.purchaseValue == null) r.purchaseValue = 0;
        if (r.locationId == null) r.locationId = null;
        if (r.createdAt == null) r.createdAt = now;
        if (r.extended_attributes == null || typeof r.extended_attributes !== "object") r.extended_attributes = {};
        /* B3 (isolated fields): relocate serialized type-specific fields into
           extended_attributes (registry field_key <- flat key). */
        if (t === "serialized"){
          const RELOC = [ ["meter_hours", "meterHours"], ["fuel_type", "fuelType"] ];
          RELOC.forEach(([fieldKey, flatKey]) => {
            const v = r.extended_attributes[fieldKey] != null ? r.extended_attributes[fieldKey] : (r[flatKey] != null ? r[flatKey] : null);
            if (v != null) r.extended_attributes[fieldKey] = v;
            delete r[flatKey];
          });
        }
      });
    });
  }

  return {
    /* apiAdapter: set { list, create, update, remove } (async JSON) later. */
    api: { mode: "local", adapter: null },

    repo,
    on(fn){ listeners.push(fn); },
    /* Toggle JSON persistence (default on in this prototype). */
    setAutoSave(v){ autoSave = !!v; },
    save,
    hydrate,
    normalizeCore: ensureCoreFields
  };
})();

