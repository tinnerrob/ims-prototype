/* =========================================================
   IMS — handoff.js
   Equipment Hand-Off / Check In-Out + Chain of Custody.
   Rented serialized equipment appears per contract with
   Check-Out / Check-In. "New Rental" opens a full short-term
   rental contract (multiple assets, pricing + tax) for a
   walk-in customer. Return prompts a check-in flow. Every
   hand-off writes an immutable chain-of-custody event.
   ========================================================= */
"use strict";

/* ---- chain-of-custody helpers ---- */
const hoEvents = assetId => (IMS.handoffs || []).filter(h => h.assetId === assetId);
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
function hoCheckOut(assetId, contractId, note){
  if (assetOutInfo(assetId)) return;                       // already out — no double hand-off
  const c = getContract(contractId);
  hoLog(assetId, contractId, "Check-Out", hoCustodian(c), note || ("Checked out to " + (c ? c.contractId : contractId)));
  const a = getResource({ type: "serialized", refId: assetId });
  if (a){ a.status = "On Rent"; a.contractId = contractId; }
  renderHandoff();
}
function hoCheckIn(assetId, note){
  const info = assetOutInfo(assetId);
  if (!info) return;
  hoLog(assetId, info.contractId, "Check-In", info.custodian, note || "Returned to yard / available.");
  const a = getResource({ type: "serialized", refId: assetId });
  if (a){ a.status = "Available"; a.contractId = null; }
  /* A walk-in rental completes when its last asset is returned. */
  const c = info.contract;
  if (c && c.counter){
    const stillOut = IMS.serializedAssets.some(x => { const o = assetOutInfo(x.id); return o && o.contractId === c.contractId; });
    if (!stillOut){ c.status = "closed"; }
  }
  renderHandoff();
}

