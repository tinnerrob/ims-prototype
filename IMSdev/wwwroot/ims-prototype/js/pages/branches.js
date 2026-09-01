/* =========================================================
   IMS — branches.js (split out of app.js)
   Branch / yard profiles.
   ========================================================= */
"use strict";

function renderBranches(){
  const cards = IMS.settings.branches.map((b, i) => `<div class="card mb-3"><div class="card-body">
    <div class="d-flex justify-content-between align-items-start">
      <div><div class="strong"><i class="bi bi-buildings me-1"></i>${b.branchId} — ${b.name}</div>
        <div class="text-muted2" style="font-size:12px">${b.address}</div>
        <div class="text-muted2" style="font-size:12px">${b.phone} · ${b.tz}</div></div>
      <div class="d-flex gap-1">
        <button class="btn btn-ims-outline btn-sm2" data-bed="${i}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-ims-outline btn-sm2" data-bdel="${i}"><i class="bi bi-x-lg"></i></button>
      </div>
    </div>
  </div></div>`).join("") || `<p class="text-muted2 py-3">No branches configured.</p>`;
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-buildings"></i> Branch / Yard Profiles</span>
      <button class="btn btn-ims btn-sm2" id="brAdd"><i class="bi bi-plus-lg"></i> New Branch</button></div>
      <div class="card-body">${cards}</div></div>`;
  $("#brAdd").addEventListener("click", () => branchConfigModal(null));
  $$("[data-bed]").forEach(b => b.addEventListener("click", () => branchConfigModal(IMS.settings.branches[parseInt(b.dataset.bed, 10)])));
  $$("[data-bdel]").forEach(b => b.addEventListener("click", () => { IMS.settings.branches.splice(parseInt(b.dataset.bdel, 10), 1); renderBranches(); }));
}

function branchConfigModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  openFormModal({
    id: "mdl-br", title: (isEdit ? "Edit" : "New") + " Branch / Yard Profile", icon: "bi-buildings",
    fields: [
      { key:"branchId", label:"Branch ID", type:"text", value: e.branchId || "BR-" + (IMS.settings.branches.length + 1), required:true },
      { key:"name", label:"Name", type:"text", value: e.name || "" },
      { key:"address", label:"Address", type:"text", value: e.address || "" },
      { key:"phone", label:"Phone", type:"text", value: e.phone || "" },
      { key:"tz", label:"Time Zone", type:"text", value: e.tz || "America/New_York" }
    ],
    onSave: v => {
      const rec = { branchId:v.branchId, name:v.name, address:v.address, phone:v.phone, tz:v.tz };
      if (isEdit) Object.assign(existing, rec);
      else IMS.settings.branches.push(rec);
      renderBranches();
    }
  });
}

