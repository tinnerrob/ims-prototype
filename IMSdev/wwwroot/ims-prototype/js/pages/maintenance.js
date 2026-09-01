/* =========================================================
   IMS — maintenance.js (split out of app.js)
   Service & maintenance (work orders).
   ========================================================= */
"use strict";

/* =========================================================
   STAGE 5 — SERVICE & MAINTENANCE
   ========================================================= */
function woComputed(w){
  const partsCost = (w.parts || []).reduce((s, p) => {
    if (p.kind === "part") { const pr = IMS.parts.find(x => x.partId === p.refId); return s + (pr ? pr.costPrice * p.qty : 0); }
    const c = IMS.consumables.find(x => x.sku === p.sku);
    return s + (c ? c.costPrice * p.qty : 0);
  }, 0);
  const tech = IMS.labor.find(e => e.role === "Technician");
  const laborRate = tech ? tech.hourlyCost : 30;
  const laborCost = (w.laborHours || 0) * laborRate;
  return { partsCost, laborCost, total: partsCost + laborCost, laborRate };
}

function renderMaintenance(){
  const woRows = IMS.workOrders
    .filter(w => App.woFilter === "all" || w.status === App.woFilter)
    .map(w => ({ ...w, ...woComputed(w), asset: IMS.serializedAssets.find(a => a.id === w.assetId) }));
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-tools"></i> Work Order Grid</span>
        <div class="d-flex align-items-center gap-2">
          <select class="form-select form-select-sm" id="woFilter" style="width:auto">
            <option value="all" ${App.woFilter === "all" ? "selected" : ""}>All</option>
            <option value="In Progress" ${App.woFilter === "In Progress" ? "selected" : ""}>In Progress</option>
            <option value="Completed" ${App.woFilter === "Completed" ? "selected" : ""}>Completed</option>
            <option value="Scheduled" ${App.woFilter === "Scheduled" ? "selected" : ""}>Scheduled</option>
          </select>
          <button class="btn btn-ims btn-sm2" id="newWoBtn"><i class="bi bi-plus-lg"></i> New Work Order</button>
        </div></div>
      <div class="card-body table-wrap">
        <table class="table"><thead><tr>
          <th>WO #</th><th>Asset</th><th>Service Type</th><th class="num">Meter Reading</th><th>Status</th>
          <th>Parts Used</th><th class="num">Labor Hrs</th><th class="num">Parts Cost</th><th class="num">Labor Cost</th><th class="num">Total Cost</th><th>Date</th>
        </tr></thead><tbody>
          ${woRows.map(w => `<tr data-edit="${w.woId}">
            <td class="strong mono">${w.woId}</td>
            <td class="strong">${w.assetId} <span class="text-muted2">${w.asset ? w.asset.model : ""}</span></td>
            <td>${w.type}</td>
            <td class="num">${fmtInt(w.meterReading)}</td>
            <td>${statusBadge(w.status)}</td>
            <td>${(w.parts || []).map(p => `<span class="badge-status st-inshop">${p.kind === "part" ? p.refId : p.sku} ×${p.qty}</span>`).join(" ") || `<span class="text-muted2">—</span>`}</td>
            <td class="num">${w.laborHours}</td>
            <td class="num">${fmtMoney(w.partsCost)}</td>
            <td class="num">${fmtMoney(w.laborCost)}</td>
            <td class="num strong">${fmtMoney(w.total)}</td>
            <td class="mono text-muted2">${fmtDate(w.date)}</td>
          </tr>`).join("") || emptyRow(11)}
        </tbody></table>
      </div>
    </div>`;
  const woF = $("#woFilter");
  if (woF) woF.addEventListener("change", e => { App.woFilter = e.target.value; renderMaintenance(); });
  $("#newWoBtn").addEventListener("click", workOrderModal);
  /* Clicking a work order row opens the edit modal. */
  delegate($("#content"), "click", "tr[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const wo = IMS.workOrders.find(x => x.woId === el.dataset.edit);
    if (wo) workOrderModal(wo);
  });
}

function nextWoId(){
  let max = 400;
  IMS.workOrders.forEach(w => { const n = parseInt(w.woId.split("-")[1], 10); if (n > max) max = n; });
  return "WO-" + (max + 1);
}

function workOrderModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  const techs = IMS.labor.filter(x => x.role === "Technician");
  const fields = [
    { key:"assetId", label:"Asset", type:"select", value: e.assetId || IMS.serializedAssets.find(a => a.status === "In Shop")?.id || IMS.serializedAssets[0].id,
      options: IMS.serializedAssets.map(a => ({ value:a.id, label:`${a.id} — ${a.make} ${a.model} (${a.status})` })) },
    { key:"type", label:"Service Type", type:"select", value:e.type || "Repair", options: opt(["Preventive","Repair","Inspection"]) },
    { key:"meterReading", label:"Current Meter Reading", type:"number", value:e.meterReading || 0 },
    { key:"status", label:"Status", type:"select", value:e.status || "In Progress", options: opt(["In Progress","Completed","Pending"]) },
    { key:"laborHours", label:"Labor Hours", type:"number", value:e.laborHours || 1 }
  ];
  if (!isEdit){
    fields.push(
      { key:"partsSku", label:"Part (from Consumables)", type:"select", value: IMS.consumables[0].sku, options: IMS.consumables.map(c => ({ value:c.sku, label:`${c.sku} — ${c.name} (${fmtMoney(c.costPrice)}/ea)` })) },
      { key:"partsQty", label:"Consumable Qty (0 = none)", type:"number", value:0 },
      { key:"partId", label:"Service Part (Stock Inventory)", type:"select", value: IMS.parts[0].partId, options: IMS.parts.filter(p => recActive(p)).map(p => ({ value:p.partId, label:`${p.partId} — ${p.description} (${fmtMoney(p.costPrice)}/ea · ${p.qtyOnHand} on hand)` })) },
      { key:"partQty", label:"Stock Part Qty (0 = none)", type:"number", value:0 },
      { key:"techId", label:"Technician", type:"select", value: techs[0]?.empId || IMS.labor[0].empId, options: IMS.labor.map(e => ({ value:e.empId, label:`${e.empId} — ${e.name} (${e.role})` })) }
    );
  }
  openFormModal({
    id: "mdl-wo", title: (isEdit ? "Edit" : "New") + " Service Work Order", icon: "bi-tools", large: true,
    fields,
    onSave: v => {
      if (isEdit){
        Object.assign(existing, { assetId:v.assetId, type:v.type, meterReading:v.meterReading, status:v.status, laborHours:v.laborHours });
        renderMaintenance(); updateBadges();
        return;
      }
      const tech = IMS.labor.find(x => x.empId === v.techId) || IMS.labor[0];
      const asset = IMS.serializedAssets.find(a => a.id === v.assetId);
      const parts = [];
      if (v.partsQty > 0) parts.push({ kind:"consumable", sku:v.partsSku, qty:v.partsQty });
      if (v.partQty > 0) parts.push({ kind:"part", refId:v.partId, qty:v.partQty });
      IMS.workOrders.push({ woId: nextWoId(), assetId:v.assetId, type:v.type, meterReading:v.meterReading, status:v.status || "In Progress", parts, laborHours:v.laborHours, date: new Date().toISOString().slice(0,10) });
      if (asset) { asset.status = "In Shop"; asset.lastReported = new Date().toISOString().slice(0,19); }
      const cons = IMS.consumables.find(c => c.sku === v.partsSku);
      if (cons && v.partsQty > 0) cons.qtyOnHand = Math.max(0, cons.qtyOnHand - v.partsQty);
      const prt = IMS.parts.find(p => p.partId === v.partId);
      if (prt && v.partQty > 0) prt.qtyOnHand = Math.max(0, prt.qtyOnHand - v.partQty);
      renderMaintenance();
      updateBadges();
    }
  });
}