/* ---- date / id helpers ---- */
function hoTodayStr(){ const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function nextContractId(){ let n = 0; IMS.contracts.forEach(c => { const m = parseInt(String(c.contractId).split("-").pop(), 10); if (m > n) n = m; }); return `CT-${new Date().getFullYear()}-${String(n + 1).padStart(3, "0")}`; }
function nextCustomerId(){ let n = 0; IMS.customers.forEach(c => { const m = parseInt(String(c.id).split("-").pop(), 10); if (m > n) n = m; }); return "CUST-" + String(n + 1).padStart(3, "0"); }
function nextLiId(){ let n = 0; IMS.contracts.forEach(c => (c.lineItems || []).forEach(l => { const m = parseInt(String(l.id).split("-")[1], 10); if (m > n) n = m; })); return "LI-" + String(n + 1).padStart(3, "0"); }
function availableSerialized(){ return IMS.serializedAssets.filter(a => recActive(a) && a.status !== "In Shop" && !assetOutInfo(a.id)); }


/* ---- page ---- */
function renderHandoff(){
  const active = IMS.contracts.filter(c => c.status === "active").sort((a, b) => a.contractId < b.contractId ? -1 : 1);
  const outN = IMS.serializedAssets.reduce((s, a) => s + (assetOutInfo(a.id) ? 1 : 0), 0);
  const availN = availableSerialized().length;
  const fleetN = IMS.serializedAssets.length;

  let body = "";
  active.forEach(c => {
    const ids = hoScheduledIds(c.contractId).filter(id => { const o = assetOutInfo(id); return !o || o.contractId === c.contractId; });
    if (!ids.length) return;
    body += `<tr class="ho-sec"><td colspan="7"><span class="mono strong">${c.contractId}</span> · ${c.projectName}
      <span class="text-muted2">${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}</span></td></tr>`;
    ids.forEach(id => {
      const a = getResource({ type: "serialized", refId: id }) || { id };
      const out = assetOutInfo(id);
      body += `<tr>
        <td class="strong">${a.id}</td>
        <td class="text-muted2">${a.make || ""} ${a.model || ""}</td>
        <td>${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}</td>
        <td>${out ? out.custodian : hoCustodian(c)}</td>
        <td>${out ? fmtDT(out.at) : "—"}</td>
        <td><span class="badge-status ${out ? "st-out" : "st-reorder"}">${out ? "On Site" : "Scheduled"}</span></td>
        <td class="text-end text-nowrap">
          ${out
            ? `<button class="btn btn-ims btn-sm2" data-ho="in" data-asset="${a.id}"><i class="bi bi-box-arrow-in-down"></i> Check In</button>`
            : `<button class="btn btn-ims-outline btn-sm2" data-ho="out" data-asset="${a.id}" data-contract="${c.contractId}"><i class="bi bi-box-arrow-up-right"></i> Check Out</button>`}
        </td>
      </tr>`;
    });
  });

  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card mb-3">
      <div class="card-header"><span class="card-title"><i class="bi bi-box-arrow-up-right"></i> Equipment Hand-Off</span>
        <button class="btn btn-ims btn-sm2" id="newRentalBtn"><i class="bi bi-plus-lg"></i> New Rental</button></div>
    </div>
    <div class="row g-3 mb-3">
      <div class="col-md-4"><div class="card"><div class="card-body ho-stat"><div class="ho-stat-num">${outN}</div><div class="text-muted2">On site with customer</div></div></div></div>
      <div class="col-md-4"><div class="card"><div class="card-body ho-stat"><div class="ho-stat-num">${availN}</div><div class="text-muted2">Ready to rent</div></div></div></div>
      <div class="col-md-4"><div class="card"><div class="card-body ho-stat"><div class="ho-stat-num">${fleetN}</div><div class="text-muted2">Total fleet</div></div></div></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-truck"></i> Rented &amp; Scheduled Equipment by Contract</span>
        <span class="badge-status ${outN ? "st-out" : "st-available"}">${outN} on site</span></div>
      <div class="card-body table-wrap">
        <table class="table"><thead><tr>
          <th>Asset</th><th>Model</th><th>Rental window</th><th>Custodian</th><th>Checked out</th><th>Status</th><th class="text-end">Action</th>
        </tr></thead><tbody id="hoTable">${body || `<tr><td colspan="7" class="text-center text-muted2 py-4">No equipment on active rentals.</td></tr>`}</tbody></table>
      </div>
    </div>`;

  bindHandoff();
}

function bindHandoff(){
  const nb = $("#newRentalBtn");
  if (nb) nb.addEventListener("click", openNewRentalModal);
  delegate($("#hoTable"), "click", "button[data-ho]", (el) => {
    if (el.dataset.ho === "out") hoCheckOut(el.dataset.asset, el.dataset.contract);
    else hoCheckInModal(el.dataset.asset);
  });
}


/* ---- return: prompt a check-in flow ---- */
function hoCheckInModal(assetId){
  const info = assetOutInfo(assetId);
  if (!info) return;
  const a = info.asset || {};
  const body = `
    <div class="lab-punch-head"><div><span class="strong">${a.id}</span><div class="text-muted2">${a.make || ""} ${a.model || ""}</div></div>
      <span class="badge-status st-out">On Site</span></div>
    <div class="list-line"><span class="l">Rental / contract</span><span class="r strong">${info.contractId}${info.contract ? " · " + info.contract.projectName : ""}</span></div>
    <div class="list-line"><span class="l">Custodian</span><span class="r">${info.custodian}</span></div>
    <div class="list-line"><span class="l">Checked out</span><span class="r mono">${fmtDT(info.at)}</span></div>
    <div class="field-group mb-2" style="margin-top:10px"><label class="form-label">Return condition / note (optional)</label>
      <textarea class="form-control" id="ci-note" rows="2" placeholder="Condition on return, hours, notes…"></textarea></div>`;
  const root = openRawModal({
    id: "mdl-checkin", title: "Return Equipment — " + assetId, icon: "bi-box-arrow-in-down",
    body,
    footer: `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
      <button type="button" class="btn btn-ims" id="ci-confirm"><i class="bi bi-check2"></i> Confirm Return</button>`
  });
  $("#ci-confirm").addEventListener("click", () => {
    const note = $("#ci-note").value.trim();
    dismissModal(root);
    hoCheckIn(assetId, note || "Returned to yard / available.");
  });
}


/* ---- New Rental modal (full short-term contract, multiple assets) ---- */
function taxRate(){ const g = (IMS.settings.taxSchedules || []).find(t => t.code === "GA"); return g ? g.rate : 0.08; }

function openNewRentalModal(){
  const today = hoTodayStr();
  const avail = availableSerialized();
  const assetOpts = avail.map(a => `<option value="${a.id}">${a.id} — ${a.make} ${a.model} · ${fmtMoney(a.baseDaily)}/day</option>`).join("");
  const custOpts = IMS.customers.slice().sort((a, b) => a.name < b.name ? -1 : 1)
    .map(c => `<option value="${c.id}">${c.name}</option>`).join("") + `<option value="__new__">+ New customer…</option>`;
  const body = `
    <div class="row g-2">
      <div class="col-12 field-group"><label class="form-label">Customer</label>
        <select class="form-select" id="rn-cust">${custOpts}</select></div>
    </div>
    <div id="rn-new" class="ho-new-cust mb-2" style="display:none">
      <div class="row g-2">
        <div class="col-6 field-group"><label class="form-label">Name *</label><input class="form-control" id="rn-name" placeholder="Customer / company name"></div>
        <div class="col-6 field-group"><label class="form-label">Contact</label><input class="form-control" id="rn-contact" placeholder="Contact name"></div>
        <div class="col-6 field-group"><label class="form-label">Phone</label><input class="form-control" id="rn-phone" placeholder="(555) 555-0100"></div>
        <div class="col-6 field-group"><label class="form-label">Email</label><input class="form-control" id="rn-email" type="email" placeholder="name@email.com"></div>
        <div class="col-12 field-group"><label class="form-label">Billing / delivery address</label><input class="form-control" id="rn-address" placeholder="Street, City, State"></div>
      </div>
    </div>
    <div class="row g-2">
      <div class="col-12 field-group"><label class="form-label">Equipment (select one or more) *</label>
        <select class="form-select" id="rn-assets" multiple size="6">${assetOpts || `<option value="">— none available —</option>`}</select></div>
      <div class="col-6 field-group"><label class="form-label">Rent from</label><input class="form-control" id="rn-start" type="date" value="${today}"></div>
      <div class="col-6 field-group"><label class="form-label">Return by</label><input class="form-control" id="rn-end" type="date" value="${today}"></div>
    </div>
    <div id="rn-preview" class="ho-preview"></div>`;
  const root = openRawModal({
    id: "mdl-rental", size: "lg", title: "New Rental / Check Out", icon: "bi-box-arrow-up-right",
    body,
    footer: `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
      <button type="button" class="btn btn-ims" id="rn-save"><i class="bi bi-check2"></i> Create Rental &amp; Check Out</button>`
  });
  const cust = $("#rn-cust"), nameI = $("#rn-name");
  cust.addEventListener("change", () => {
    const isNew = cust.value === "__new__";
    $("#rn-new").style.display = isNew ? "" : "none";
    if (!isNew){ const c = getCustomer(cust.value); if (c && nameI) nameI.value = c.name; }
  });
  const refresh = () => rnRefreshPreview();
  $("#rn-assets").addEventListener("change", refresh);
  $("#rn-start").addEventListener("change", () => { const e = $("#rn-end"); if (e && (!e.value || e.value < $("#rn-start").value)) e.value = $("#rn-start").value; refresh(); });
  $("#rn-end").addEventListener("change", refresh);
  refresh();
  $("#rn-save").addEventListener("click", () => createRentalFromModal(root));
}

function rnRefreshPreview(){
  const box = $("#rn-preview"); if (!box) return;
  const ids = Array.from($("#rn-assets").selectedOptions).map(o => o.value);
  const start = $("#rn-start").value, end = $("#rn-end").value;
  const days = (start && end) ? daysBetween(start, end) : 0;
  let subtotal = 0;
  ids.forEach(id => { const a = getResource({ type: "serialized", refId: id }); subtotal += (a ? a.baseDaily : 0) * days; });
  const tax = subtotal * taxRate();
  const total = subtotal + tax;
  box.innerHTML = subtotal > 0
    ? `<div class="divider"></div>
       <div class="list-line"><span class="l">${ids.length} asset(s) × ${days} day(s)</span><span class="r">${fmtMoney(subtotal)}</span></div>
       <div class="list-line"><span class="l">Sales tax (${Math.round(taxRate() * 100)}%)</span><span class="r">${fmtMoney(tax)}</span></div>
       <div class="list-line"><span class="l strong">Total due at pick-up</span><span class="r strong">${fmtMoney(total)}</span></div>`
    : `<div class="text-muted2" style="margin-top:8px">Select equipment and dates to preview pricing.</div>`;
}


function createRentalFromModal(root){
  const custVal = $("#rn-cust").value;
  let custId = custVal, custName = "", custContact = "", custPhone = "", custEmail = "", custAddr = "";
  if (custVal === "__new__"){
    custName = ($("#rn-name").value || "").trim();
    if (!custName){ window.alert("Enter the customer name."); return; }
    custContact = ($("#rn-contact").value || "").trim() || custName;
    custPhone = ($("#rn-phone").value || "").trim();
    custEmail = ($("#rn-email").value || "").trim();
    custAddr = ($("#rn-address").value || "").trim();
    custId = nextCustomerId();
    IMS.customers.push({ id: custId, name: custName, contact: custContact, phone: custPhone, email: custEmail, billingAddress: custAddr, billingCycle: "walk-in", notes: "Equipment rental" });
  } else {
    const c = getCustomer(custVal);
    if (c){ custName = c.name; custContact = c.contact || c.name; custAddr = c.billingAddress || ""; custPhone = c.phone || ""; custEmail = c.email || ""; }
  }
  const ids = Array.from($("#rn-assets").selectedOptions).map(o => o.value);
  if (!ids.length){ window.alert("Choose at least one piece of equipment."); return; }
  const start = $("#rn-start").value || hoTodayStr();
  let end = $("#rn-end").value || start; if (end < start) end = start;
  const cid = nextContractId();
  const lineItems = ids.map(refId => ({ id: nextLiId(), type: "serialized", refId, qty: 1, pricingMatrix: "standard", weekendPolicy: "bill", riskPremium: "standard", flatTotal: 0 }));
  IMS.contracts.push({
    contractId: cid, customerId: custId, customer: custName,
    jobSite: custAddr || "Front counter pickup",
    projectName: "Equipment Rental — " + custName,
    startDate: start + "T09:00", endDate: end + "T17:00", status: "active", counter: true,
    siteLat: (IMS.yard && IMS.yard.lat) || 33.7490, siteLng: (IMS.yard && IMS.yard.lng) || -84.3880,
    lineItems
  });
  ids.forEach(refId => {
    const a = getResource({ type: "serialized", refId });
    if (a){ a.status = "On Rent"; a.contractId = cid; }
    hoLog(refId, cid, "Check-Out", custContact, "Rental checked out at the front desk.");
  });
  dismissModal(root);
  renderHandoff();
}

