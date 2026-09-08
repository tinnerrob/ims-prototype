/* =========================================================
   IMS — handoff.js
   Equipment Hand-Off / Check In-Out  +  Chain of Custody.
   Append-only audit log per serialized asset (a physical
   Check-Out / Check-In to a customer contract). While an asset
   is checked out it is flagged unavailable for scheduling.
   ========================================================= */
"use strict";

/* ---- chain-of-custody helpers ---- */
const hoEvents = assetId => (IMS.handoffs || []).filter(h => h.assetId === assetId);
/* Latest immutable event for an asset (or null). */
function hoLatest(assetId){
  const evs = hoEvents(assetId);
  return evs.length ? evs[evs.length - 1] : null;
}
/* True while an asset is physically out with a customer (last event = Check-Out). */
function assetOutInfo(assetId){
  const last = hoLatest(assetId);
  if (!last || last.direction !== "Check-Out") return null;
  return {
    assetId,
    asset: getResource({ type: "serialized", refId: assetId }),
    contractId: last.contractId,
    contract: getContract(last.contractId),
    custodian: last.custodian,
    at: last.at,
    by: last.by
  };
}
function hoScheduledIds(contractId){
  const c = getContract(contractId);
  return (c && c.lineItems || []).filter(li => li.type === "serialized").map(li => li.refId);
}
function hoCustodian(c){
  if (!c) return "Customer";
  const cust = getCustomer(c.customerId);
  return cust ? cust.contact : (c.customer || "Customer");
}
function hoStamp(){
  const d = new Date(); const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function hoNext(){
  let n = 0;
  (IMS.handoffs || []).forEach(h => { const m = parseInt(String(h.id).split("-")[1], 10); if (m > n) n = m; });
  return "HO-" + pad2(n + 1);
}
/* Immutable write: append an event (never mutate an existing record). */
function hoLog(assetId, contractId, direction, custodian, note){
  IMS.handoffs = IMS.handoffs || [];
  IMS.handoffs.push({ id: hoNext(), assetId, contractId, direction, custodian, at: hoStamp(), by: "D. Reynolds", note: note || "" });
}
function hoCheckOut(assetId, contractId){
  if (assetOutInfo(assetId)) return;                       // already out — no double hand-off
  const c = getContract(contractId);
  hoLog(assetId, contractId, "Check-Out", hoCustodian(c), "Checked out to " + (c ? c.contractId : contractId));
  const a = getResource({ type: "serialized", refId: assetId });
  if (a){ a.status = "On Rent"; a.contractId = contractId; }
  renderHandoff();
}
function hoCheckIn(assetId){
  const info = assetOutInfo(assetId);
  if (!info) return;
  hoLog(assetId, info.contractId, "Check-In", info.custodian, "Returned to yard / available.");
  const a = getResource({ type: "serialized", refId: assetId });
  if (a){ a.status = "Available"; a.contractId = null; }
  /* A walk-in counter rental completes when its last asset is returned. */
  const c = info.contract;
  if (c && c.counter){
    const stillOut = IMS.serializedAssets.some(x => { const o = assetOutInfo(x.id); return o && o.contractId === c.contractId; });
    if (!stillOut){ c.status = "closed"; c.endDate = (c.endDate || ""); }
  }
  renderHandoff();
}

/* ---- audit (chain of custody) modal ---- */
function hoAuditModal(assetId){
  const a = getResource({ type: "serialized", refId: assetId }) || {};
  const rows = hoEvents(assetId).map(h => `<div class="list-line">
    <span class="l"><span class="mono strong">${h.id}</span> · <span class="badge-status ${h.direction === "Check-Out" ? "st-out" : "st-available"}">${h.direction}</span> ${h.contractId || ""}</span>
    <span class="r"><span class="mono">${fmtDT(h.at)}</span></span>
    <div class="text-muted2" style="grid-column:1/-1">Custodian: <strong>${h.custodian}</strong> · by ${h.by}${h.note ? " · " + h.note : ""}</div>
  </div>`).join("");
  openRawModal({
    id: "mdl-audit", title: "Chain of Custody — " + assetId, icon: "bi-fingerprint",
    body: `<div class="text-muted2 mb-2" style="font-size:12px">${assetId} · ${a.make || ""} ${a.model || ""} — immutable audit log (${hoEvents(assetId).length} events)</div>${rows || `<p class="text-muted2">No hand-off events.</p>`}`,
    footer: `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Close</button>`
  });
}

/* ---- page ---- */
function renderHandoff(){
  const active = IMS.contracts.filter(c => c.status === "active").sort((a, b) => a.contractId < b.contractId ? -1 : 1);
  const all = IMS.serializedAssets;
  const outN = all.reduce((s, a) => s + (assetOutInfo(a.id) ? 1 : 0), 0);
  const onSite = all.filter(a => assetOutInfo(a.id));
  const scheduled = active.reduce((s, c) => s + hoScheduledIds(c.contractId).length, 0);

  let body = "";
  active.forEach(c => {
    const ids = hoScheduledIds(c.contractId).filter(id => !assetOutInfo(id) || assetOutInfo(id).contractId === c.contractId);
    if (!ids.length) return;
    body += `<tr class="ho-sec"><td colspan="8"><span class="mono strong">${c.contractId}</span> · ${c.projectName}
      <span class="text-muted2">${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}</span></td></tr>`;
    ids.forEach(id => {
      const a = getResource({ type: "serialized", refId: id }) || { id };
      const out = assetOutInfo(id);
      const state = out ? "out" : "scheduled";
      body += `<tr>
        <td class="strong">${a.id}</td>
        <td class="text-muted2">${a.make || ""} ${a.model || ""}</td>
        <td>${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}</td>
        <td>${out ? out.custodian : hoCustodian(c)}</td>
        <td>${out ? fmtDT(out.at) : "—"}</td>
        <td><span class="badge-status ${state === "out" ? "st-out" : "st-reorder"}">${state === "out" ? "On Site" : "Scheduled"}</span></td>
        <td><button class="btn btn-ims-outline btn-sm2" data-audit="${a.id}"><i class="bi bi-fingerprint"></i> ${hoEvents(a.id).length}</button></td>
        <td class="text-end text-nowrap">
          ${state === "out"
            ? `<button class="btn btn-ims btn-sm2" data-ho="in" data-asset="${a.id}"><i class="bi bi-box-arrow-in-down"></i> Check In</button>`
            : `<button class="btn btn-ims-outline btn-sm2" data-ho="out" data-asset="${a.id}" data-contract="${c.contractId}"><i class="bi bi-box-arrow-up-right"></i> Check Out</button>`}
        </td>
      </tr>`;
    });
  });

  const onSiteRows = onSite.map(o => `<div class="list-line">
      <span class="l"><span class="strong mono">${o.assetId}</span> · ${o.asset ? o.asset.make + " " + o.asset.model : ""} — on <span class="mono strong">${o.contractId}</span></span>
      <span class="r text-nowrap"><span class="text-muted2">${o.custodian}</span>
        <button class="btn btn-ims-outline btn-sm2" data-audit="${o.assetId}" title="Audit trail"><i class="bi bi-fingerprint"></i></button>
        <button class="btn btn-ims btn-sm2" data-ho="in" data-asset="${o.assetId}">Return</button></span>
    </div>`).join("") || `<p class="text-muted2">No equipment currently out.</p>`;

  const audit = (IMS.handoffs || []).slice().sort((x, y) => x.at < y.at ? 1 : -1)
    .map(h => `<tr>
      <td class="mono strong">${h.id}</td><td class="strong">${h.assetId}</td>
      <td>${h.contractId || "—"}</td>
      <td><span class="badge-status ${h.direction === "Check-Out" ? "st-out" : "st-available"}">${h.direction}</span></td>
      <td>${h.custodian}</td><td class="mono">${fmtDT(h.at)}</td><td>${h.by}</td>
    </tr>`).join("");

  const today = hoTodayStr();
  const renAssets = IMS.serializedAssets.filter(a => recActive(a) && a.status !== "In Shop" && !assetOutInfo(a.id));
  const renOpts = renAssets.map(a => `<option value="${a.id}">${a.id} — ${a.make} ${a.model} · ${fmtMoney(a.baseDaily)}/d</option>`).join("");
  const custOpts = IMS.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join("") + `<option value="__new__">+ New walk-in customer…</option>`;
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="row g-3 mb-3">
      <div class="col-md-4"><div class="card"><div class="card-body ho-stat">
        <div class="ho-stat-num">${outN}</div><div class="text-muted2">Equipment on site (out)</div></div></div></div>
      <div class="col-md-4"><div class="card"><div class="card-body ho-stat">
        <div class="ho-stat-num">${scheduled}</div><div class="text-muted2">Scheduled this period</div></div></div></div>
      <div class="col-md-4"><div class="card"><div class="card-body ho-stat">
        <div class="ho-stat-num">${all.length - outN}</div><div class="text-muted2">In yard / available</div></div></div></div>
    </div>
    <div class="card mb-3">
      <div class="card-header"><span class="card-title"><i class="bi bi-shop"></i> Walk-in Counter Rental</span>
        <span class="text-muted2" style="font-weight:500">Rent on the spot — creates a short-term rental, checks equipment out, and completes it on return</span></div>
      <div class="card-body">
        <div class="row g-2 align-items-end">
          <div class="col-md-3 field-group"><label class="form-label">Customer</label><select id="ren-cust" class="form-select">${custOpts}</select></div>
          <div class="col-md-2 field-group" id="ren-new-wrap" style="display:none"><label class="form-label">Walk-in name</label><input id="ren-new" class="form-control" placeholder="Customer name"></div>
          <div class="col-md-3 field-group"><label class="form-label">Equipment</label><select id="ren-asset" class="form-select">${renOpts || `<option value="">— no equipment available —</option>`}</select></div>
          <div class="col-md-2 field-group"><label class="form-label">Check-out date</label><input id="ren-start" class="form-control" type="date" value="${today}"></div>
          <div class="col-md-2 field-group"><label class="form-label">Return date</label><input id="ren-end" class="form-control" type="date" value="${today}"></div>
        </div>
        <button id="renRent" class="btn btn-ims mt-3"><i class="bi bi-box-arrow-up-right"></i> Rent &amp; Check Out</button>
      </div>
    </div>
    <div class="card mb-3">
      <div class="card-header"><span class="card-title"><i class="bi bi-truck"></i> Equipment by Contract — Dispatch &amp; Return</span>
        <span class="badge-status ${outN ? "st-out" : "st-available"}">${outN} on site</span></div>
      <div class="card-body table-wrap">
        <table class="table"><thead><tr>
          <th>Asset</th><th>Model</th><th>Rental window</th><th>Custodian</th><th>Checked out</th><th>Status</th><th class="num">Custody</th><th class="text-end">Action</th>
        </tr></thead><tbody id="hoTable">${body || `<tr><td colspan="8" class="text-center text-muted2 py-4">No serialized equipment scheduled on active contracts.</td></tr>`}</tbody></table>
      </div>
    </div>
    <div class="split-layout">
      <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-geo"></i> Currently On Site</span></div>
        <div class="card-body">${onSiteRows}</div></div>
      <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-fingerprint"></i> Audit Trail / Chain of Custody</span>
        <span class="badge-status st-inshop">${(IMS.handoffs || []).length} events</span></div>
        <div class="card-body table-wrap">
          <table class="table"><thead><tr><th>Ref</th><th>Asset</th><th>Contract</th><th>Action</th><th>Custodian</th><th>When</th><th>By</th></tr></thead>
          <tbody>${audit}</tbody></table>
        </div></div>
    </div>`;

  delegate($("#hoTable"), "click", "button[data-ho]", (el) => {
    if (el.dataset.ho === "out") hoCheckOut(el.dataset.asset, el.dataset.contract);
    else hoCheckIn(el.dataset.asset);
  });
  delegate($("#hoTable"), "click", "button[data-audit]", (el) => hoAuditModal(el.dataset.audit));
  delegate($("#content"), "click", ".card button[data-audit], .card button[data-ho]", (el) => {
    if (el.closest("#hoTable")) return;                     // already handled by the table delegation
    if (el.dataset.audit) hoAuditModal(el.dataset.audit);
    else if (el.dataset.ho === "in") hoCheckIn(el.dataset.asset);
  });
  const custSel = $("#ren-cust");
  if (custSel) custSel.addEventListener("change", () => { const w = $("#ren-new-wrap"); if (w) w.style.display = custSel.value === "__new__" ? "" : "none"; });
  const rs = $("#ren-start"), re = $("#ren-end");
  if (rs && re) rs.addEventListener("change", () => { if (!re.value || re.value < rs.value) re.value = rs.value; });
  const rb = $("#renRent");
  if (rb) rb.addEventListener("click", createCounterRental);
}


/* ---- walk-in counter rental ---- */
function hoTodayStr(){ const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function counterContractId(){ let n = 0; IMS.contracts.forEach(c => { const m = parseInt(String(c.contractId).split("-").pop(), 10); if (m > n) n = m; }); return `CT-${new Date().getFullYear()}-${String(n + 1).padStart(3, "0")}`; }
function counterCustId(){ let n = 0; IMS.customers.forEach(c => { const m = parseInt(String(c.id).split("-").pop(), 10); if (m > n) n = m; }); return "CUST-" + String(n + 1).padStart(3, "0"); }
function counterLiId(){ let n = 0; IMS.contracts.forEach(c => (c.lineItems || []).forEach(l => { const m = parseInt(String(l.id).split("-")[1], 10); if (m > n) n = m; })); return "LI-" + String(n + 1).padStart(3, "0"); }

function createCounterRental(){
  const custVal = $("#ren-cust").value;
  let custId = custVal, custName = custVal, contact = custVal;
  if (custVal === "__new__"){
    custName = ($("#ren-new").value || "").trim();
    if (!custName){ window.alert("Enter the walk-in customer's name."); return; }
    custId = counterCustId();
    IMS.customers.push({ id: custId, name: custName, contact: custName, phone: "", email: "", billingAddress: "Front counter", billingCycle: "walk-in", notes: "Counter rental" });
    contact = custName;
  } else {
    const c = getCustomer(custVal);
    if (c){ custName = c.name; contact = c.contact || c.name; }
  }
  const assetId = $("#ren-asset").value;
  if (!assetId){ window.alert("Choose equipment to rent."); return; }
  const start = $("#ren-start").value || hoTodayStr();
  let end = $("#ren-end").value || start; if (end < start) end = start;
  const a = getResource({ type: "serialized", refId: assetId });
  const cid = counterContractId();
  IMS.contracts.push({
    contractId: cid, customerId: custId, customer: custName, jobSite: "Front counter pickup",
    projectName: "Counter Rental — " + custName,
    startDate: start + "T09:00", endDate: end + "T17:00", status: "active", counter: true,
    siteLat: (IMS.yard && IMS.yard.lat) || 33.7490, siteLng: (IMS.yard && IMS.yard.lng) || -84.3880,
    lineItems: [{ id: counterLiId(), type: "serialized", refId: assetId, qty: 1, pricingMatrix: "standard", weekendPolicy: "bill", riskPremium: "standard", flatTotal: 0 }]
  });
  if (a){ a.status = "On Rent"; a.contractId = cid; }
  hoLog(assetId, cid, "Check-Out", contact, "Counter rental — checked out at the front desk.");
  renderHandoff();
}

