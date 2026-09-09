/* =========================================================
   IMS — metadata.js  (Metadata Registry Blueprint, additive)
   Declares the canonical CORE item columns plus the dynamic
   "extended attributes" per industry vertical (the JSONB bucket
   a real backend would store in extended_attributes). Loaded
   after data.js; nothing renders from it yet except helper reads,
   so it is purely additive until Track-B wiring lands.
   ========================================================= */
"use strict";

(function(){
  const VERTICALS = {
    HeavyEquipment: "Heavy Equipment",
    Rental: "Rental / Equipment",
    Healthcare: "Healthcare & Medical Devices",
    Lumberyard: "Lumber Yard",
    Warehouse: "Warehouse & Distribution"
  };

  /* Canonical core fields present on every item regardless of vertical. */
  const CORE_COLUMNS = [
    { key: "id",           label: "Item ID" },
    { key: "tenantId",     label: "Tenant ID", field: "tenant_id" },
    { key: "sku",          label: "SKU / Model" },
    { key: "name",         label: "Name" },
    { key: "status",       label: "Status" },
    { key: "purchaseValue",label: "Purchase Value", field: "purchase_value" },
    { key: "locationId",   label: "Location ID",    field: "location_id" },
    { key: "createdAt",    label: "Created At",     field: "created_at" }
  ];

  /* Extended-attribute registry. `path` points at today's flat field so reads
     are unchanged; once storage is normalized to extended_attributes the value
     moves under `field_key` with no renderer change (ext() prefers that). */
  const REGISTRY = [
    /* ---- HeavyEquipment (the app's primary vertical) ---- */
    { vertical:"HeavyEquipment", field_key:"serial_vin",    display_label:"Serial / VIN",    data_type:"string", path:"serial",    validation_rules:{},   is_searchable:true,  is_sortable:true },
    { vertical:"HeavyEquipment", field_key:"meter_hours",   display_label:"Meter Hours",     data_type:"number", path:"meterHours", validation_rules:{ min:0 }, is_searchable:true, is_sortable:true },
    { vertical:"HeavyEquipment", field_key:"fuel_type",     display_label:"Fuel Type",       data_type:"string", path:"fuelType",   validation_rules:{},   is_searchable:true,  is_sortable:true },
    { vertical:"HeavyEquipment", field_key:"make",          display_label:"Make",            data_type:"string", path:"make",       validation_rules:{},   is_searchable:true,  is_sortable:true },
    { vertical:"HeavyEquipment", field_key:"model",         display_label:"Model",           data_type:"string", path:"model",      validation_rules:{},   is_searchable:true,  is_sortable:true },
    { vertical:"HeavyEquipment", field_key:"telemetry_gps_enabled", display_label:"GPS Telemetry", data_type:"boolean", path:null, validation_rules:{}, is_searchable:false, is_sortable:false },

    /* ---- Healthcare (documented sample vertical for a future catalog) ---- */
    { vertical:"Healthcare", field_key:"lot_number",        display_label:"Lot Number",        data_type:"string", path:null, validation_rules:{ required:true }, is_searchable:true, is_sortable:true },
    { vertical:"Healthcare", field_key:"expiration_date",   display_label:"Expiration Date",   data_type:"date",   path:null, validation_rules:{ required:true }, is_searchable:true, is_sortable:true },
    { vertical:"Healthcare", field_key:"sterilization_status", display_label:"Sterilization Status", data_type:"string", path:null, validation_rules:{}, is_searchable:true, is_sortable:true },
    { vertical:"Healthcare", field_key:"fda_class",         display_label:"FDA Class",         data_type:"string", path:null, validation_rules:{}, is_searchable:true, is_sortable:true },

    /* ---- Rental / Equipment (rented, serialized assets) ---- */
    { vertical:"Rental", field_key:"serial_vin",        display_label:"Serial / VIN",    data_type:"string", path:null, validation_rules:{}, is_searchable:true, is_sortable:true },
    { vertical:"Rental", field_key:"meter_hours",       display_label:"Meter Hours",     data_type:"number", path:null, validation_rules:{ min:0 }, is_searchable:true, is_sortable:true },
    { vertical:"Rental", field_key:"fuel_type",         display_label:"Fuel Type",       data_type:"string", path:null, validation_rules:{}, is_searchable:true, is_sortable:true },
    { vertical:"Rental", field_key:"telemetry_gps_enabled", display_label:"GPS Telemetry", data_type:"boolean", path:null, validation_rules:{}, is_searchable:false, is_sortable:false },

    /* ---- Lumber Yard ---- */
    { vertical:"Lumberyard", field_key:"species",       display_label:"Species",          data_type:"string", path:null, validation_rules:{}, is_searchable:true, is_sortable:true },
    { vertical:"Lumberyard", field_key:"grade",         display_label:"Grade",            data_type:"string", path:null, validation_rules:{}, is_searchable:true, is_sortable:true },
    { vertical:"Lumberyard", field_key:"moisture_pct",  display_label:"Moisture (%)",     data_type:"number", path:null, validation_rules:{ min:0, max:100 }, is_searchable:true, is_sortable:true },
    { vertical:"Lumberyard", field_key:"length_ft",     display_label:"Length (ft)",      data_type:"number", path:null, validation_rules:{ min:0 }, is_searchable:true, is_sortable:true },

    /* ---- Warehouse / Distribution ---- */
    { vertical:"Warehouse", field_key:"storage_class",   display_label:"Storage Class",    data_type:"string", path:null, validation_rules:{}, is_searchable:true, is_sortable:true },
    { vertical:"Warehouse", field_key:"zone_id",         display_label:"Zone",             data_type:"string", path:null, validation_rules:{}, is_searchable:true, is_sortable:true },
    { vertical:"Warehouse", field_key:"aisle",           display_label:"Aisle / Bay",      data_type:"string", path:null, validation_rules:{}, is_searchable:true, is_sortable:true },
    { vertical:"Warehouse", field_key:"temperature_controlled", display_label:"Temp Controlled", data_type:"boolean", path:null, validation_rules:{}, is_searchable:false, is_sortable:false }
  ];

  function getPath(item, path){
    if (item == null || !path) return item;
    return String(path).split(".").reduce((o, k) => (o == null ? o : o[k]), item);
  }

  function vertical(){ try { const v = localStorage.getItem("ims.vertical"); if (v && VERTICALS[v]) return v; } catch(_) {} return "HeavyEquipment"; }
  function setVertical(v){ try { if (VERTICALS[v]) localStorage.setItem("ims.vertical", v); } catch(_) {} }

  function registryFor(v){ return REGISTRY.filter(e => e.vertical === (v || vertical())); }
  function findEntry(key){ return REGISTRY.find(e => e.field_key === key || e.path === key) || null; }

  /* Read an item's value for a registry entry (or a field_key/path string).
     Prefers the extended_attributes bucket, then the declared flat path, so the
     value is identical whether storage is flat or normalized JSONB. */
  function ext(item, ref){
    const entry = typeof ref === "string" ? findEntry(ref) : (ref || null);
    const fieldKey = entry ? entry.field_key : (typeof ref === "string" ? ref : null);
    if (item && item.extended_attributes && fieldKey && item.extended_attributes[fieldKey] !== undefined) return item.extended_attributes[fieldKey];
    const path = entry ? entry.path : fieldKey;
    return path ? getPath(item, path) : undefined;
  }

  /* Does the record carry any extended attributes yet? */
  function hasExtended(item){ return !!item && !!(item.extended_attributes && Object.keys(item.extended_attributes).length); }

  /* Convenience readers for the make/model pair (used across many modules). */
  function mk(item){ const v = ext(item, "make"); return v == null ? "" : String(v); }
  function mdl(item){ const v = ext(item, "model"); return v == null ? "" : String(v); }
  function mkName(item){
    if (item && item.name) return item.name;
    const m = mk(item), d = mdl(item);
    return ((m ? m + " " : "") + d).trim();
  }

  IMS.metadata = {
    version: 1,
    verticals: VERTICALS,
    coreColumns: CORE_COLUMNS,
    registry: REGISTRY,
    vertical: vertical,
    setVertical: setVertical,
    registryFor: registryFor,
    findEntry: findEntry,
    ext: ext,
    getPath: getPath,
    hasExtended: hasExtended,
    mk: mk,
    mdl: mdl,
    mkName: mkName
  };
})();
