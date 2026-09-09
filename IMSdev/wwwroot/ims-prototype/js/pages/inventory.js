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
    case "medical": return "New Medical Device";
    case "bulk": return "New Bulk Resource";
    case "consumable": return "New Consumable";
    case "parts": return "New Part";
    case "labor": return "New Labor Item";
    case "kits": return "New Kit";
    case "attachments": return "New Attachment";
    default: return "Add Record";
  }
}

/* Which item tabs appear depends on the active industry vertical (chosen on the
   Feature Modules page). Every vertical keeps the shared base (bulk, consumable,
   parts/stock, labor); heavy-equipment adds serialized/attachments/kits, while
   Healthcare swaps the serialized tab for a medical/device catalog. */
const VERTICAL_INV_TABS = {
  HeavyEquipment: ["serialized", "bulk", "consumable", "parts", "labor", "attachments", "kits"],
  Rental: ["serialized", "bulk", "consumable", "parts", "labor", "attachments", "kits"],
  Healthcare: ["medical", "bulk", "consumable", "parts", "labor"],
  Lumberyard: ["bulk", "consumable", "parts", "labor"],
  Warehouse: ["bulk", "consumable", "parts", "labor"]
};
const invTabKeys = () => VERTICAL_INV_TABS[IMS.metadata.vertical()] || VERTICAL_INV_TABS.HeavyEquipment;

/* For the shared base catalogs (bulk/consumable/parts), surface the active
   vertical's registry attributes as read-only columns when that vertical is a
   stock vertical (Lumberyard / Warehouse). Equipment/Medical attrs belong to
   their own catalogs, so nothing extra is added for those. */
function baseVerticalExtCols(){
  const v = IMS.metadata.vertical();
  if (v !== "Lumberyard" && v !== "Warehouse") return [];
  return IMS.metadata.registryFor(v).map(e => ({
    key: e.field_key,
    header: e.display_label,
    render: r => {
      const val = IMS.metadata.ext(r, e.field_key);
      if (val == null || val === "") return "—";
      if (e.data_type === "boolean") return val ? "Yes" : "No";
      return val;
    }
  }));
}

/* Editable (bucket) field defs for the active vertical on base-catalog forms. */
function baseVerticalExtFields(existing){
  const v = IMS.metadata.vertical();
  if (v !== "Lumberyard" && v !== "Warehouse") return [];
  return IMS.metadata.registryFor(v).map(e => {
    const f = { key: e.field_key, label: e.display_label, bucket: "extended_attributes", value: IMS.metadata.ext(existing, e.field_key) ?? "" };
    if (e.data_type === "number"){ f.type = "number"; f.value = f.value || 0; }
    else if (e.data_type === "date"){ f.type = "date"; }
    else if (e.data_type === "boolean"){ f.type = "checkbox"; }
    else f.type = "text";
    return f;
  });
}

function mergeExtFields(existing, vals){
  const nx = Object.assign({}, (existing && existing.extended_attributes) || {}, (vals && vals.extended_attributes) || {});
  return Object.keys(nx).length ? nx : undefined;
}

/* Read-only view of all goods received — grouped newest-first across
   consumables, bulk, and parts so the receipt trail is visible. */
