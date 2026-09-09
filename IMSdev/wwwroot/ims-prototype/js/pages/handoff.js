/* =========================================================
   IMS — handoff.js
   Item Hand-Off & Custody / Check In-Out + Chain of Custody.
   Rented serialized equipment appears per order with
   Check-Out / Check-In. Return prompts a check-in flow. Every
   hand-off writes an immutable chain-of-custody event.
   NOTE: the "New Order / Check-Out" entry point (newRentalBtn)
   is provided by the multi-step wizard in handoff-wiz.js (which
   loads after this file); the legacy single-scroll modal was
   removed. This file owns the day board + custody actions.
   ========================================================= */
"use strict";

/* ---- movement (audit) model ----
   The append-only movement log generalizes the former "hand-off" log: every
   physical movement of an item — issue (custody to a party/order), return,
   receive, transfer, adjust — is one immutable movement record. Serialized /
   rental / loan workflows are one consumer of this generic model. */
const mvKindLabel = k => ({ issue:"Issue", return:"Return", receive:"Receive", transfer:"Transfer", adjust:"Adjust" })[k] || k;
const hoEvents = itemId => (IMS.movements || []).filter(m => m.refType === "serialized" && m.refId === itemId);
function hoLatest(itemId){
  const evs = hoEvents(itemId);
  return evs.length ? evs[evs.length - 1] : null;
}
/* A serialized item is out (in a party's custody) while its latest movement is an issue. */
function assetOutInfo(assetId){
  const last = hoLatest(assetId);
  if (!last || last.kind !== "issue") return null;
  return {
    assetId,
    asset: getResource({ type: "serialized", refId: assetId }),
    orderId: last.orderId,
    order: getOrder(last.orderId),
    custodian: last.party,
    at: last.at,
    by: last.by
  };
}
function hoScheduledIds(orderId){
  const c = getOrder(orderId);
  return (c && c.lineItems || []).filter(li => li.type === "serialized").map(li => li.refId);
}
function hoCustodian(c){
  if (!c) return "Customer";
  const cust = getParty(c.partyId);
  return cust ? cust.contact : (c.party || "Customer");
}
function hoStamp(){
  const d = new Date(); const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function hoNext(){
  let n = 0;
  (IMS.movements || []).forEach(m => { const p = String(m.id).split("-").pop(); const v = parseInt(p, 10); if (v > n) n = v; });
  return "MV-" + String(n + 1).padStart(3, "0");
}
/* Map legacy hand-off direction copy onto generic movement kinds. */
const mvFromAction = a => (a === "Check-Out" || a === "issue") ? "issue" : (a === "Check-In" || a === "return") ? "return" : a;
/* Immutable write: append a movement record (never mutate an existing one). */
function hoLog(refId, orderId, action, party, note){
  IMS.movements = IMS.movements || [];
  const kind = mvFromAction(action);
  const mvRec = {
    id: hoNext(), refType: "serialized", refId,
    kind,
    orderId: orderId || null,
    party: party || "Unknown",
    location: ((IMS.yard && IMS.yard.name) || "Main yard"),
    at: hoStamp(), by: "D. Reynolds", note: note || ""
  };
  if (IMS.store) IMS.store.repo("movements").create(mvRec); else IMS.movements.push(mvRec);
}
function hoCheckOut(assetId, orderId, note){
  if (assetOutInfo(assetId)) return;                       // already out — no double hand-off
  const c = getOrder(orderId);
  hoLog(assetId, orderId, "Check-Out", hoCustodian(c), note || ("Checked out to " + (c ? c.orderId : orderId)));
  storeUpdateItem("serialized", assetId, { status: "On Rent", orderId, lastReported: new Date().toISOString().slice(0, 19) });
  renderHandoff();
}
function hoCheckIn(assetId, note){
  const info = assetOutInfo(assetId);
  if (!info) return;
  hoLog(assetId, info.orderId, "Check-In", info.custodian, note || "Returned to yard / available.");
  storeUpdateItem("serialized", assetId, { status: "Available", orderId: null, lastReported: new Date().toISOString().slice(0, 19) });
  /* Check-in must NOT remove the order from the scheduler. If the unit is
     returned before its scheduled end, tighten the order window so the
     scheduler reflects the actual (early) check-in timeframe. */
  const c = info.order;
  const returnAt = hoStamp();
  if (c){
    const stillOut = IMS.itemRegistry.getByType("serialized").some(x => { const o = assetOutInfo(x.id); return o && o.orderId === c.orderId; });
    const liEnd = l => (l.endDate || c.endDate || "");
    const li = (c.lineItems || []).find(l => l.type === "serialized" && l.refId === assetId);
    if (li && liEnd(li) && returnAt < liEnd(li)) li.endDate = returnAt;
    if (!stillOut){
      if (!c.endDate || returnAt < c.endDate) c.endDate = returnAt;
      (c.lineItems || []).forEach(l => {
        if (l.type === "serialized" && liEnd(l) && returnAt < liEnd(l)) l.endDate = returnAt;
      });
    }
    if (IMS.store) IMS.store.repo("orders").update("orderId", c.orderId, { endDate: c.endDate });
  }
  renderHandoff();
}

/* ---- date / id helpers ---- */
function hoTodayStr(){ const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function nextOrderId(){ let n = 0; IMS.orders.forEach(c => { const m = parseInt(String(c.orderId).split("-").pop(), 10); if (m > n) n = m; }); return `CT-${new Date().getFullYear()}-${String(n + 1).padStart(3, "0")}`; }
function nextPartyId(){ let n = 0; IMS.parties.forEach(c => { const m = parseInt(String(c.id).split("-").pop(), 10); if (m > n) n = m; }); return "PTY-" + String(n + 1).padStart(3, "0"); }
function nextLiId(){ let n = 0; IMS.orders.forEach(c => (c.lineItems || []).forEach(l => { const m = parseInt(String(l.id).split("-")[1], 10); if (m > n) n = m; })); return "LI-" + String(n + 1).padStart(3, "0"); }
function availableSerialized(){ return IMS.itemRegistry.getByType("serialized").filter(a => recActive(a) && a.status !== "In Shop" && !assetOutInfo(a.id)); }


/* ---- page ---- */
/* =========================================================
   Hand-Off day board: outbound (to check out) vs incoming
   (to check in) for a selected day, with next/prev day nav.
   ========================================================= */
let hoDayISO = null;
function hoAnchorDay(){ if (!hoDayISO) hoDayISO = hoTodayStr(); return hoDayISO; }
function hoMoveDay(n){ hoDayISO = addDays(hoAnchorDay(), n); renderHandoff(); }
function hoGoToday(){ hoDayISO = hoTodayStr(); renderHandoff(); }
function hoFmtDay(){
  return new Date(hoAnchorDay() + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function hoDayStr(v){ return (v || "").slice(0, 10); }

function renderHandoff(){
  const D = hoAnchorDay();
  const active = IMS.orders.filter(c => c.status === "active").sort((a, b) => a.orderId < b.orderId ? -1 : 1);

  /* Outbound = serialized units still in the yard that should go out on/before D.
     Incoming = serialized units currently on site that are due back by D. */
  const outbound = [], incoming = [];
  active.forEach(c => {
    (c.lineItems || []).forEach(li => {
      if (li.type !== "serialized") return;
      const s = hoDayStr(li.startDate || c.startDate);
      const e = hoDayStr(li.endDate || c.endDate);
      const a = getResource({ type: "serialized", refId: li.refId }) || { id: li.refId };
      const out = assetOutInfo(li.refId);
      const rec = { c, a, id: li.refId, out, s, e };
      if (!out && s <= D && D <= e) outbound.push(rec);
      else if (out && e <= D) incoming.push(rec);
    });
  });

  const rowHTML = (rec, kind) => {
    const { c, a, id, out, s, e } = rec;
    const isOutbound = kind === "out";
    const status = isOutbound
      ? (s === D
          ? `<span class="badge-status st-out">Pick-up today</span>`
          : `<span class="badge-status st-reorder">Go out (overdue)</span>`)
      : (e === D
          ? `<span class="badge-status st-out">Due back today</span>`
          : `<span class="badge-status st-reorder">Overdue return</span>`);
    return `
      <tr class="ho-row" data-hoopen="${c.orderId}">
        <td class="strong mono">${a.id}</td>
        <td class="mono">${c.orderId}</td>
        <td class="text-muted2">${IMS.metadata.mkName(a)}</td>
        <td>${fmtDate(s)} → ${fmtDate(e)}</td>
        <td>${isOutbound ? hoCustodian(c) : (out.custodian + `<div class="text-muted2 small">out ${fmtDT(out.at)}</div>`)}</td>
        <td>${status}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-ims-outline btn-sm2" data-hoopen="${c.orderId}" title="Open order"><i class="bi bi-eye"></i></button>
          ${isOutbound
            ? `<button class="btn btn-ims btn-sm2" data-ho="out" data-asset="${a.id}" data-order="${c.orderId}"><i class="bi bi-box-arrow-up-right"></i> Check Out</button>`
            : `<button class="btn btn-ims btn-sm2" data-ho="in" data-asset="${a.id}"><i class="bi bi-box-arrow-in-down"></i> Check In</button>`}
        </td>
      </tr>`;
  };

  const thead = `<thead><tr>
      <th>Asset</th><th>Contract</th><th>Model</th><th>Rental window</th><th>Custodian</th><th>Status</th><th class="text-end">Actions</th>
    </tr></thead>`;
  const outboundBody = outbound.map(r => rowHTML(r, "out")).join("") || `<tr><td colspan="7" class="text-center text-muted2 py-4">No units to check out on ${hoFmtDay()}.</td></tr>`;
  const incomingBody = incoming.map(r => rowHTML(r, "in")).join("") || `<tr><td colspan="7" class="text-center text-muted2 py-4">No units due back on ${hoFmtDay()}.</td></tr>`;

  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card mb-3">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div>
            <span class="card-title"><i class="bi bi-box-arrow-up-right"></i> Item Hand-Off & Custody</span>
            <div class="text-muted2 small">Daily check-out / check-in dispatch board</div>
          </div>
          <div class="ho-daynav d-flex align-items-center gap-1">
            <button class="btn btn-ims-outline btn-sm2" id="hoPrev" title="Previous day"><i class="bi bi-chevron-left"></i></button>
            <button class="btn btn-ims-outline btn-sm2" id="hoToday">Today</button>
            <button class="btn btn-ims-outline btn-sm2" id="hoNext" title="Next day"><i class="bi bi-chevron-right"></i></button>
          </div>
          <span class="ho-daytag"><i class="bi bi-calendar-event"></i> ${hoFmtDay()}</span>
          <button class="btn btn-ims btn-sm2" id="newRentalBtn"><i class="bi bi-plus-lg"></i> New Order</button>
        </div>
      </div>
    </div>

    <div id="hoTables" class="row g-3">
      <div class="col-xl-6">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-box-arrow-up-right"></i> Outbound — To Check Out</span>
            <span class="badge-status st-out">${outbound.length} due</span></div>
          <div class="card-body table-wrap">
            <div class="ho-scroll"><table class="table">${thead}<tbody>${outboundBody}</tbody></table></div>
          </div>
        </div>
      </div>
      <div class="col-xl-6">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-box-arrow-in-down"></i> Incoming — To Check In</span>
            <span class="badge-status st-reorder">${incoming.length} due</span></div>
          <div class="card-body table-wrap">
            <div class="ho-scroll"><table class="table">${thead}<tbody>${incomingBody}</tbody></table></div>
          </div>
        </div>
      </div>
    </div>`;

  bindHandoff();
}

function bindHandoff(){
  const nb = $("#newRentalBtn");
  if (nb) nb.addEventListener("click", openNewRentalModal);
  const prev = $("#hoPrev"), next = $("#hoNext"), today = $("#hoToday");
  if (prev) prev.addEventListener("click", () => hoMoveDay(-1));
  if (next) next.addEventListener("click", () => hoMoveDay(1));
  if (today) today.addEventListener("click", hoGoToday);

  const tables = $("#hoTables");
  if (!tables) return;
  delegate(tables, "click", "button[data-ho]", (el) => {
    if (el.dataset.ho === "out") hoCheckOut(el.dataset.asset, el.dataset.order);
    else hoCheckInModal(el.dataset.asset);
  });
  /* Open the order via the view (eye) button. */
  delegate(tables, "click", "button[data-hoopen]", el => {
    const c = getOrder(el.dataset.hoopen);
    if (c) orderDetailModal(c);
  });
  /* Clicking anywhere else on a row also opens the order. */
  delegate(tables, "click", "tr[data-hoopen]", (el, e) => {
    if (e.target.closest("button, a")) return;
    const c = getOrder(el.dataset.hoopen);
    if (c) orderDetailModal(c);
  });
}


/* ---- return: prompt a check-in flow ---- */
function hoCheckInModal(assetId){
  const info = assetOutInfo(assetId);
  if (!info) return;
  const a = info.asset || {};
  const body = `
    <div class="lab-punch-head"><div><span class="strong">${a.id}</span><div class="text-muted2">${IMS.metadata.mkName(a)}</div></div>
      <span class="badge-status st-out">On Site</span></div>
    <div class="list-line"><span class="l">Rental / order</span><span class="r strong">${info.orderId}${info.order ? " · " + info.order.projectName : ""}</span></div>
    <div class="list-line"><span class="l">Custodian</span><span class="r">${info.custodian}</span></div>
    <div class="list-line"><span class="l">Checked out</span><span class="r mono">${fmtDT(info.at)}</span></div>
    <div class="field-group mt-3"><label class="form-label">Return condition / note (optional)</label>
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
