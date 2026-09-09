/* =========================================================
   IMS — healthcare.js  (Healthcare vertical catalog)
   When the active vertical (set on Feature Modules) is Healthcare,
   the Items & Stock page swaps its "serialized equipment" tab for
   this medical/device catalog. Medical devices store extended
   attributes (lot_number, expiration_date, sterilization_status,
   fda_class) in the JSONB extended_attributes bucket, driven by the
   metadata registry for the Healthcare vertical.
   ========================================================= */
"use strict";

const _op = arr => arr.map(v => ({ value: v, label: v }));

/* Columns = shared core + Healthcare registry extended attributes. */
function healthcareCols(){
  const cols = [
    { key:"id", header:"Item ID", td:"strong mono", always:true, render: r => r.id },
    { key:"sku", header:"SKU", render: r => r.sku },
    { key:"name", header:"Name", render: r => r.name },
    { key:"status", header:"Status", render: r => statusBadge(r.status || "Available") }
  ];
  IMS.metadata.registryFor("Healthcare").forEach(e => {
    cols.push({
      key: e.field_key,
      header: e.display_label,
      render: r => { const v = IMS.metadata.ext(r, e.field_key); return (v == null || v === "") ? "—" : v; }
    });
  });
  cols.push({ key:"actions", header:"Actions", th:"text-end", td:"text-end text-nowrap", always:true, render: r => `<button class="btn btn-ims-outline btn-sm2" data-mededit="${r.id}"><i class="bi bi-pencil"></i> Edit</button>` });
  return cols;
}

/* Medical grid rendered inside the Inventory "medical" tab. */
function medicalTable(){
  return IMSGrid.render("inv-medical", healthcareCols(), IMS.healthcare, { empty:"No medical devices.", trAttrs: r => `data-edit="${r.id}"` });
}

function healthcareModal(existing){
  const isEdit = !!existing;
  const now = new Date().toISOString().slice(0, 19);
  const idVal = existing ? existing.id : "MED-" + String(IMS.healthcare.length + 1001);
  const fields = [
    { key:"id", label:"Item ID", type:"text", value: idVal, required:true },
    { key:"name", label:"Name", type:"text", value: (existing && existing.name) || "" },
    { key:"status", label:"Status", type:"select", value: (existing && existing.status) || "Available", options: _op(["Available","In Use","Quarantined","Disposed"]) },
    { key:"purchaseValue", label:"Purchase Value ($)", type:"number", value: (existing && existing.purchaseValue) || 0 },
    { key:"locationId", label:"Location ID", type:"text", value: (existing && existing.locationId) || "BR-ATL" },
    { key:"lot_number", label:"Lot Number", type:"text", value: IMS.metadata.ext(existing, "lot_number") || "", bucket:"extended_attributes", section:"Extended Attributes (Healthcare)" },
    { key:"expiration_date", label:"Expiration Date", type:"date", value: IMS.metadata.ext(existing, "expiration_date") || "", bucket:"extended_attributes" },
    { key:"sterilization_status", label:"Sterilization Status", type:"select", value: IMS.metadata.ext(existing, "sterilization_status") || "Pending", options: _op(["Passed","Pending","Failed"]), bucket:"extended_attributes" },
    { key:"fda_class", label:"FDA Class", type:"text", value: IMS.metadata.ext(existing, "fda_class") || "", bucket:"extended_attributes" }
  ];
  openFormModal({
    id: "mdl-health", title: (isEdit ? "Edit" : "New") + " Medical Device", icon: "bi-heart-pulse", fields,
    onSave: v => {
      const rec = {
        id: v.id, tenantId: (existing && existing.tenantId) || "TENANT-001", sku: v.id, name: v.name, status: v.status || "Available",
        purchaseValue: v.purchaseValue || 0, locationId: v.locationId || null,
        createdAt: (existing && existing.createdAt) || now, active: true
      };
      rec.extended_attributes = Object.assign({}, (existing && existing.extended_attributes) || {}, (v.extended_attributes) || {});
      if (IMS.store){ if (isEdit) IMS.store.repo("healthcare").update("id", existing.id, rec); else IMS.store.repo("healthcare").create(rec); }
      else { if (isEdit) Object.assign(existing, rec); else IMS.healthcare.push(rec); }
      if (typeof renderInventory === "function" && App.view === "inventory") renderInventory(); else if (typeof renderInvPanel === "function") renderInvPanel();
    }
  });
}