function receivingLogModal(){
  const logs = (IMS.receivings || []).slice().reverse();
  const escHtml = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const typeName = { consumable: "Consumable", bulk: "Bulk", part: "Part" };
  const deletable = deletableReceiptIds();
  const rows = logs.length
    ? logs.map(r => `<tr>
        <td class="text-nowrap">${escHtml(r.at)}</td>
        <td><span class="strong">${escHtml(r.label)}</span><div class="text-muted2 text-11">${typeName[r.type] || escHtml(r.type)} · ${escHtml(r.refId)}</div></td>
        <td class="text-center text-nowrap">${(r.qtyBefore || 0)} <i class="bi bi-arrow-right text-muted2"></i> <strong>+${r.qtyAdded}</strong> <i class="bi bi-arrow-right text-muted2"></i> ${r.qtyAfter || 0}</td>
        <td>${escHtml(r.source || "—")}</td>
        <td>${escHtml(r.by || "—")}</td>
        <td>${escHtml(r.note || "")}</td>
        <td class="text-end text-nowrap">${deletable.has(r.id)
          ? `<button class="btn btn-ims-outline btn-sm2 text-danger" data-delrcv="${escHtml(r.id)}" title="Remove this receipt and undo its +qty"><i class="bi bi-x-lg"></i> Remove</button>`
          : `<span class="text-muted2 text-11" title="A newer receipt exists for this item — remove that first"><i class="bi bi-lock"></i> Newer first</span>`}</td>
      </tr>`).join("")
    : `<tr><td colspan="7" class="text-center text-muted2 py-4">No goods received yet — use <b>Recv</b> on a consumable, bulk, or parts row.</td></tr>`;
  const body = `<div class="table-wrap" style="max-height:420px;overflow:auto">
      <table class="table table-ims table-sm">
        <thead><tr><th>Received</th><th>Item</th><th class="text-center">Before → Qty → After</th><th>PO / Source</th><th>By</th><th>Note</th><th class="text-end">Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  const root = openRawModal({
    id: "mdl-recvlog", size: "lg", title: "Receiving Log", icon: "bi-journal-arrow-down", body,
    footer: `<button type="button" class="btn btn-ims" data-bs-dismiss="modal">Close</button>`
  });
  wireReceiptDelete(root, () => receivingLogModal());
}

/* Escape helper for arbitrary text interpolated into HTML. */
const escVal = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Core stock movement: bump an item's quantity and log the receipt to `receivings`. */
function applyReceive(type, refId, qty, source, note){
  const rec = type === "bulk" ? getBulk(refId) : (type === "consumable" ? getConsumable(refId) : getPart(refId));
  if (!rec) return false;
  const label = rec.name || rec.description || refId;
  const qtyBefore = type === "bulk" ? (rec.qtyAvailable || 0) : (rec.qtyOnHand || 0);
  const patch = type === "bulk" ? { qtyAvailable: qtyBefore + qty } : { qtyOnHand: qtyBefore + qty };
  if (IMS.store) IMS.store.repo(type).update(IMS.itemRegistry.idKey[type], refId, patch); else Object.assign(rec, patch);
  const recv = {
    id: "RCV-" + String((IMS.receivings || []).length + 1).padStart(3, "0"),
    type, refId, label, qtyBefore, qtyAdded: qty, qtyAfter: qtyBefore + qty,
    source: (source || "").trim() || null, note: (note || "").trim() || null,
    at: new Date().toISOString().slice(0, 19), by: "D. Reynolds"
  };
  if (IMS.store) IMS.store.repo("receivings").create(recv); else (IMS.receivings || (IMS.receivings = [])).push(recv);
  return true;
}

/* Receive a single item via a form. */
function receiveGoods(type, refId){
  const rec = type === "bulk" ? getBulk(refId) : (type === "consumable" ? getConsumable(refId) : getPart(refId));
  if (!rec) return;
  const label = rec.name || rec.description || refId;
  const fields = [
    { key: "qty", label: "Quantity received", type: "number", value: 1, required: true },
    { key: "source", label: "PO / Source", type: "text", value: "", placeholder: "e.g. PO-1023 or vendor" },
    { key: "note", label: "Note", type: "textarea", value: "" }
  ];
  openFormModal({
    id: "mdl-recv", title: "Receive Goods — " + label, icon: "bi-box-arrow-in-down", fields,
    onSave: v => { applyReceive(type, refId, Math.max(1, parseInt(v.qty, 10) || 1), v.source, v.note); renderInventory(); }
  });
}

/* Stock catalogs usable for bulk-receive (current vertical applies). */
const RCV_CATS = {
  consumable: { label: "Consumables", items: () => IMS.itemRegistry.getByType("consumable"), idOf: c => c.sku, nameOf: c => c.name, qtyOf: c => c.qtyOnHand || 0 },
  bulk: { label: "Bulk Resources", items: () => IMS.itemRegistry.getByType("bulk"), idOf: b => b.sku, nameOf: b => b.name, qtyOf: b => b.qtyAvailable || 0 },
  part: { label: "Parts & Accessories", items: () => IMS.itemRegistry.getByType("part"), idOf: p => p.partId, nameOf: p => p.description, qtyOf: p => p.qtyOnHand || 0 }
};

/* Complete several line items from one PO: enter a qty per row, apply once. */
function bulkReceiveRows(type){
  const cat = RCV_CATS[type];
  const items = cat.items();
  if (!items.length) return `<div class="text-muted2 py-3 text-center">No ${cat.label.toLowerCase()} in the catalog.</div>`;
  return `<div class="table-wrap" style="max-height:340px;overflow:auto"><table class="table table-ims table-sm">
    <thead><tr><th>Item</th><th class="num">On Hand</th><th class="text-end">Qty to receive</th></tr></thead>
    <tbody>${items.map(it => `<tr>
        <td><span class="strong">${escVal(cat.nameOf(it))}</span><div class="text-muted2 text-11">${cat.idOf(it)}</div></td>
        <td class="num text-muted2">${fmtInt(cat.qtyOf(it))}</td>
        <td class="text-end"><input class="form-control form-control-sm w-70 ms-auto br-qty" data-ref="${escVal(cat.idOf(it))}" type="number" min="0" step="1" value="0"></td>
      </tr>`).join("")}</tbody></table></div>`;
}

function bulkReceiveModal(){
  let type = (App.invTab === "parts" ? "part" : (App.invTab === "consumable" || App.invTab === "bulk" ? App.invTab : "consumable"));
  const body = `<div class="row g-3 mb-2">
      <div class="col-md-4 field-group"><label class="form-label">Catalog</label>
        <select class="form-select" id="br-type">
          ${Object.keys(RCV_CATS).map(k => `<option value="${k}" ${k === type ? "selected" : ""}>${RCV_CATS[k].label}</option>`).join("")}
        </select></div>
      <div class="col-md-4 field-group"><label class="form-label">PO / Source</label>
        <input class="form-control" id="br-source" placeholder="e.g. PO-1023 or vendor"></div>
      <div class="col-md-4 field-group"><label class="form-label">Note (optional)</label>
        <input class="form-control" id="br-note" placeholder="Receiving note…"></div>
    </div>
    <div id="br-rows"></div>`;
  const root = openRawModal({
    id: "mdl-brecv", size: "lg", title: "Bulk Receive — one PO, many lines", icon: "bi-journal-plus",
    body, footer: `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
      <button type="button" class="btn btn-ims" id="br-save"><i class="bi bi-check2"></i> Receive Selected</button>`
  });
  const redraw = () => { root.querySelector("#br-rows").innerHTML = bulkReceiveRows(root.querySelector("#br-type").value); };
  root.querySelector("#br-type").addEventListener("change", redraw);
  redraw();
  root.querySelector("#br-save").addEventListener("click", () => {
    const source = root.querySelector("#br-source").value, note = root.querySelector("#br-note").value;
    const type2 = root.querySelector("#br-type").value;
    const chosen = Array.from(root.querySelectorAll(".br-qty"))
      .map(inp => ({ ref: inp.dataset.ref, qty: Math.max(0, parseInt(inp.value, 10) || 0) }))
      .filter(x => x.qty > 0);
    chosen.forEach(x => applyReceive(type2, x.ref, x.qty, source, note));
    renderInventory();
    dismissModal(root);
  });
}

/* Latest-receipt tooltip text for an item ("" when none received yet). */
function lastRecvTitle(type, ref){
  const arr = IMS.receivings || [];
  for (let i = arr.length - 1; i >= 0; i--){
    const r = arr[i];
    if (r.type === type && r.refId === ref)
      return "Last received " + fmtDT(r.at) + " · +" + r.qtyAdded + (r.source ? " · " + r.source : "") + (r.by ? " · by " + r.by : "");
  }
  return "";
}
/* Optional data-* + title attributes for a stock qty cell (only when a receipt exists). */
function recvTipAttrs(type, ref){
  const t = lastRecvTitle(type, ref);
  return t ? ` data-lastrecv="1" title="${escVal(t)}"` : "";
}
/* ids of each item's most recent receipt (the only ones safe to remove/undo). */
function deletableReceiptIds(){
  const arr = IMS.receivings || [], seen = new Set(), out = new Set();
  for (let i = arr.length - 1; i >= 0; i--){
    const k = arr[i].type + "|" + arr[i].refId;
    if (!seen.has(k)){ seen.add(k); out.add(arr[i].id); }
  }
  return out;
}
/* Undo a receipt: remove it and revert the qty it added. Only allowed when it is
   the item's most recent receipt, so stacked before/after history stays consistent. */
function removeReceipt(id){
  const arr = IMS.receivings || [];
  const idx = arr.findIndex(r => r.id === id);
  if (idx < 0) return false;
  const r = arr[idx];
  const later = arr.some((x, i) => i > idx && x.type === r.type && x.refId === r.refId);
  if (later) return false;
  const rec = r.type === "bulk" ? getBulk(r.refId) : (r.type === "consumable" ? getConsumable(r.refId) : getPart(r.refId));
  const cur = r.type === "bulk" ? (rec ? (rec.qtyAvailable || 0) : 0) : (rec ? (rec.qtyOnHand || 0) : 0);
  const nv = Math.max(0, cur - (r.qtyAdded || 0));
  const patch = r.type === "bulk" ? { qtyAvailable: nv } : { qtyOnHand: nv };
  if (rec && IMS.store) IMS.store.repo(r.type).update(IMS.itemRegistry.idKey[r.type], r.refId, patch);
  else if (rec) Object.assign(rec, patch);
  arr.splice(idx, 1);
  if (IMS.store) IMS.store.save();
  return true;
}
/* Bind per-row receipt-delete buttons inside a modal; reopen after a successful undo. */
function wireReceiptDelete(root, reopen){
  if (!root) return;
  root.querySelectorAll("[data-delrcv]").forEach(btn => btn.addEventListener("click", () => {
    if (removeReceipt(btn.dataset.delrcv)){
      renderInventory();
      dismissModal(root);
      if (reopen) reopen();
    } else if (window.alert) {
      window.alert("Only the most recent receipt for an item can be removed.");
    }
  }));
}
/* Initialise stock-qty tooltips after a grid render (dispose previous instances). */
function initStockTooltips(){
  if (!(window.bootstrap && bootstrap.Tooltip)) return;
  if (window.__stockTips){ window.__stockTips.forEach(t => { try { t.dispose(); } catch(_){} }); window.__stockTips = null; }
  window.__stockTips = $$("#invPanel [data-lastrecv]").map(el => { try { return new bootstrap.Tooltip(el, { trigger: "hover", container: "body", placement: "top" }); } catch(_) { return null; } }).filter(Boolean);
}

/* Catalog search across core text + the active vertical's is_searchable attrs. */
function invFiltered(list){
  const q = (App.invSearch || "").trim().toLowerCase();
  if (!q) return list;
  const regs = IMS.metadata.registryFor(IMS.metadata.vertical());
  return list.filter(r => {
    const core = [r.id, r.sku, r.name, r.status, r.category].filter(x => x != null).join(" ").toLowerCase();
    let ext = "";
    regs.forEach(e => { if (e.is_searchable){ const val = IMS.metadata.ext(r, e.field_key); if (val != null) ext += " " + String(val); } });
    return (core + " " + ext).includes(q);
  });
}

function renderInventory(){
  const tabMeta = {
    serialized:  { label:"Items (Serialized)", icon:"bi-truck-front",      count: IMS.itemRegistry.getByType("serialized").length },
    medical:     { label:"Medical / Devices",  icon:"bi-heart-pulse",       count: IMS.healthcare.length },
    bulk:        { label:"Items (Bulk)",       icon:"bi-boxes",             count: IMS.itemRegistry.getByType("bulk").length },
    consumable:  { label:"Consumables",        icon:"bi-capsule",           count: IMS.itemRegistry.getByType("consumable").length },
    parts:       { label:"Stock Inventory",    icon:"bi-wrench-adjustable", count: IMS.itemRegistry.getByType("part").length },
    labor:       { label:"Labor / Employees",  icon:"bi-person-badge",      count: IMS.labor.length },
    attachments: { label:"Attachments",        icon:"bi-paperclip",         count: IMS.itemRegistry.getByType("attachment").length },
    kits:        { label:"Kits",               icon:"bi-puzzle",            count: IMS.itemRegistry.getByType("kit").length }
  };
  const keys = invTabKeys();
  if (!keys.includes(App.invTab)) App.invTab = keys[0];
  const vert = IMS.metadata.vertical();
  const tabs = keys.map(k => ({ key: k, ...tabMeta[k] }));
  const eq = tabs.find(t => t.key === "serialized");
  if (eq && vert === "Rental") eq.label = "Rental Equipment";   // #1: equipment tab reflects the vertical
  const vertLabel = IMS.metadata.verticals[vert] || vert;
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-box-seam"></i> Resource Master Lists</span>
        <span class="ms-auto text-muted2 text-12">Vertical: ${vertLabel}</span>
        <button class="btn btn-ims-outline ms-2" id="invBulkRecvBtn" title="Receive several line items from one PO"><i class="bi bi-journal-plus"></i> Bulk Receive</button>
        <button class="btn btn-ims-outline ms-2" id="invRecvLogBtn" title="View all received goods"><i class="bi bi-journal-arrow-down"></i> Receiving Log</button>
        <button class="btn btn-ims ms-2" id="invAddBtn"><i class="bi bi-plus-lg"></i> ${invAddLabel()}</button></div>
      <div class="card-body">
        <div class="subtabs" id="invTabs">
        ${tabs.map(t => `<button class="subtab ${t.key === App.invTab ? "active" : ""}" data-tab="${t.key}">
          <i class="bi ${t.icon}"></i>${t.label}<span class="count-pill">${t.count}</span></button>`).join("")}
      </div>
      <input class="filter-input mt-2" id="invSearch" value="${App.invSearch || ""}" placeholder="Search this catalog (id, sku/model, name, status, + vertical attributes)…">
      <div id="invPanel"></div>
    </div></div>`;
  delegate($("#content"), "click", "#invTabs .subtab", b => { App.invTab = b.dataset.tab; renderInventory(); });
  $("#invAddBtn").addEventListener("click", () => openAddModal(App.invTab));
  $("#invRecvLogBtn").addEventListener("click", () => receivingLogModal());
  $("#invBulkRecvBtn").addEventListener("click", () => bulkReceiveModal());
  $("#invSearch").addEventListener("input", e => { App.invSearch = e.target.value; renderInvPanel(); });
  renderInvPanel();
}

