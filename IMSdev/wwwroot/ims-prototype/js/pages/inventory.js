/* =========================================================
   IMS — inventory.js (split out of app.js)
   Inventory & assets view (serialized, bulk, consumables, labor, parts) plus kits & attachments management.
   ========================================================= */
"use strict";

/* =========================================================
   STAGE 1 — INVENTORY / RESOURCE MASTER LISTS
   ========================================================= */

function invAddLabel(){
  switch (App.invTab) {
    case "serialized": return "New Equipment";
    case "bulk": return "New Bulk Resource";
    case "consumable": return "New Consumable";
    case "parts": return "New Part";
    case "labor": return "New Labor Item";
    case "kits": return "New Kit";
    case "attachments": return "New Attachment";
    default: return "Add Record";
  }
}

function renderInventory(){
  const tabs = [
    { key:"serialized",  label:"Serialized Equipment", icon:"bi-truck-front", count: IMS.serializedAssets.length },
    { key:"bulk",        label:"Bulk Resources",       icon:"bi-boxes",       count: IMS.bulkResources.length },
    { key:"consumable",  label:"Consumables",          icon:"bi-capsule",     count: IMS.consumables.length },
    { key:"parts",       label:"Stock Inventory",      icon:"bi-wrench-adjustable", count: IMS.parts.length },
    { key:"labor",       label:"Labor / Employees",    icon:"bi-person-badge", count: IMS.labor.length },
    { key:"attachments", label:"Attachments",          icon:"bi-paperclip",   count: IMS.attachments.length },
    { key:"kits",        label:"Kits",                 icon:"bi-puzzle",      count: IMS.kits.length }
  ];
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-box-seam"></i> Resource Master Lists</span>
        <button class="btn btn-ims" id="invAddBtn"><i class="bi bi-plus-lg"></i> ${invAddLabel()}</button></div>
      <div class="card-body">
        <div class="subtabs" id="invTabs">
        ${tabs.map(t => `<button class="subtab ${t.key === App.invTab ? "active" : ""}" data-tab="${t.key}">
          <i class="bi ${t.icon}"></i>${t.label}<span class="count-pill">${t.count}</span></button>`).join("")}
      </div>
      <div id="invPanel"></div>
    </div></div>`;
  delegate($("#content"), "click", "#invTabs .subtab", b => { App.invTab = b.dataset.tab; renderInventory(); });
  $("#invAddBtn").addEventListener("click", () => openAddModal(App.invTab));
  renderInvPanel();
}

function renderInvPanel(){
  const p = $("#invPanel");
  if (App.invTab === "serialized") p.innerHTML = serializedTable();
  else if (App.invTab === "bulk") p.innerHTML = bulkTable();
  else if (App.invTab === "consumable") p.innerHTML = consumableTable();
  else if (App.invTab === "parts") p.innerHTML = partsTable();
  else if (App.invTab === "labor") p.innerHTML = laborTable();
  else if (App.invTab === "kits") { renderInvKitsPanel(); return; }
  else if (App.invTab === "attachments") { renderInvAttachmentsPanel(); return; }
  bindInvActions();
}

function renderInvKitsPanel(){
  const p = $("#invPanel");
  p.innerHTML = kitsList();
  $$("[data-kedit]").forEach(b => b.addEventListener("click", () => kitModal(IMS.kits.find(x => x.kitId === b.dataset.kedit))));
  delegate(p, "click", "[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    kitModal(IMS.kits.find(x => x.kitId === el.dataset.edit));
  });
}

function renderInvAttachmentsPanel(){
  const p = $("#invPanel");
  p.innerHTML = attachmentsTable();
  $$("[data-aedit]").forEach(b => b.addEventListener("click", () => attachmentModal(IMS.attachments.find(x => x.accId === b.dataset.aedit))));
  delegate(p, "click", "[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    attachmentModal(IMS.attachments.find(x => x.accId === el.dataset.edit));
  });
}

function serializedTable(){
  const rows = IMS.serializedAssets.map(a => `
    <tr data-edit="${a.id}">
      <td class="strong mono">${a.id}</td>
      <td class="mono text-muted2">${a.serial}</td>
      <td>${a.make} ${a.model}</td>
      <td>${a.category}</td>
      <td class="num">${fmtInt(a.meterHours)}</td>
      <td>${a.fuelType}</td>
      <td class="num">${fmtMoney(a.purchaseValue)}</td>
      <td class="num"><span class="text-muted2">${fmtMoney(a.baseDaily)}</span> / <span class="text-muted2">${fmtMoney(a.baseWeekly)}</span> / <span class="text-muted2">${fmtMoney(a.baseMonthly)}</span></td>
      <td>${activeBadge(a)}${statusBadge(a.status)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-iview="${a.id}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-iedit="${a.id}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Asset ID</th><th>Serial / VIN</th><th>Make / Model</th><th>Category</th><th class="num">Meter Hrs</th>
    <th>Fuel</th><th class="num">Purchase Value</th><th class="num">Daily / Weekly / Monthly</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(10)}</tbody></table></div>`;
}

function bulkTable(){
  const rows = IMS.bulkResources.map(b => `
    <tr data-edit="${b.sku}">
      <td class="strong mono">${b.sku}</td>
      <td>${b.name}</td>
      <td>${b.category}</td>
      <td class="num">${fmtInt(b.totalOwned)}</td>
      <td class="num"><span class="strong">${fmtInt(b.qtyAvailable)}</span> / ${fmtInt(b.qtyOut)}</td>
      <td class="num">${fmtMoney(b.baseDaily)}</td>
      <td class="num">${fmtMoney(b.baseWeekly)}</td>
      <td class="num">${fmtMoney(b.baseMonthly)}</td>
      <td>${activeCell(b)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-iview="${b.sku}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-iedit="${b.sku}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>SKU</th><th>Name</th><th>Category</th><th class="num">Total Owned</th><th class="num">Avail / Out</th><th class="num">Daily</th><th class="num">Weekly</th><th class="num">Monthly</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(10)}</tbody></table></div>`;
}

function consumableTable(){
  const rows = IMS.consumables.map(c => {
    const low = c.qtyOnHand <= c.reorderPoint;
    return `<tr data-edit="${c.sku}">
      <td class="strong mono">${c.sku}</td>
      <td>${c.name}</td>
      <td>${c.category}</td>
      <td class="num"><span class="${low ? "text-danger strong" : ""}">${fmtInt(c.qtyOnHand)}</span></td>
      <td class="num text-muted2">${fmtInt(c.reorderPoint)}</td>
      <td class="num">${fmtMoney(c.costPrice)}</td>
      <td class="num">${fmtMoney(c.retailPrice)}</td>
      <td>${c.active === false ? `<span class="badge-status st-out"><i class="bi bi-circle-fill"></i>Inactive</span>` : (low ? `<span class="badge-status st-reorder"><i class="bi bi-exclamation-triangle"></i>Reorder</span>` : `<span class="badge-status st-available"><i class="bi bi-circle-fill"></i>Stocked</span>`)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-iview="${c.sku}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-iedit="${c.sku}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>SKU</th><th>Name</th><th>Category</th><th class="num">On Hand</th><th class="num">Reorder Pt</th><th class="num">Cost Price</th><th class="num">Retail Price</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(9)}</tbody></table></div>`;
}

function laborTable(){
  const rows = IMS.labor.map(e => `
    <tr data-edit="${e.empId}">
      <td class="strong mono">${e.empId}</td>
      <td>${e.name}</td>
      <td>${e.role}</td>
      <td>${e.category}</td>
      <td>${e.certs.map(c => `<span class="badge-status st-staged">${c}</span>`).join(" ")}</td>
      <td class="num">${fmtMoney(e.hourlyCost)}</td>
      <td class="num">${fmtMoney(e.hourlyBillable)}</td>
      <td class="num text-muted2">${fmtMoney(e.hourlyBillable - e.hourlyCost)}</td>
      <td>${activeCell(e)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-iview="${e.empId}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-iedit="${e.empId}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Emp ID</th><th>Full Name</th><th>Role</th><th>Category</th><th>Certifications</th><th class="num">Cost / hr</th><th class="num">Billable / hr</th><th class="num">Spread / hr</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(10)}</tbody></table></div>`;
}

function bindInvActions(){
  delegate($("#invPanel"), "click", "[data-iview]", b => {
    const id = b.dataset.iview;
    if (App.invTab === "serialized") serializedView(getAsset(id));
    else if (App.invTab === "bulk") bulkView(getBulk(id));
    else if (App.invTab === "consumable") consumableView(getConsumable(id));
    else if (App.invTab === "labor") laborView(getLabor(id));
    else if (App.invTab === "parts") partsView(getPart(id));
  });
  delegate($("#invPanel"), "click", "[data-iedit]", b => {
    const id = b.dataset.iedit;
    if (App.invTab === "serialized") serializedModal(getAsset(id));
    else if (App.invTab === "bulk") bulkModal(getBulk(id));
    else if (App.invTab === "consumable") consumableModal(getConsumable(id));
    else if (App.invTab === "labor") laborModal(getLabor(id));
    else if (App.invTab === "parts") partsModal(getPart(id));
  });
  /* Clicking a row opens the edit modal (ignores the action buttons/controls). */
  delegate($("#invPanel"), "click", "tr[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const id = el.dataset.edit;
    if (App.invTab === "serialized") serializedModal(getAsset(id));
    else if (App.invTab === "bulk") bulkModal(getBulk(id));
    else if (App.invTab === "consumable") consumableModal(getConsumable(id));
    else if (App.invTab === "labor") laborModal(getLabor(id));
    else if (App.invTab === "parts") partsModal(getPart(id));
  });
}


function serializedView(a){
  const cons = contractRefs("serialized", a.id);
  const wos = IMS.workOrders.filter(w => w.assetId === a.id);
  const consList = cons.map(({contract, lines}) => lines.map(li => {
    const t = contractTotals(contract);
    return `<div class="list-line"><span class="l"><span class="strong mono">${contract.contractId}</span> — ${contract.projectName} ${statusBadge(contract.status)}</span><span class="r">${fmtMoney(computeLineTotal(li, contract))}</span></div>`;
  }).join("")).join("");
  const woList = wos.map(w => {
    const x = woComputed(w);
    return `<div class="list-line"><span class="l"><span class="strong mono">${w.woId}</span> — ${w.type} ${statusBadge(w.status)}</span><span class="r">${fmtMoney(x.total)}</span></div>`;
  }).join("");
  const atts = IMS.assetAttachments.filter(x => x.assetId === a.id).map(x => IMS.attachments.find(t => t.accId === x.accId)).filter(Boolean);
  const attList = atts.map(t => `<div class="list-line"><span class="l"><span class="strong mono">${t.accId}</span> — ${t.name} <span class="text-muted2">(${t.category})</span></span><span class="r">${fmtMoney(t.daily)}/day</span></div>`).join("");
  openRawModal({
    id: "mdl-aview", size: "lg", title: "Asset — " + a.id, icon: "bi-truck-front",
    body: detailGrid([
      ["Asset ID", a.id], ["Serial / VIN", a.serial], ["Make / Model", a.make + " " + a.model], ["Category", a.category],
      ["Meter Hours", fmtInt(a.meterHours)], ["Fuel", a.fuelType], ["Purchase Value", fmtMoney(a.purchaseValue)],
      ["Daily", fmtMoney(a.baseDaily)], ["Weekly", fmtMoney(a.baseWeekly)], ["Monthly", fmtMoney(a.baseMonthly)],
      ["GPS Coord", a.lat.toFixed(4) + ", " + a.lng.toFixed(4)], ["Status", statusBadge(a.status)]
    ])
      + section("Assigned to Contracts (" + cons.length + ")", consList)
      + section("Associated Attachments (" + atts.length + ")", attList)
      + section("Maintenance Work Orders (" + wos.length + ")", woList),
    footer: closeBtn
  });
}

function bulkView(b){
  const cons = contractRefs("bulk", b.sku);
  const consList = cons.map(({contract, lines}) => lines.map(li =>
    `<div class="list-line"><span class="l"><span class="strong mono">${contract.contractId}</span> — ${contract.projectName} ${statusBadge(contract.status)}</span><span class="r">${fmtInt(li.qty)} units · ${fmtMoney(computeLineTotal(li, contract))}</span></div>`).join("")).join("");
  openRawModal({
    id: "mdl-bview", size: "lg", title: "Bulk Resource — " + b.sku, icon: "bi-boxes",
    body: detailGrid([
      ["SKU", b.sku], ["Name", b.name], ["Category", b.category],
      ["Total Owned", fmtInt(b.totalOwned)], ["Available", fmtInt(b.qtyAvailable)], ["Out", fmtInt(b.qtyOut)],
      ["Daily", fmtMoney(b.baseDaily)], ["Weekly", fmtMoney(b.baseWeekly)], ["Monthly", fmtMoney(b.baseMonthly)]
    ]) + section("Assigned to Contracts (" + cons.length + ")", consList),
    footer: closeBtn
  });
}

function consumableView(c){
  const cons = contractRefs("consumable", c.sku);
  const consList = cons.map(({contract, lines}) => lines.map(li =>
    `<div class="list-line"><span class="l"><span class="strong mono">${contract.contractId}</span> — ${contract.projectName} ${statusBadge(contract.status)}</span><span class="r">${fmtInt(li.qty)} × ${fmtMoney(computeLineTotal(li, contract))}</span></div>`).join("")).join("");
  const wos = IMS.workOrders.filter(w => (w.parts || []).some(p => p.sku === c.sku));
  const woList = wos.map(w => { const x = woComputed(w); return `<div class="list-line"><span class="l"><span class="strong mono">${w.woId}</span> — ${w.assetId} ${statusBadge(w.status)}</span><span class="r">${fmtMoney(x.total)}</span></div>`; }).join("");
  openRawModal({
    id: "mdl-coview", size: "lg", title: "Consumable — " + c.sku, icon: "bi-capsule",
    body: detailGrid([
      ["SKU", c.sku], ["Name", c.name], ["Category", "Consumable"],
      ["On Hand", fmtInt(c.qtyOnHand) + (c.qtyOnHand <= c.reorderPoint ? " <span class=\"badge-status st-reorder\">Reorder</span>" : "")],
      ["Reorder Point", fmtInt(c.reorderPoint)], ["Cost Price", fmtMoney(c.costPrice)], ["Retail Price", fmtMoney(c.retailPrice)]
    ])
      + section("Used on Contracts (" + cons.length + ")", consList)
      + section("Used in Work Orders (" + wos.length + ")", woList),
    footer: closeBtn
  });
}

function laborView(e){
  const cons = contractRefs("labor", e.empId);
  const consList = cons.map(({contract, lines}) => lines.map(li =>
    `<div class="list-line"><span class="l"><span class="strong mono">${contract.contractId}</span> — ${contract.projectName} ${statusBadge(contract.status)}</span><span class="r">${fmtInt(li.qty)} hr · ${fmtMoney(computeLineTotal(li, contract))}</span></div>`).join("")).join("");
  const ts = IMS.timesheets.filter(x => x.empId === e.empId);
  const tsList = ts.map(x => `<div class="list-line"><span class="l">${fmtDate(x.date)} · ${x.targetType === "contract" ? "Job" : "WO"} ${x.targetId}</span><span class="r">${x.hours} hr · ${fmtMoney(x.hours * e.hourlyCost)}</span></div>`).join("");
  openRawModal({
    id: "mdl-lview", size: "lg", title: "Employee — " + e.empId, icon: "bi-person-badge",
    body: detailGrid([
      ["Emp ID", e.empId], ["Name", e.name], ["Role", e.role],
      ["Certifications", e.certs.join(", ")], ["Cost / hr", fmtMoney(e.hourlyCost)], ["Billable / hr", fmtMoney(e.hourlyBillable)],
      ["Spread / hr", fmtMoney(e.hourlyBillable - e.hourlyCost)], ["Status", "Active"]
    ])
      + section("Assigned to Contracts (" + cons.length + ")", consList)
      + section("Timesheet Entries (" + ts.length + ")", tsList),
    footer: closeBtn
  });
}

function partsTable(){
  const rows = IMS.parts.map(p => {
    const low = p.qtyOnHand <= p.reorderPoint;
    return `<tr data-edit="${p.partId}">
      <td class="strong mono">${p.partId}</td>
      <td>${p.description}</td>
      <td>${p.category}</td>
      <td class="mono text-muted2">${p.bin}</td>
      <td class="num"><span class="${low ? "text-danger strong" : ""}">${fmtInt(p.qtyOnHand)}</span></td>
      <td class="num text-muted2">${fmtInt(p.reorderPoint)}</td>
      <td class="num">${fmtMoney(p.costPrice)}</td>
      <td>${p.active === false ? `<span class="badge-status st-out"><i class="bi bi-circle-fill"></i>Inactive</span>` : (low ? `<span class="badge-status st-reorder"><i class="bi bi-exclamation-triangle"></i>Reorder</span>` : `<span class="badge-status st-available"><i class="bi bi-circle-fill"></i>Stocked</span>`)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-iview="${p.partId}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-iedit="${p.partId}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Part ID</th><th>Description</th><th>Category</th><th>Bin / Aisle</th><th class="num">On Hand</th><th class="num">Reorder Pt</th><th class="num">Cost Price</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(9)}</tbody></table></div>`;
}

function partsFields(e){
  e = e || {};
  return [
    { key:"active", label:"Active", type:"checkbox", value: recActive(e) },
    { key:"partId", label:"Part ID (PK)", type:"text", value: e.partId || "PRT-" + String(IMS.parts.length + 1).padStart(3, "0"), required:true },
    { key:"description", label:"Description", type:"text", value: e.description || "" },
    { key:"category", label:"Category", type:"select", value: e.category || activeCats("parts")[0], options: catOptions("parts", e.category) },
    { key:"bin", label:"Bin / Aisle Location", type:"text", value: e.bin || "" },
    { key:"qtyOnHand", label:"Qty on Hand", type:"number", value: e.qtyOnHand || 0 },
    { key:"reorderPoint", label:"Reorder Point", type:"number", value: e.reorderPoint || 0 },
    { key:"costPrice", label:"Cost Price ($)", type:"number", value: e.costPrice || 0 }
  ];
}

function partsModal(existing){
  const isEdit = !!existing;
  openFormModal({
    id: "mdl-part", title: (isEdit ? "Edit" : "New") + " Stock Part (Service Inventory)", icon: "bi-wrench-adjustable",
    fields: partsFields(existing),
    onSave: v => {
      const rec = { active:v.active !== false, partId:v.partId, description:v.description, category:v.category, bin:v.bin, qtyOnHand:v.qtyOnHand, reorderPoint:v.reorderPoint, costPrice:v.costPrice };
      if (isEdit) Object.assign(existing, rec);
      else IMS.parts.push(rec);
      renderInventory();
    }
  });
}

function partsView(p){
  const wos = IMS.workOrders.filter(w => (w.parts || []).some(x => x.kind === "part" && x.refId === p.partId));
  const woList = wos.map(w => { const c = woComputed(w); return `<div class="list-line"><span class="l"><span class="strong mono">${w.woId}</span> — ${w.assetId} ${statusBadge(w.status)}</span><span class="r">${fmtMoney(c.total)}</span></div>`; }).join("");
  openRawModal({
    id: "mdl-pview", size: "lg", title: "Service Part — " + p.partId, icon: "bi-wrench-adjustable",
    body: detailGrid([
      ["Part ID", p.partId], ["Description", p.description], ["Bin / Aisle", p.bin],
      ["Qty on Hand", fmtInt(p.qtyOnHand) + (p.qtyOnHand <= p.reorderPoint ? " <span class=\"badge-status st-reorder\">Reorder</span>" : "")],
      ["Reorder Point", fmtInt(p.reorderPoint)], ["Cost Price", fmtMoney(p.costPrice)], ["Status", p.active === false ? "Inactive" : "Active"]
    ]) + section("Used in Work Orders (" + wos.length + ")", woList),
    footer: closeBtn
  });
}

/* ---------- inventory record lookup + detail-modal helpers ---------- */
const getAsset = id => IMS.serializedAssets.find(a => a.id === id);
const getBulk = id => IMS.bulkResources.find(b => b.sku === id);
const getConsumable = id => IMS.consumables.find(c => c.sku === id);
const getLabor = id => IMS.labor.find(e => e.empId === id);
const getPart = id => IMS.parts.find(p => p.partId === id);
const contractRefs = (type, ref) => IMS.contracts
  .map(c => ({ contract: c, lines: (c.lineItems || []).filter(li => li.type === type && li.refId === ref) }))
  .filter(x => x.lines.length);
const detailGrid = pairs => `<div class="row g-3">${pairs.map(p => `<div class="col-md-4 field-group"><label class="form-label">${p[0]}</label><div class="form-control-plaintext strong">${p[1]}</div></div>`).join("")}</div>`;
const section = (title, html) => `<div class="divider"></div><div class="strong mb-2">${title}</div>${html || `<p class="text-muted2 py-2">None.</p>`}`;
const closeBtn = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Close</button>`;

/* ---------- creation wizards (resource categories) ---------- */
function assetCode(cat){
  const m = { "Boom Lift":"BL", "Skid Steer":"SS", "Mini Excavator":"ET", "Forklift":"FL", "Generator":"GN", "Telehandler":"TL", "Compressor":"CP", "Light Tower":"LT" };
  return m[cat] || "AS";
}

function nextAssetId(cat){
  const code = assetCode(cat);
  let max = 0;
  IMS.serializedAssets.forEach(a => {
    if (a.id.startsWith(code + "-")) { const n = parseInt(a.id.split("-")[1], 10); if (n > max) max = n; }
  });
  return code + "-" + (max + 1);
}
const opt = arr => arr.map(v => ({ value: v, label: v }));

function openAddModal(tab){
  if (tab === "serialized") serializedModal();
  else if (tab === "bulk") bulkModal();
  else if (tab === "consumable") consumableModal();
  else if (tab === "labor") laborModal();
  else if (tab === "parts") partsModal();
  else if (tab === "kits") kitModal(null);
  else if (tab === "attachments") attachmentModal(null);
}

function serializedFields(e){
  e = e || {};
  return [
    { key:"active", label:"Active", type:"checkbox", value: recActive(e) },
    { key:"id", label:"Asset ID (PK)", type:"text", value: e.id || nextAssetId(e.category || "Boom Lift"), required:true },
    { key:"serial", label:"Serial / VIN", type:"text", value: e.serial || "" },
    { key:"make", label:"Make", type:"text", value: e.make || "" },
    { key:"model", label:"Model", type:"text", value: e.model || "" },
    { key:"category", label:"Category", type:"select", value: e.category || activeCats("serialized")[0], options: catOptions("serialized", e.category) },
    { key:"meterHours", label:"Current Meter Hours", type:"number", value: e.meterHours || 0 },
    { key:"fuelType", label:"Fuel Type", type:"select", value: e.fuelType || "Diesel", options: opt(["Diesel","Gasoline","Electric","LPG"]) },
    { key:"purchaseValue", label:"Purchase Value ($)", type:"number", value: e.purchaseValue || 0 },
    { key:"baseDaily", label:"Base Daily Rate ($)", type:"number", value: e.baseDaily || 0 },
    { key:"baseWeekly", label:"Base Weekly Rate ($)", type:"number", value: e.baseWeekly || 0, hint:"Weekly ≈ Daily × 5" },
    { key:"baseMonthly", label:"Base Monthly Rate ($)", type:"number", value: e.baseMonthly || 0, hint:"Monthly ≈ Daily × 15 (28-day period)" },
    { key:"lat", label:"Latitude", type:"number", value: e.lat ?? IMS.yard.lat, step:"0.0001" },
    { key:"lng", label:"Longitude", type:"number", value: e.lng ?? IMS.yard.lng, step:"0.0001" },
    { key:"status", label:"Status", type:"select", value: e.status || "Available", options: opt(["Available","On Rent","In Shop","Staged"]) }
  ];
}

function serializedModal(existing){
  const isEdit = !!existing;
  openFormModal({
    id: "mdl-serial", title: (isEdit ? "Edit" : "New") + " Serialized / Equipment Asset", icon: "bi-truck-front", large: true,
    fields: serializedFields(existing),
    onSave: v => {
      if (isEdit) {
        Object.assign(existing, { active:v.active !== false, serial:v.serial, make:v.make, model:v.model, category:v.category, meterHours:v.meterHours, fuelType:v.fuelType, purchaseValue:v.purchaseValue, baseDaily:v.baseDaily, baseWeekly:v.baseWeekly, baseMonthly:v.baseMonthly, lat:v.lat, lng:v.lng, status:v.status });
      } else {
        IMS.serializedAssets.push({ id:v.id, active:v.active !== false, serial:v.serial, make:v.make, model:v.model, category:v.category, meterHours:v.meterHours, fuelType:v.fuelType, purchaseValue:v.purchaseValue, baseDaily:v.baseDaily, baseWeekly:v.baseWeekly, baseMonthly:v.baseMonthly, lat:v.lat, lng:v.lng, status:v.status, battery:100, lastReported: new Date().toISOString().slice(0,19), contractId:null });
      }
      renderInventory();
    }
  });
}

function bulkFields(e){
  e = e || {};
  return [
    { key:"active", label:"Active", type:"checkbox", value: recActive(e) },
    { key:"sku", label:"SKU (PK)", type:"text", value: e.sku || "", required:true },
    { key:"name", label:"Name", type:"text", value: e.name || "" },
    { key:"category", label:"Category", type:"select", value: e.category || activeCats("bulk")[0], options: catOptions("bulk", e.category) },
    { key:"totalOwned", label:"Total Owned", type:"number", value: e.totalOwned || 0 },
    { key:"baseDaily", label:"Base Daily Rate / unit ($)", type:"number", value: e.baseDaily || 0 },
    { key:"baseWeekly", label:"Base Weekly Rate / unit ($)", type:"number", value: e.baseWeekly || 0 },
    { key:"baseMonthly", label:"Base Monthly Rate / unit ($)", type:"number", value: e.baseMonthly || 0 }
  ];
}

function bulkModal(existing){
  const isEdit = !!existing;
  openFormModal({
    id: "mdl-bulk", title: (isEdit ? "Edit" : "New") + " Bulk Resource", icon: "bi-boxes",
    fields: bulkFields(existing),
    onSave: v => {
      if (isEdit) {
        Object.assign(existing, { active:v.active !== false, sku:v.sku, name:v.name, category:v.category, totalOwned:v.totalOwned, baseDaily:v.baseDaily, baseWeekly:v.baseWeekly, baseMonthly:v.baseMonthly });
      } else {
        IMS.bulkResources.push({ active:v.active !== false, sku:v.sku, name:v.name, category:v.category, totalOwned:v.totalOwned, qtyAvailable:v.totalOwned, qtyOut:0, baseDaily:v.baseDaily, baseWeekly:v.baseWeekly, baseMonthly:v.baseMonthly });
      }
      renderInventory();
    }
  });
}

function consumableFields(e){
  e = e || {};
  return [
    { key:"active", label:"Active", type:"checkbox", value: recActive(e) },
    { key:"sku", label:"SKU (PK)", type:"text", value: e.sku || "", required:true },
    { key:"name", label:"Name", type:"text", value: e.name || "" },
    { key:"category", label:"Category", type:"select", value: e.category || activeCats("consumable")[0], options: catOptions("consumable", e.category) },
    { key:"qtyOnHand", label:"Qty on Hand", type:"number", value: e.qtyOnHand || 0 },
    { key:"reorderPoint", label:"Reorder Point", type:"number", value: e.reorderPoint || 0 },
    { key:"costPrice", label:"Cost Price ($)", type:"number", value: e.costPrice || 0 },
    { key:"retailPrice", label:"Retail Sale Price ($)", type:"number", value: e.retailPrice || 0 }
  ];
}

function consumableModal(existing){
  const isEdit = !!existing;
  openFormModal({
    id: "mdl-consum", title: (isEdit ? "Edit" : "New") + " Consumable (Sales Stock)", icon: "bi-capsule",
    fields: consumableFields(existing),
    onSave: v => {
      const rec = { active:v.active !== false, sku:v.sku, name:v.name, category:v.category, qtyOnHand:v.qtyOnHand, reorderPoint:v.reorderPoint, costPrice:v.costPrice, retailPrice:v.retailPrice };
      if (isEdit) Object.assign(existing, rec);
      else IMS.consumables.push(rec);
      renderInventory();
    }
  });
}

function laborFields(e){
  e = e || {};
  return [
    { key:"active", label:"Active", type:"checkbox", value: recActive(e) },
    { key:"empId", label:"Employee ID (PK)", type:"text", value: e.empId || "EMP-" + pad2(IMS.labor.length + 1), required:true },
    { key:"name", label:"Full Name", type:"text", value: e.name || "" },
    { key:"role", label:"Role", type:"select", value: e.role || "Operator", options: opt(["Operator","CDL Driver","Technician"]) },
    { key:"category", label:"Category", type:"select", value: e.category || activeCats("labor")[0], options: catOptions("labor", e.category) },
    { key:"certs", label:"Certifications (comma-separated)", type:"text", value: (e.certs || []).join(", ") || "OSHA 30" },
    { key:"hourlyCost", label:"Hourly Cost Rate ($)", type:"number", value: e.hourlyCost || 0 },
    { key:"hourlyBillable", label:"Hourly Billable Rate ($)", type:"number", value: e.hourlyBillable || 0 }
  ];
}

function laborModal(existing){
  const isEdit = !!existing;
  openFormModal({
    id: "mdl-labor", title: (isEdit ? "Edit" : "New") + " Labor / Employee Resource", icon: "bi-person-badge",
    fields: laborFields(existing),
    onSave: v => {
      const certs = String(v.certs).split(",").map(s => s.trim()).filter(Boolean);
      const rec = { active:v.active !== false, empId:v.empId, name:v.name, role:v.role, category:v.category, certs, hourlyCost:v.hourlyCost, hourlyBillable:v.hourlyBillable };
      if (isEdit) Object.assign(existing, rec);
      else IMS.labor.push(rec);
      renderInventory();
    }
  });
}


/* =========================================================
   PHASE 2 — PART 1: KITS & ATTACHMENTS
   ========================================================= */
function kitsList(){
  const cards = IMS.kits.map(k => {
    const comps = k.components.map(c => {
      const r = getResource({ type:c.refType, refId:c.refId });
      const rname = r ? (c.refType === "serialized" ? r.make + " " + r.model : r.name) : c.refId;
      const rate = r ? r.baseDaily : 0;
      return `<div class="list-line"><span class="l"><span class="type-chip tc-${c.refType}">${c.refType}</span> ${c.qty} × ${rname} <span class="mono">${c.refId}</span></span><span class="r">${fmtMoney(rate * c.qty)}/day</span></div>`;
    }).join("");
    return `<div class="card mb-3" data-edit="${k.kitId}">
      <div class="card-header"><span class="card-title"><i class="bi bi-puzzle"></i>${k.kitId} — ${k.name} ${activeBadge(k)}</span>
        <div><span class="strong me-3">${fmtMoney(k.baseRate)}/day</span>
          <button class="btn btn-ims-outline btn-sm2" data-kedit="${k.kitId}"><i class="bi bi-pencil"></i></button></div></div>
      <div class="card-body">${comps}</div>
    </div>`;
  }).join("");
  return cards || `<p class="text-muted2 py-4 text-center">No kits defined.</p>`;
}

function attachmentsTable(){
  const rows = IMS.attachments.map(a => {
    const links = IMS.assetAttachments.filter(x => x.accId === a.accId).map(x => x.assetId).join(", ") || "—";
    return `<tr data-edit="${a.accId}">
      <td class="strong mono">${a.accId}</td>
      <td>${a.name}</td>
      <td>${a.category}</td>
      <td class="num">${a.qtyOwned}</td>
      <td class="num">${fmtMoney(a.daily)}</td>
      <td class="mono">${(a.fits || []).join(", ")}</td>
      <td class="mono">${links}</td>
      <td>${activeCell(a)}</td>
      <td class="text-end"><button class="btn btn-ims-outline btn-sm2" data-aedit="${a.accId}"><i class="bi bi-pencil"></i></button></td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Acc ID</th><th>Name</th><th>Category</th><th class="num">Qty Owned</th><th class="num">Daily</th><th>Fits</th><th>Linked Assets</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(9)}</tbody></table></div>`;
}

function resOptions(){
  let o = `<option value="">— select component —</option>`;
  IMS.serializedAssets.forEach(a => o += `<option value="serialized|${a.id}">[Serialized] ${a.id} · ${a.make} ${a.model}</option>`);
  IMS.bulkResources.forEach(b => o += `<option value="bulk|${b.sku}">[Bulk] ${b.sku} · ${b.name}</option>`);
  IMS.consumables.forEach(c => o += `<option value="consumable|${c.sku}">[Consumable] ${c.sku} · ${c.name}</option>`);
  return o;
}

function nextKitId(){
  let max = 0;
  IMS.kits.forEach(k => { const n = parseInt(k.kitId.split("-")[1], 10); if (n > max) max = n; });
  return "KT-" + String(max + 1).padStart(3, "0");
}

function compRow(c, i){
  const r = getResource({ type:c.refType, refId:c.refId });
  const rname = r ? (c.refType === "serialized" ? r.make + " " + r.model : r.name) : c.refId;
  return `<div class="list-line"><span class="l"><span class="type-chip tc-${c.refType}">${c.refType}</span> ${c.qty} × ${rname} <span class="mono">${c.refId}</span></span>
    <span class="r"><button class="remove" data-rem="${i}"><i class="bi bi-x-circle"></i></button></span></div>`;
}

function renderKitComps(root, kit){
  const box = root.querySelector("#k-comps");
  box.innerHTML = kit.components.map((c, i) => compRow(c, i)).join("") || `<p class="text-muted2 py-2">No components bound yet.</p>`;
}

function kitModal(existing){
  const isEdit = !!existing;
  const kit = existing || { kitId: nextKitId(), name:"", baseRate:0, qtyOwned:1, components:[], active:true };
  const body = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="k-active" ${recActive(kit) ? "checked" : ""}><label class="form-check-label" for="k-active"><strong>Active</strong></label></div>
      <span class="text-muted2" style="font-size:11.5px">Inactive kits are not selectable</span>
    </div>
    <div class="row g-3">
      <div class="col-md-3 field-group"><label class="form-label">Kit ID</label><input class="form-control" id="k-kid" value="${kit.kitId}" disabled></div>
      <div class="col-md-3 field-group"><label class="form-label">Kit Name</label><input class="form-control" id="k-title" value="${kit.name}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Total Kit Base Rate ($/day)</label><input class="form-control" id="k-rate" type="number" value="${kit.baseRate}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Qty Owned</label><input class="form-control" id="k-owned" type="number" min="1" value="${kit.qtyOwned || 1}"></div>
    </div>
    <div class="divider"></div>
    <div class="strong mb-2"><i class="bi bi-link-45deg me-1"></i>Component Binding</div>
    <div class="row g-2 mb-2">
      <div class="col-md-6"><select class="form-select" id="k-res">${resOptions()}</select></div>
      <div class="col-md-2"><input class="form-control" id="k-qty" type="number" min="1" value="1"></div>
      <div class="col-md-4"><button class="btn btn-ims btn-sm2 w-100" id="k-add"><i class="bi bi-plus-lg"></i> Bind Component</button></div>
    </div>
    <div id="k-comps"></div>`;
  const footer = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
    <button type="button" class="btn btn-ims" id="k-save"><i class="bi bi-check2"></i> Save Kit</button>`;
  const root = openRawModal({ id:"mdl-kit", size:"lg", title:(isEdit ? "Edit" : "New") + " Kit / Assembly", icon:"bi-puzzle", body, footer });
  renderKitComps(root, kit);
  root.querySelector("#k-add").addEventListener("click", () => {
    const sel = root.querySelector("#k-res").value;
    if (!sel) return;
    const [type, ref] = sel.split("|");
    const qty = Math.max(1, parseInt(root.querySelector("#k-qty").value, 10) || 1);
    kit.components.push({ refType:type, refId:ref, qty });
    renderKitComps(root, kit);
  });
  root.querySelector("#k-comps").addEventListener("click", e => {
    const b = e.target.closest("[data-rem]");
    if (b) { kit.components.splice(parseInt(b.dataset.rem, 10), 1); renderKitComps(root, kit); }
  });
  root.querySelector("#k-save").addEventListener("click", () => {
    kit.name = root.querySelector("#k-title").value;
    kit.baseRate = parseFloat(root.querySelector("#k-rate").value) || 0;
    kit.qtyOwned = Math.max(1, parseInt(root.querySelector("#k-owned").value, 10) || 1);
    kit.active = root.querySelector("#k-active").checked;
    if (!isEdit) IMS.kits.push(kit);
    renderInventory();
    dismissModal(root);
  });
}

function assetIdChecks(cats, selected){
  const list = cats && cats.length ? IMS.serializedAssets.filter(a => cats.includes(a.category)) : [];
  return list.map(a => `<label class="check-line ${(selected || []).includes(a.id) ? "checked" : ""}"><input type="checkbox" value="${a.id}" ${(selected || []).includes(a.id) ? "checked" : ""}>${a.id} — ${a.make} ${a.model}</label>`).join("") || `<div class="text-muted2 py-2">Select a category above to see matching assets.</div>`;
}

function catChecks(cats, selected){
  return cats.map(c => `<label class="check-line ${selected.includes(c) ? "checked" : ""}"><input type="checkbox" value="${c}" ${selected.includes(c) ? "checked" : ""}>${c}</label>`).join("");
}

function attachmentModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  const cats = [...new Set(IMS.serializedAssets.map(a => a.category))].sort();
  const fits = e.fits || [];
  const selCats = cats.filter(c => fits.some(id => { const a = getAsset(id); return a && a.category === c; }));
  const body = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="a-active" ${recActive(e) ? "checked" : ""}><label class="form-check-label" for="a-active"><strong>Active</strong></label></div>
      <span class="text-muted2" style="font-size:11.5px">Inactive attachments are not selectable</span>
    </div>
    <div class="row g-3">
      <div class="col-md-4 field-group"><label class="form-label">Attachment ID</label><input class="form-control" id="a-accid" value="${e.accId || "ACC-" + String(IMS.attachments.length + 1).padStart(3, "0")}"></div>
      <div class="col-md-4 field-group"><label class="form-label">Name</label><input class="form-control" id="a-name" value="${e.name || ""}"></div>
      <div class="col-md-4 field-group"><label class="form-label">Category</label><select class="form-select" id="a-cat">${["Bucket","Carriage","Platform","Hydraulic","Lifting"].map(c => `<option ${c === (e.category || "Bucket") ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="col-md-3 field-group"><label class="form-label">Qty Owned</label><input class="form-control" id="a-qty" type="number" value="${e.qtyOwned || 0}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Daily Rate ($)</label><input class="form-control" id="a-daily" type="number" value="${e.daily || 0}"></div>
    </div>
    <div class="divider"></div>
    <div class="strong mb-2"><i class="bi bi-link-45deg me-1"></i>Fits Asset IDs</div>
    <div class="row g-2">
      <div class="col-md-6 field-group">
        <label class="form-label">1. Select Asset Category</label>
        <div class="mb-1"><button class="btn btn-ims-outline btn-sm2" type="button" id="a-cats-all"><i class="bi bi-check2-square"></i> Select All / None</button></div>
        <div class="check-list" id="a-cats">${catChecks(cats, selCats)}</div>
      </div>
      <div class="col-md-6 field-group">
        <label class="form-label">2. Select Asset IDs</label>
        <div class="mb-1"><button class="btn btn-ims-outline btn-sm2" type="button" id="a-all"><i class="bi bi-check2-square"></i> Select All / None</button></div>
        <div class="check-list" id="a-ids">${assetIdChecks(selCats, fits)}</div>
      </div>
    </div>`;
  const footer = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
    <button type="button" class="btn btn-ims" id="a-save"><i class="bi bi-check2"></i> Save Attachment</button>`;
  const root = openRawModal({ id:"mdl-attach", size:"lg", title:(isEdit ? "Edit" : "New") + " Attachment / Accessory", icon:"bi-paperclip", body, footer });

  const refreshIds = () => {
    const sc = Array.from(root.querySelectorAll("#a-cats input:checked")).map(i => i.value);
    const keep = Array.from(root.querySelectorAll("#a-ids input:checked")).map(i => i.value);
    root.querySelector("#a-ids").innerHTML = assetIdChecks(sc, keep);
  };
  root.querySelector("#a-cats").addEventListener("change", () => {
    Array.from(root.querySelectorAll("#a-cats .check-line")).forEach(l => l.classList.toggle("checked", l.querySelector("input").checked));
    refreshIds();
  });
  root.querySelector("#a-cats-all").addEventListener("click", () => {
    const boxes = Array.from(root.querySelectorAll("#a-cats input"));
    const allOn = boxes.length > 0 && boxes.every(b => b.checked);
    boxes.forEach(b => b.checked = !allOn);
    Array.from(root.querySelectorAll("#a-cats .check-line")).forEach(l => l.classList.toggle("checked", l.querySelector("input").checked));
    refreshIds();
  });
  root.querySelector("#a-ids").addEventListener("change", () => {
    Array.from(root.querySelectorAll("#a-ids .check-line")).forEach(l => l.classList.toggle("checked", l.querySelector("input").checked));
  });
  root.querySelector("#a-all").addEventListener("click", () => {
    const boxes = Array.from(root.querySelectorAll("#a-ids input"));
    const allOn = boxes.length > 0 && boxes.every(b => b.checked);
    boxes.forEach(b => b.checked = !allOn);
    Array.from(root.querySelectorAll("#a-ids .check-line")).forEach(l => l.classList.toggle("checked", l.querySelector("input").checked));
  });
  root.querySelector("#a-save").addEventListener("click", () => {
    const rec = {
      accId: root.querySelector("#a-accid").value || ("ACC-" + String(IMS.attachments.length + 1).padStart(3, "0")),
      name: root.querySelector("#a-name").value,
      category: root.querySelector("#a-cat").value,
      qtyOwned: parseFloat(root.querySelector("#a-qty").value) || 0,
      daily: parseFloat(root.querySelector("#a-daily").value) || 0,
      active: root.querySelector("#a-active").checked,
      fits: Array.from(root.querySelectorAll("#a-ids input:checked")).map(i => i.value)
    };
    if (isEdit) Object.assign(existing, rec);
    else IMS.attachments.push(rec);
    renderInventory();
    dismissModal(root);
  });
}

