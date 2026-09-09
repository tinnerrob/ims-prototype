/* =========================================================
   IMS — healthcare.js  (2nd vertical catalog)
   Healthcare / medical devices store extended attributes
   (lot_number, expiration_date, sterilization_status,
   fda_class) in the JSONB extended_attributes bucket, driven by
   the metadata registry for the Healthcare vertical.
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
  cols.push({ key:"actions", header:"Actions", th:"text-end", td:"text-end text-nowrap", always:true, render: r => `<button class="btn btn-ims-outline btn-sm2" data-hedit="${r.id}"><i class="bi bi-pencil"></i> Edit</button>` });
  return cols;
}

function healthcareTable(){
  return IMSGrid.render("health-list", healthcareCols(), IMS.healthcare, { empty:"No medical devices.", trAttrs: r => `data-edit="${r.id}"` });
}

function renderHealthcare(){
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-heart-pulse"></i> Healthcare / Medical Devices</span>
      <span class="text-muted2 text-12">Vertical: Healthcare · ${IMS.healthcare.length} units</span>
      <button class="btn btn-ims" id="hAdd"><i class="bi bi-plus-lg"></i> Add Medical Device</button></div>
    <div class="card-body">${healthcareTable()}</div></div>`;
  IMSGrid.ensure("health-list", renderHealthcare);
  $("#hAdd").addEventListener("click", () => healthcareModal(null));
  delegate($("#content"), "click", "[data-hedit]", b => healthcareModal(IMS.healthcare.find(x => x.id === b.dataset.hedit)));
  delegate($("#content"), "click", "tr[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    healthcareModal(IMS.healthcare.find(x => x.id === el.dataset.edit));
  });
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
        id: v.id, sku: v.id, name: v.name, status: v.status || "Available",
        purchaseValue: v.purchaseValue || 0, locationId: v.locationId || null,
        createdAt: (existing && existing.createdAt) || now, active: true
      };
      rec.extended_attributes = Object.assign({}, (existing && existing.extended_attributes) || {}, (v.extended_attributes) || {});
      if (IMS.store){ if (isEdit) IMS.store.repo("healthcare").update("id", existing.id, rec); else IMS.store.repo("healthcare").create(rec); }
      else { if (isEdit) Object.assign(existing, rec); else IMS.healthcare.push(rec); }
      renderHealthcare();
    }
  });
}