function renderInvPanel(){
  const p = $("#invPanel");
  if (App.invTab === "serialized"){ p.innerHTML = serializedTable(invFiltered(IMS.itemRegistry.getByType("serialized"))); IMSGrid.ensure("inv-serialized", renderInvPanel); }
  else if (App.invTab === "medical"){ renderInvMedicalPanel(); return; }
  else if (App.invTab === "bulk"){ p.innerHTML = bulkTable(invFiltered(IMS.itemRegistry.getByType("bulk"))); IMSGrid.ensure("inv-bulk", renderInvPanel); }
  else if (App.invTab === "consumable"){ p.innerHTML = consumableTable(invFiltered(IMS.itemRegistry.getByType("consumable"))); IMSGrid.ensure("inv-consumable", renderInvPanel); }
  else if (App.invTab === "parts"){ p.innerHTML = partsTable(invFiltered(IMS.itemRegistry.getByType("part"))); IMSGrid.ensure("inv-parts", renderInvPanel); }
  else if (App.invTab === "labor"){ p.innerHTML = laborTable(); IMSGrid.ensure("inv-labor", renderInvPanel); }
  else if (App.invTab === "kits") { renderInvKitsPanel(); return; }
  else if (App.invTab === "attachments") { renderInvAttachmentsPanel(); return; }
  bindInvActions();
  initStockTooltips();
}

function renderInvMedicalPanel(){
  const p = $("#invPanel");
  p.innerHTML = medicalTable();
  IMSGrid.ensure("inv-medical", renderInvMedicalPanel);
  $$("[data-mededit]").forEach(b => b.addEventListener("click", () => healthcareModal(IMS.healthcare.find(x => x.id === b.dataset.mededit))));
  delegate(p, "click", "tr[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    healthcareModal(IMS.healthcare.find(x => x.id === el.dataset.edit));
  });
}

function renderInvKitsPanel(){
  const p = $("#invPanel");
  p.innerHTML = kitsList();
  $$("[data-kedit]").forEach(b => b.addEventListener("click", () => kitModal(IMS.itemRegistry.getByType("kit").find(x => x.kitId === b.dataset.kedit))));
  delegate(p, "click", "[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    kitModal(IMS.itemRegistry.getByType("kit").find(x => x.kitId === el.dataset.edit));
  });
}

function renderInvAttachmentsPanel(){
  const p = $("#invPanel");
  p.innerHTML = attachmentsTable();
  IMSGrid.ensure("inv-attachments", renderInvAttachmentsPanel);
  $$("[data-aedit]").forEach(b => b.addEventListener("click", () => attachmentModal(IMS.itemRegistry.getByType("attachment").find(x => x.accId === b.dataset.aedit))));
  delegate(p, "click", "[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    attachmentModal(IMS.itemRegistry.getByType("attachment").find(x => x.accId === el.dataset.edit));
  });
}

function serializedTable(list){
  const cols = [
    { key:"id", header:"Asset ID", td:"strong mono", always:true, render: a => a.id },
    { key:"serial", header:"Serial / VIN", td:"mono text-muted2", render: a => IMS.metadata.ext(a, "serial_vin") || "" },
    { key:"mkmod", header:"Make / Model", render: a => `${IMS.metadata.mkName(a)}` },
    { key:"category", header:"Category", render: a => a.category },
    { key:"meter", header:"Meter Hrs", td:"num", render: a => fmtInt(IMS.metadata.ext(a, "meter_hours") || 0) },
    { key:"fuel", header:"Fuel", render: a => IMS.metadata.ext(a, "fuel_type") || "" },
    { key:"pval", header:"Purchase Value", td:"num", render: a => fmtMoney(a.purchaseValue) },
    { key:"rates", header:"Daily / Weekly / Monthly", td:"num", render: a => `<span class="text-muted2">${fmtMoney(a.baseDaily)}</span> / <span class="text-muted2">${fmtMoney(a.baseWeekly)}</span> / <span class="text-muted2">${fmtMoney(a.baseMonthly)}</span>` },
    { key:"status", header:"Status", render: a => activeBadge(a) + statusBadge(a.status) },
    { key:"actions", header:"Actions", th:"text-end", td:"text-end text-nowrap", always:true, render: a => `<button class="btn btn-ims-outline btn-sm2" data-iview="${a.id}"><i class="bi bi-eye"></i> View</button><button class="btn btn-ims-outline btn-sm2" data-iedit="${a.id}"><i class="bi bi-pencil"></i> Edit</button>` }
  ];
  return IMSGrid.render("inv-serialized", cols, list || IMS.itemRegistry.getByType("serialized"),
    { empty:"No serialized assets.", trAttrs: a => `data-edit="${a.id}"` });
}

function bulkTable(list){
  const cols = [
    { key:"sku", header:"SKU", td:"strong mono", always:true, render: b => b.sku },
    { key:"name", header:"Name", render: b => b.name },
    { key:"category", header:"Category", render: b => b.category },
    { key:"owned", header:"Total Owned", td:"num", render: b => fmtInt(b.totalOwned) },
    { key:"avail", header:"Avail / Out", td:"num", render: b => `<span class="strong"${recvTipAttrs("bulk", b.sku)}>${fmtInt(b.qtyAvailable)}</span> / ${fmtInt(b.qtyOut)}` },
    { key:"daily", header:"Daily", td:"num", render: b => fmtMoney(b.baseDaily) },
    { key:"weekly", header:"Weekly", td:"num", render: b => fmtMoney(b.baseWeekly) },
    { key:"monthly", header:"Monthly", td:"num", render: b => fmtMoney(b.baseMonthly) },
    { key:"status", header:"Status", render: b => activeCell(b) },
    { key:"actions", header:"Actions", th:"text-end", td:"text-end text-nowrap", always:true, render: b => `<button class="btn btn-ims-outline btn-sm2" data-iview="${b.sku}"><i class="bi bi-eye"></i> View</button><button class="btn btn-ims-outline btn-sm2" data-iedit="${b.sku}"><i class="bi bi-pencil"></i> Edit</button><button class="btn btn-ims-outline btn-sm2" data-vattr="${b.sku}" title="Extended attributes"><i class="bi bi-database-add"></i> Attrs</button><button class="btn btn-ims-outline btn-sm2" data-recv="${b.sku}" title="Receive goods"><i class="bi bi-box-arrow-in-down"></i> Recv</button>` }
  ];
  return IMSGrid.render("inv-bulk", cols.concat(baseVerticalExtCols()), list || IMS.itemRegistry.getByType("bulk"),
    { empty:"No bulk resources.", trAttrs: b => `data-edit="${b.sku}"` });
}

function consumableTable(list){
  const lowOf = c => c.qtyOnHand <= c.reorderPoint;
  const stockBadge = c => c.active === false
    ? `<span class="badge-status st-out"><i class="bi bi-circle-fill"></i>Inactive</span>`
    : (lowOf(c) ? `<span class="badge-status st-reorder"><i class="bi bi-exclamation-triangle"></i>Reorder</span>` : `<span class="badge-status st-available"><i class="bi bi-circle-fill"></i>Stocked</span>`);
  const cols = [
    { key:"sku", header:"SKU", td:"strong mono", always:true, render: c => c.sku },
    { key:"name", header:"Name", render: c => c.name },
    { key:"category", header:"Category", render: c => c.category },
    { key:"onhand", header:"On Hand", td:"num", render: c => `<span class="${lowOf(c) ? "text-danger strong" : ""}"${recvTipAttrs("consumable", c.sku)}>${fmtInt(c.qtyOnHand)}</span>` },
    { key:"reorder", header:"Reorder Pt", td:"num text-muted2", render: c => fmtInt(c.reorderPoint) },
    { key:"cost", header:"Cost Price", td:"num", render: c => fmtMoney(c.costPrice) },
    { key:"retail", header:"Retail Price", td:"num", render: c => fmtMoney(c.retailPrice) },
    { key:"status", header:"Status", render: c => stockBadge(c) },
    { key:"actions", header:"Actions", th:"text-end", td:"text-end text-nowrap", always:true, render: c => `<button class="btn btn-ims-outline btn-sm2" data-iview="${c.sku}"><i class="bi bi-eye"></i> View</button><button class="btn btn-ims-outline btn-sm2" data-iedit="${c.sku}"><i class="bi bi-pencil"></i> Edit</button><button class="btn btn-ims-outline btn-sm2" data-vattr="${c.sku}" title="Extended attributes"><i class="bi bi-database-add"></i> Attrs</button><button class="btn btn-ims-outline btn-sm2" data-recv="${c.sku}" title="Receive goods"><i class="bi bi-box-arrow-in-down"></i> Recv</button>` }
  ];
  return IMSGrid.render("inv-consumable", cols.concat(baseVerticalExtCols()), list || IMS.itemRegistry.getByType("consumable"),
    { empty:"No consumables.", trAttrs: c => `data-edit="${c.sku}"` });
}

function laborTable(){
  const certsHTML = e => (e.certs || []).map(c => `<span class="badge-status st-staged">${c}</span>`).join(" ");
  const cols = [
    { key:"empId", header:"Emp ID", td:"strong mono", always:true, render: e => e.empId },
    { key:"name", header:"Full Name", render: e => e.name },
    { key:"role", header:"Role", render: e => e.role },
    { key:"category", header:"Category", render: e => e.category },
    { key:"certs", header:"Certifications", render: e => certsHTML(e) },
    { key:"cost", header:"Cost / hr", td:"num", render: e => fmtMoney(e.hourlyCost) },
    { key:"billable", header:"Billable / hr", td:"num", render: e => fmtMoney(e.hourlyBillable) },
    { key:"spread", header:"Spread / hr", td:"num text-muted2", render: e => fmtMoney(e.hourlyBillable - e.hourlyCost) },
    { key:"status", header:"Status", render: e => activeCell(e) },
    { key:"actions", header:"Actions", th:"text-end", td:"text-end text-nowrap", always:true, render: e => `<button class="btn btn-ims-outline btn-sm2" data-iview="${e.empId}"><i class="bi bi-eye"></i> View</button><button class="btn btn-ims-outline btn-sm2" data-iedit="${e.empId}"><i class="bi bi-pencil"></i> Edit</button>` }
  ];
  return IMSGrid.render("inv-labor", cols, IMS.labor,
    { empty:"No labor / employees.", trAttrs: e => `data-edit="${e.empId}"` });
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
  delegate($("#invPanel"), "click", "[data-vattr]", b => {
    const id = b.dataset.vattr;
    if (App.invTab === "bulk") openVerticalExtras("bulk", getBulk(id));
    else if (App.invTab === "consumable") openVerticalExtras("consumable", getConsumable(id));
    else if (App.invTab === "parts") openVerticalExtras("part", getPart(id));
  });
  delegate($("#invPanel"), "click", "[data-recv]", b => {
    const id = b.dataset.recv;
    if (App.invTab === "bulk") receiveGoods("bulk", id);
    else if (App.invTab === "consumable") receiveGoods("consumable", id);
    else if (App.invTab === "parts") receiveGoods("part", id);
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


/* Movement history shown inside an item view modal (immutable movement log). */
function chainOfCustodyHTML(assetId){
  const evs = (IMS.movements || []).filter(m => m.refType === "serialized" && m.refId === assetId);
  if (!evs.length) return "";
  const last = evs[evs.length - 1];
  const isOut = last.kind === "issue";
  const status = isOut
    ? `<div class="alert-line breach"><span class="ts">OUT</span><span>On issue to <strong>${last.party}</strong> · ${last.orderId || "no order"} · ${last.location || ""} since ${fmtDT(last.at)}</span></div>`
    : `<div class="alert-line info"><span class="ts">IN</span><span>In stock — returned ${fmtDT(last.at)}</span></div>`;
  const rows = evs.map(m => {
    const k = m.kind;
    const label = ({ issue:"Issue", return:"Return", receive:"Receive", transfer:"Transfer", adjust:"Adjust" })[k] || k;
    const isIssue = k === "issue";
    return `<div class="list-line">
      <span class="l"><span class="mono strong">${m.id}</span> · <span class="badge-status ${isIssue ? "st-out" : "st-available"}">${label}</span> ${m.orderId || ""}</span>
      <span class="r mono">${fmtDT(m.at)}</span>
      <div class="text-muted2" style="grid-column:1/-1">Party: <strong>${m.party}</strong>${m.location ? " · Location: " + m.location : ""} · by ${m.by}${m.note ? " · " + m.note : ""}</div>
    </div>`;
  }).join("");
  return status + section("Movement History (" + evs.length + ")", rows);
}

/* Receiving history shown inside a stock item view modal (receipt log). */
function receivingHistoryHTML(type, refId){
  const evs = (IMS.receivings || []).filter(r => r.type === type && r.refId === refId).slice().reverse();
  if (!evs.length) return "";
  const deletable = deletableReceiptIds();
  const rows = evs.map(r => {
    const can = deletable.has(r.id);
    return `<div class="list-line">
      <span class="l"><span class="mono strong">${r.id}</span> · <strong>+${r.qtyAdded}</strong> → on hand ${r.qtyAfter}
        ${can
          ? `<button class="btn btn-ims-outline btn-sm2 text-danger ms-2" data-delrcv="${escVal(r.id)}" title="Remove this receipt and undo its +qty"><i class="bi bi-x-lg"></i> Remove</button>`
          : `<span class="text-muted2 text-11" title="A newer receipt exists for this item — remove that first"><i class="bi bi-lock"></i></span>`}</span>
      <span class="r mono">${fmtDT(r.at)}</span>
      <div class="text-muted2" style="grid-column:1/-1">Before ${r.qtyBefore} → After ${r.qtyAfter}${r.source ? " · Source: " + escVal(r.source) : ""} · by ${escVal(r.by)}${r.note ? " · " + escVal(r.note) : ""}</div>
    </div>`;
  }).join("");
  return section("Receiving History (" + evs.length + ")", rows);
}

function serializedView(a){
  const cons = contractRefs("serialized", a.id);
  const wos = IMS.workOrders.filter(w => w.assetId === a.id);
  const consList = cons.map(({order, lines}) => lines.map(li => {
    const t = orderTotals(order);
    return `<div class="list-line"><span class="l"><span class="strong mono">${order.orderId}</span> — ${order.projectName} ${statusBadge(order.status)}</span><span class="r">${fmtMoney(computeLineTotal(li, order))}</span></div>`;
  }).join("")).join("");
  const woList = wos.map(w => {
    const x = woComputed(w);
    return `<div class="list-line"><span class="l"><span class="strong mono">${w.woId}</span> — ${w.type} ${statusBadge(w.status)}</span><span class="r">${fmtMoney(x.total)}</span></div>`;
  }).join("");
  const atts = IMS.assetAttachments.filter(x => x.assetId === a.id).map(x => IMS.itemRegistry.getByType("attachment").find(t => t.accId === x.accId)).filter(Boolean);
  const attList = atts.map(t => `<div class="list-line"><span class="l"><span class="strong mono">${t.accId}</span> — ${t.name} <span class="text-muted2">(${t.category})</span></span><span class="r">${fmtMoney(t.daily)}/day</span></div>`).join("");
  openRawModal({
    id: "mdl-aview", size: "lg", title: "Asset — " + a.id, icon: "bi-truck-front",
    body: detailGrid([
      ["Asset ID", a.id], ["Serial / VIN", IMS.metadata.ext(a, "serial_vin") || "—"], ["Make / Model", IMS.metadata.mkName(a)], ["Category", a.category],
      ["Meter Hours", fmtInt(IMS.metadata.ext(a, "meter_hours") || 0)], ["Fuel", IMS.metadata.ext(a, "fuel_type") || "—"], ["Purchase Value", fmtMoney(a.purchaseValue)],
      ["Daily", fmtMoney(a.baseDaily)], ["Weekly", fmtMoney(a.baseWeekly)], ["Monthly", fmtMoney(a.baseMonthly)],
      ["Default Deposit", (a.depositPct != null ? a.depositPct : 25) + "% of rental"],
      ["GPS Coord", a.lat.toFixed(4) + ", " + a.lng.toFixed(4)], ["Status", statusBadge(a.status)]
    ])
      + section("Assigned to Contracts (" + cons.length + ")", consList)
      + section("Associated Attachments (" + atts.length + ")", attList)
      + chainOfCustodyHTML(a.id)
      + section("Maintenance Work Orders (" + wos.length + ")", woList),
    footer: closeBtn
  });
}

function bulkView(b){
  const cons = contractRefs("bulk", b.sku);
  const consList = cons.map(({order, lines}) => lines.map(li =>
    `<div class="list-line"><span class="l"><span class="strong mono">${order.orderId}</span> — ${order.projectName} ${statusBadge(order.status)}</span><span class="r">${fmtInt(li.qty)} units · ${fmtMoney(computeLineTotal(li, order))}</span></div>`).join("")).join("");
  const root = openRawModal({
    id: "mdl-bview", size: "lg", title: "Bulk Resource — " + b.sku, icon: "bi-boxes",
    body: detailGrid([
      ["SKU", b.sku], ["Name", b.name], ["Category", b.category],
      ["Total Owned", fmtInt(b.totalOwned)], ["Available", fmtInt(b.qtyAvailable)], ["Out", fmtInt(b.qtyOut)],
      ["Daily", fmtMoney(b.baseDaily)], ["Weekly", fmtMoney(b.baseWeekly)], ["Monthly", fmtMoney(b.baseMonthly)],
      ["Default Deposit", (b.depositPct != null ? b.depositPct : 25) + "% of rental"]
    ]) + section("Assigned to Contracts (" + cons.length + ")", consList)
      + receivingHistoryHTML("bulk", b.sku),
    footer: closeBtn
  });
  wireReceiptDelete(root, () => bulkView(b));
}

function consumableView(c){
  const cons = contractRefs("consumable", c.sku);
  const consList = cons.map(({order, lines}) => lines.map(li =>
    `<div class="list-line"><span class="l"><span class="strong mono">${order.orderId}</span> — ${order.projectName} ${statusBadge(order.status)}</span><span class="r">${fmtInt(li.qty)} × ${fmtMoney(computeLineTotal(li, order))}</span></div>`).join("")).join("");
  const wos = IMS.workOrders.filter(w => (w.parts || []).some(p => p.sku === c.sku));
  const woList = wos.map(w => { const x = woComputed(w); return `<div class="list-line"><span class="l"><span class="strong mono">${w.woId}</span> — ${w.assetId} ${statusBadge(w.status)}</span><span class="r">${fmtMoney(x.total)}</span></div>`; }).join("");
  const root = openRawModal({
    id: "mdl-coview", size: "lg", title: "Consumable — " + c.sku, icon: "bi-capsule",
    body: detailGrid([
      ["SKU", c.sku], ["Name", c.name], ["Category", "Consumable"],
      ["On Hand", fmtInt(c.qtyOnHand) + (c.qtyOnHand <= c.reorderPoint ? " <span class=\"badge-status st-reorder\">Reorder</span>" : "")],
      ["Reorder Point", fmtInt(c.reorderPoint)], ["Cost Price", fmtMoney(c.costPrice)], ["Retail Price", fmtMoney(c.retailPrice)]
    ])
      + section("Used on Contracts (" + cons.length + ")", consList)
      + section("Used in Work Orders (" + wos.length + ")", woList)
      + receivingHistoryHTML("consumable", c.sku),
    footer: closeBtn
  });
  wireReceiptDelete(root, () => consumableView(c));
}

function laborView(e){
  const cons = contractRefs("labor", e.empId);
  const consList = cons.map(({order, lines}) => lines.map(li =>
    `<div class="list-line"><span class="l"><span class="strong mono">${order.orderId}</span> — ${order.projectName} ${statusBadge(order.status)}</span><span class="r">${fmtInt(li.qty)} hr · ${fmtMoney(computeLineTotal(li, order))}</span></div>`).join("")).join("");
  const ts = IMS.timesheets.filter(x => x.empId === e.empId);
  const tsList = ts.map(x => {
    const nm = x.targetType === "order" ? "Job " + x.targetId
      : x.targetType === "workorder" ? "WO " + x.targetId
      : x.targetType ? (x.targetType.charAt(0).toUpperCase() + x.targetType.slice(1)) : "WO";
    return `<div class="list-line"><span class="l">${fmtDate(x.date)} · ${nm}</span><span class="r">${x.hours == null ? "live" : x.hours} hr · ${fmtMoney((x.hours || 0) * e.hourlyCost)}</span></div>`;
  }).join("");
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

function partsTable(list){
  const lowOf = p => p.qtyOnHand <= p.reorderPoint;
  const stockBadge = p => p.active === false
    ? `<span class="badge-status st-out"><i class="bi bi-circle-fill"></i>Inactive</span>`
    : (lowOf(p) ? `<span class="badge-status st-reorder"><i class="bi bi-exclamation-triangle"></i>Reorder</span>` : `<span class="badge-status st-available"><i class="bi bi-circle-fill"></i>Stocked</span>`);
  const cols = [
    { key:"partId", header:"Part ID", td:"strong mono", always:true, render: p => p.partId },
    { key:"description", header:"Description", render: p => p.description },
    { key:"category", header:"Category", render: p => p.category },
    { key:"bin", header:"Bin / Aisle", td:"mono text-muted2", render: p => p.bin },
    { key:"onhand", header:"On Hand", td:"num", render: p => `<span class="${lowOf(p) ? "text-danger strong" : ""}"${recvTipAttrs("part", p.partId)}>${fmtInt(p.qtyOnHand)}</span>` },
    { key:"reorder", header:"Reorder Pt", td:"num text-muted2", render: p => fmtInt(p.reorderPoint) },
    { key:"cost", header:"Cost Price", td:"num", render: p => fmtMoney(p.costPrice) },
    { key:"status", header:"Status", render: p => stockBadge(p) },
    { key:"actions", header:"Actions", th:"text-end", td:"text-end text-nowrap", always:true, render: p => `<button class="btn btn-ims-outline btn-sm2" data-iview="${p.partId}"><i class="bi bi-eye"></i> View</button><button class="btn btn-ims-outline btn-sm2" data-iedit="${p.partId}"><i class="bi bi-pencil"></i> Edit</button><button class="btn btn-ims-outline btn-sm2" data-vattr="${p.partId}" title="Extended attributes"><i class="bi bi-database-add"></i> Attrs</button><button class="btn btn-ims-outline btn-sm2" data-recv="${p.partId}" title="Receive goods"><i class="bi bi-box-arrow-in-down"></i> Recv</button>` }
  ];
  return IMSGrid.render("inv-parts", cols.concat(baseVerticalExtCols()), list || IMS.itemRegistry.getByType("part"),
    { empty:"No stock parts.", trAttrs: p => `data-edit="${p.partId}"` });
}

function partsFields(e){
  e = e || {};
  return [
    { key:"active", label:"Active", type:"checkbox", value: recActive(e) },
    { key:"partId", label:"Part ID (PK)", type:"text", value: e.partId || "PRT-" + String(IMS.itemRegistry.getByType("part").length + 1).padStart(3, "0"), required:true },
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
    fields: partsFields(existing).concat(baseVerticalExtFields(existing)),
    onSave: v => {
      const rec = { active:v.active !== false, partId:v.partId, description:v.description, category:v.category, bin:v.bin, qtyOnHand:v.qtyOnHand, reorderPoint:v.reorderPoint, costPrice:v.costPrice };
      const nx = mergeExtFields(existing, v); if (nx) rec.extended_attributes = nx;
      itemWrite("part", isEdit ? existing : null, rec);
      renderInventory();
    }
  });
}

function partsView(p){
  const wos = IMS.workOrders.filter(w => (w.parts || []).some(x => x.kind === "part" && x.refId === p.partId));
  const woList = wos.map(w => { const c = woComputed(w); return `<div class="list-line"><span class="l"><span class="strong mono">${w.woId}</span> — ${w.assetId} ${statusBadge(w.status)}</span><span class="r">${fmtMoney(c.total)}</span></div>`; }).join("");
  const root = openRawModal({
    id: "mdl-pview", size: "lg", title: "Service Part — " + p.partId, icon: "bi-wrench-adjustable",
    body: detailGrid([
      ["Part ID", p.partId], ["Description", p.description], ["Bin / Aisle", p.bin],
      ["Qty on Hand", fmtInt(p.qtyOnHand) + (p.qtyOnHand <= p.reorderPoint ? " <span class=\"badge-status st-reorder\">Reorder</span>" : "")],
      ["Reorder Point", fmtInt(p.reorderPoint)], ["Cost Price", fmtMoney(p.costPrice)], ["Status", p.active === false ? "Inactive" : "Active"]
    ]) + section("Used in Work Orders (" + wos.length + ")", woList)
      + receivingHistoryHTML("part", p.partId),
    footer: closeBtn
  });
  wireReceiptDelete(root, () => partsView(p));
}

/* ---------- inventory record lookup + detail-modal helpers ---------- */
/* Item records resolve through the unified item registry; labor is a crew/party resource. */
const regFind = (type, id) => (IMS.itemRegistry ? IMS.itemRegistry.find(type, id) : null);
const getAsset = id => regFind("serialized", id) || IMS.itemRegistry.getByType("serialized").find(a => a.id === id);
const getBulk = id => regFind("bulk", id) || IMS.itemRegistry.getByType("bulk").find(b => b.sku === id);
const getConsumable = id => regFind("consumable", id) || IMS.itemRegistry.getByType("consumable").find(c => c.sku === id);
const getLabor = id => IMS.labor.find(e => e.empId === id);
const getPart = id => regFind("part", id) || IMS.itemRegistry.getByType("part").find(p => p.partId === id);
const contractRefs = (type, ref) => IMS.orders
  .map(c => ({ order: c, lines: (c.lineItems || []).filter(li => li.type === type && li.refId === ref) }))
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
  IMS.itemRegistry.getByType("serialized").forEach(a => {
    if (a.id.startsWith(code + "-")) { const n = parseInt(a.id.split("-")[1], 10); if (n > max) max = n; }
  });
  return code + "-" + (max + 1);
}
function openAddModal(tab){
  if (tab === "serialized") serializedModal();
  else if (tab === "medical") healthcareModal(null);
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
    { key:"id", label:"Asset ID (PK)", type:"text", value: e.id || nextAssetId(e.category || "Boom Lift"), required:true, section:"Identity" },
    { key:"serial_vin", label:"Serial / VIN", type:"text", bucket:"extended_attributes", value: IMS.metadata.ext(e, "serial_vin") || "" },
    { key:"make", label:"Make", type:"text", bucket:"extended_attributes", value: IMS.metadata.ext(e, "make") || "" },
    { key:"model", label:"Model", type:"text", bucket:"extended_attributes", value: IMS.metadata.ext(e, "model") || "" },
    { key:"category", label:"Category", type:"select", value: e.category || activeCats("serialized")[0], options: catOptions("serialized", e.category) },
    { key:"meter_hours", label:"Current Meter Hours", type:"number", bucket:"extended_attributes", value: IMS.metadata.ext(e, "meter_hours") || 0, section:"Usage & Availability" },
    { key:"fuel_type", label:"Fuel Type", type:"select", bucket:"extended_attributes", value: IMS.metadata.ext(e, "fuel_type") || "Diesel", options: opt(["Diesel","Gasoline","Electric","LPG"]) },
    { key:"status", label:"Status", type:"select", value: e.status || "Available", options: opt(["Available","On Rent","In Shop","Staged"]) },
    { key:"purchaseValue", label:"Purchase Value ($)", type:"number", value: e.purchaseValue || 0, section:"Rates & Pricing" },
    { key:"baseDaily", label:"Base Daily Rate ($)", type:"number", value: e.baseDaily || 0 },
    { key:"baseWeekly", label:"Base Weekly Rate ($)", type:"number", value: e.baseWeekly || 0, hint:"Weekly ≈ Daily × 5" },
    { key:"baseMonthly", label:"Base Monthly Rate ($)", type:"number", value: e.baseMonthly || 0, hint:"Monthly ≈ Daily × 15 (28-day period)" },
    { key:"depositPct", label:"Default Deposit (%)", type:"number", value: (e.depositPct != null ? e.depositPct : 25), hint:"Held as % of the rental subtotal at check-out" },
    { key:"lat", label:"Latitude", type:"number", value: e.lat ?? IMS.yard.lat, step:"0.0001", section:"GPS Home" },
    { key:"lng", label:"Longitude", type:"number", value: e.lng ?? IMS.yard.lng, step:"0.0001" }
  ];
}

/* Route an item-table create/update through the store repository seam.
   Falls back to the direct registry array when the store is absent. */
function itemWrite(type, existing, patch){
  if (existing){
    if (IMS.store){ const idKey = IMS.itemRegistry.idKey[type]; IMS.store.repo(type).update(idKey, existing[idKey], patch); }
    else Object.assign(existing, patch);
  } else if (IMS.store){
    IMS.store.repo(type).create(patch);
  } else {
    IMS.itemRegistry.getByType(type).push(patch);
  }
}

/* Generic, registry-driven "Extended Attributes" editor for any item type.
   Builds fields from the ACTIVE vertical's registry and stores values into the
   record's extended_attributes JSONB bucket (via the store seam). */
function openVerticalExtras(type, rec){
  const vertical = IMS.metadata.vertical();
  const entries = IMS.metadata.registryFor(vertical);
  if (!entries.length){ window.alert("No extended attributes are defined for this vertical (" + vertical + ")."); return; }
  const fields = entries.map(e => {
    const base = { key: e.field_key, label: e.display_label, bucket: "extended_attributes", value: IMS.metadata.ext(rec, e.field_key) ?? "" };
    if (e.data_type === "number"){ base.type = "number"; base.value = base.value || 0; }
    else if (e.data_type === "date"){ base.type = "date"; }
    else if (e.data_type === "boolean"){ base.type = "checkbox"; }
    else base.type = "text";
    return base;
  });
  openFormModal({
    id: "mdl-vext", title: "Extended Attributes — " + (IMS.metadata.verticals[vertical] || vertical),
    icon: "bi-database-add", fields,
    onSave: vals => {
      const merged = Object.assign({}, (rec && rec.extended_attributes) || {}, (vals.extended_attributes) || {});
      itemWrite(type, rec, { extended_attributes: merged });
      if (typeof renderInventory === "function") renderInventory(); else renderInvPanel();
    }
  });
}

function serializedModal(existing){
  const isEdit = !!existing;
  openFormModal({
    id: "mdl-serial", title: (isEdit ? "Edit" : "New") + " Serialized / Equipment Asset", icon: "bi-truck-front", large: true,
    fields: serializedFields(existing),
    onSave: v => {
      const base = { active:v.active !== false, category:v.category, purchaseValue:v.purchaseValue, baseDaily:v.baseDaily, baseWeekly:v.baseWeekly, baseMonthly:v.baseMonthly, depositPct:v.depositPct, lat:v.lat, lng:v.lng, status:v.status };
      const ext = Object.assign({}, (existing && existing.extended_attributes) || {}, (v.extended_attributes) || {});
      base.name = ((ext.make ? ext.make + " " : "") + (ext.model || "")).trim();
      const patch = Object.assign({ extended_attributes: ext }, base);
      if (isEdit) {
        itemWrite("serialized", existing, patch);
      } else {
        itemWrite("serialized", null, Object.assign({ id:v.id, tenantId: (existing && existing.tenantId) || "TENANT-001", battery:100, lastReported: new Date().toISOString().slice(0,19), orderId:null }, patch));
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
    { key:"baseMonthly", label:"Base Monthly Rate / unit ($)", type:"number", value: e.baseMonthly || 0 },
    { key:"depositPct", label:"Default Deposit (%)", type:"number", value: (e.depositPct != null ? e.depositPct : 25), hint:"Held as % of the per-unit rental at check-out" }
  ];
}

function bulkModal(existing){
  const isEdit = !!existing;
  openFormModal({
    id: "mdl-bulk", title: (isEdit ? "Edit" : "New") + " Bulk Resource", icon: "bi-boxes",
    fields: bulkFields(existing).concat(baseVerticalExtFields(existing)),
    onSave: v => {
      const patch = { active:v.active !== false, sku:v.sku, name:v.name, category:v.category, totalOwned:v.totalOwned, baseDaily:v.baseDaily, baseWeekly:v.baseWeekly, baseMonthly:v.baseMonthly, depositPct:v.depositPct };
      const nx = mergeExtFields(existing, v); if (nx) patch.extended_attributes = nx;
      if (isEdit) {
        itemWrite("bulk", existing, patch);
      } else {
        itemWrite("bulk", null, Object.assign({ qtyAvailable:v.totalOwned, qtyOut:0 }, patch));
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
    fields: consumableFields(existing).concat(baseVerticalExtFields(existing)),
    onSave: v => {
      const rec = { active:v.active !== false, sku:v.sku, name:v.name, category:v.category, qtyOnHand:v.qtyOnHand, reorderPoint:v.reorderPoint, costPrice:v.costPrice, retailPrice:v.retailPrice };
      const nx = mergeExtFields(existing, v); if (nx) rec.extended_attributes = nx;
      itemWrite("consumable", isEdit ? existing : null, rec);
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
      if (isEdit){ if (IMS.store) IMS.store.repo("labor").update("empId", existing.empId, rec); else Object.assign(existing, rec); }
      else { if (IMS.store) IMS.store.repo("labor").create(rec); else IMS.labor.push(rec); }
      renderInventory();
    }
  });
}


/* =========================================================
   PHASE 2 — PART 1: KITS & ATTACHMENTS
   ========================================================= */
function kitsList(){
  const cards = IMS.itemRegistry.getByType("kit").map(k => {
    const comps = k.components.map(c => {
      const r = getResource({ type:c.refType, refId:c.refId });
      const rname = r ? (c.refType === "serialized" ? IMS.metadata.mkName(r) : r.name) : c.refId;
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
  const linkList = a => {
    const links = IMS.assetAttachments.filter(x => x.accId === a.accId).map(x => x.assetId).join(", ");
    return links || "—";
  };
  const cols = [
    { key:"accId", header:"Acc ID", td:"strong mono", always:true, render: a => a.accId },
    { key:"name", header:"Name", render: a => a.name },
    { key:"category", header:"Category", render: a => a.category },
    { key:"qty", header:"Qty Owned", td:"num", render: a => fmtInt(a.qtyOwned) },
    { key:"daily", header:"Daily", td:"num", render: a => fmtMoney(a.daily) },
    { key:"fits", header:"Fits", td:"mono", render: a => (a.fits || []).join(", ") },
    { key:"linked", header:"Linked Assets", td:"mono", render: a => linkList(a) },
    { key:"status", header:"Status", render: a => activeCell(a) },
    { key:"actions", header:"Actions", th:"text-end", td:"text-end text-nowrap", always:true, render: a => `<button class="btn btn-ims-outline btn-sm2" data-aedit="${a.accId}"><i class="bi bi-pencil"></i></button>` }
  ];
  return IMSGrid.render("inv-attachments", cols, IMS.itemRegistry.getByType("attachment"),
    { empty:"No attachments.", trAttrs: a => `data-edit="${a.accId}"` });
}

function resOptions(){
  let o = `<option value="">— select component —</option>`;
  IMS.itemRegistry.getByType("serialized").forEach(a => o += `<option value="serialized|${a.id}">[Serialized] ${a.id} · ${IMS.metadata.mkName(a)}</option>`);
  IMS.itemRegistry.getByType("bulk").forEach(b => o += `<option value="bulk|${b.sku}">[Bulk] ${b.sku} · ${b.name}</option>`);
  IMS.itemRegistry.getByType("consumable").forEach(c => o += `<option value="consumable|${c.sku}">[Consumable] ${c.sku} · ${c.name}</option>`);
  return o;
}

function nextKitId(){
  let max = 0;
  IMS.itemRegistry.getByType("kit").forEach(k => { const n = parseInt(k.kitId.split("-")[1], 10); if (n > max) max = n; });
  return "KT-" + String(max + 1).padStart(3, "0");
}

function compRow(c, i){
  const r = getResource({ type:c.refType, refId:c.refId });
  const rname = r ? (c.refType === "serialized" ? IMS.metadata.mkName(r) : r.name) : c.refId;
  return `<div class="list-line"><span class="l"><span class="type-chip tc-${c.refType}">${c.refType}</span> ${c.qty} × ${rname} <span class="mono">${c.refId}</span></span>
    <span class="r"><button class="remove" data-rem="${i}"><i class="bi bi-x-circle"></i></button></span></div>`;
}

function renderKitComps(root, kit){
  const box = root.querySelector("#k-comps");
  box.innerHTML = kit.components.map((c, i) => compRow(c, i)).join("") || `<p class="text-muted2 py-2">No components bound yet.</p>`;
}

function kitModal(existing){
  const isEdit = !!existing;
  const kit = existing || { kitId: nextKitId(), name:"", baseRate:0, qtyOwned:1, depositPct:25, components:[], active:true };
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
    <div class="row g-3">
      <div class="col-md-3 field-group"><label class="form-label">Default Deposit (%)</label><input class="form-control" id="k-dep" type="number" min="0" max="100" step="1" value="${kit.depositPct != null ? kit.depositPct : 25}"></div>
      <div class="col-md-9 field-group d-flex align-items-end"><span class="text-muted2" style="font-size:11.5px"><i class="bi bi-info-circle"></i> Held as % of the kit's rental at check-out.</span></div>
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
    const kdep = parseFloat(root.querySelector("#k-dep").value);
    kit.depositPct = isNaN(kdep) ? 25 : Math.min(100, Math.max(0, kdep));
    kit.active = root.querySelector("#k-active").checked;
    if (IMS.store){ if (isEdit) IMS.store.repo("kit").update("kitId", kit.kitId, {}); else IMS.store.repo("kit").create(kit); }
    else if (!isEdit) IMS.itemRegistry.getByType("kit").push(kit);
    renderInventory();
    dismissModal(root);
  });
}

function assetIdChecks(cats, selected){
  const list = cats && cats.length ? IMS.itemRegistry.getByType("serialized").filter(a => cats.includes(a.category)) : [];
  return list.map(a => `<label class="check-line ${(selected || []).includes(a.id) ? "checked" : ""}"><input type="checkbox" value="${a.id}" ${(selected || []).includes(a.id) ? "checked" : ""}>${a.id} — ${IMS.metadata.mkName(a)}</label>`).join("") || `<div class="text-muted2 py-2">Select a category above to see matching assets.</div>`;
}

function catChecks(cats, selected){
  return cats.map(c => `<label class="check-line ${selected.includes(c) ? "checked" : ""}"><input type="checkbox" value="${c}" ${selected.includes(c) ? "checked" : ""}>${c}</label>`).join("");
}

function attachmentModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  const cats = [...new Set(IMS.itemRegistry.getByType("serialized").map(a => a.category))].sort();
  const fits = e.fits || [];
  const selCats = cats.filter(c => fits.some(id => { const a = getAsset(id); return a && a.category === c; }));
  const body = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="a-active" ${recActive(e) ? "checked" : ""}><label class="form-check-label" for="a-active"><strong>Active</strong></label></div>
      <span class="text-muted2" style="font-size:11.5px">Inactive attachments are not selectable</span>
    </div>
    <div class="row g-3">
      <div class="col-md-4 field-group"><label class="form-label">Attachment ID</label><input class="form-control" id="a-accid" value="${e.accId || "ACC-" + String(IMS.itemRegistry.getByType("attachment").length + 1).padStart(3, "0")}"></div>
      <div class="col-md-4 field-group"><label class="form-label">Name</label><input class="form-control" id="a-name" value="${e.name || ""}"></div>
      <div class="col-md-4 field-group"><label class="form-label">Category</label><select class="form-select" id="a-cat">${["Bucket","Carriage","Platform","Hydraulic","Lifting"].map(c => `<option ${c === (e.category || "Bucket") ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="col-md-3 field-group"><label class="form-label">Qty Owned</label><input class="form-control" id="a-qty" type="number" value="${e.qtyOwned || 0}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Daily Rate ($)</label><input class="form-control" id="a-daily" type="number" value="${e.daily || 0}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Default Deposit (%)</label><input class="form-control" id="a-dep" type="number" min="0" max="100" step="1" value="${e.depositPct != null ? e.depositPct : 25}"></div>
      <div class="col-md-3 field-group d-flex align-items-end"><span class="text-muted2" style="font-size:11.5px"><i class="bi bi-info-circle"></i> Held as % of the rental at check-out</span></div>
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
      accId: root.querySelector("#a-accid").value || ("ACC-" + String(IMS.itemRegistry.getByType("attachment").length + 1).padStart(3, "0")),
      name: root.querySelector("#a-name").value,
      category: root.querySelector("#a-cat").value,
      qtyOwned: parseFloat(root.querySelector("#a-qty").value) || 0,
      daily: parseFloat(root.querySelector("#a-daily").value) || 0,
      depositPct: (() => { const d = parseFloat(root.querySelector("#a-dep").value); return isNaN(d) ? 25 : Math.min(100, Math.max(0, d)); })(),
      active: root.querySelector("#a-active").checked,
      fits: Array.from(root.querySelectorAll("#a-ids input:checked")).map(i => i.value)
    };
    itemWrite("attachment", isEdit ? existing : null, rec);
    renderInventory();
    dismissModal(root);
  });
}

