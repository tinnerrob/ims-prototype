/* =========================================================
   IMS — handoff.js
   Item Hand-Off & Custody / Check In-Out + Chain of Custody.
   Rented serialized equipment appears per order with
   Check-Out / Check-In. "New Order" opens a full short-term
   rental order (multiple assets, pricing + tax) for a
   walk-in party. Return prompts a check-in flow. Every
   hand-off writes an immutable chain-of-custody event.
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
  const a = getResource({ type: "serialized", refId: assetId });
  if (a){ a.status = "On Rent"; a.orderId = orderId; }
  renderHandoff();
}
function hoCheckIn(assetId, note){
  const info = assetOutInfo(assetId);
  if (!info) return;
  hoLog(assetId, info.orderId, "Check-In", info.custodian, note || "Returned to yard / available.");
  const a = getResource({ type: "serialized", refId: assetId });
  if (a){ a.status = "Available"; a.orderId = null; }
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
        <td class="text-muted2">${a.make || ""} ${a.model || ""}</td>
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
    <div class="lab-punch-head"><div><span class="strong">${a.id}</span><div class="text-muted2">${a.make || ""} ${a.model || ""}</div></div>
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


/* ---- New Order modal (full short-term order, multiple assets) ---- */

/* Compute totals/rates for a single equipment line */
function rnCompute(seg){
  const seq = seg.dataset.seq;
  const as = seg.querySelector("#rn_a_" + seq); const assetId = as ? as.value : "";
  if (!assetId) return null;
  const a = getResource({ type: "serialized", refId: assetId }) || {};
  const sEl = seg.querySelector("#rn_s_" + seq), eEl = seg.querySelector("#rn_e_" + seq);
  const start = sEl ? sEl.value : "", end = eEl ? eEl.value : "";
  const days = (start && end) ? Math.max(1, daysBetween(start, end)) : 0;
  const fEl = seg.querySelector("#rn_f_" + seq); const freq = fEl ? fEl.value : "day";
  const g = i => { const el = seg.querySelector("#rn_" + i + "_" + seq); return el ? (parseFloat(el.value) || 0) : 0; };
  const rates = { hourly: g("h"), daily: g("d"), weekly: g("w") };
  const minH = (IMS.settings.pricing && IMS.settings.pricing.dailyMinHours) || 8;
  const key = freq === "hour" ? "hourly" : freq === "week" ? "weekly" : "daily";
  const units = freq === "week" ? Math.max(1, Math.ceil(days / 7)) : (freq === "hour" ? days * minH : days);
  const uLabel = freq === "week" ? "week" : freq === "hour" ? "hour" : "day";
  const subtotal = rates[key] * units;
  const pEl = seg.querySelector("#rn_p_" + seq); const depPct = pEl ? Math.min(100, Math.max(0, parseFloat(pEl.value) || 0)) : 0;
  const rEl = seg.querySelector("#rn_x_" + seq); const refundable = rEl ? rEl.checked : true;
  return { assetId, asset: a, start, end, freq, rates, days, units, uLabel, subtotal, depPct, deposit: subtotal * depPct / 100, refundable };
}

function rnRefreshPreview(){
  const segs = Array.from(document.querySelectorAll("#rn-items .rn-item"));
  let subtotal = 0, deposits = 0;
  segs.forEach(seg => {
    const c = rnCompute(seg); const el = seg.querySelector(".rn-t");
    if (el) el.textContent = c ? fmtMoney(c.subtotal) + " · " + c.units + " " + c.uLabel + (c.units !== 1 ? "s" : "") : "";
    if (c){ subtotal += c.subtotal; deposits += c.deposit; }
  });
  const box = $("#rn-summary"); if (!box) return;
  const tax = subtotal * taxRate();
  box.innerHTML = subtotal > 0
    ? `<div class="divider"></div>
       <div class="list-line"><span class="l">${segs.filter(s => rnCompute(s)).length} equipment line(s)</span><span class="r strong">${fmtMoney(subtotal)}</span></div>
       <div class="list-line"><span class="l">Sales tax (${Math.round(taxRate() * 100)}%)</span><span class="r">${fmtMoney(tax)}</span></div>
       <div class="list-line"><span class="l">Deposits (held)</span><span class="r">${fmtMoney(deposits)}</span></div>
       <div class="list-line"><span class="l strong">Total due at pick-up</span><span class="r strong">${fmtMoney(subtotal + tax)}</span></div>`
    : `<div class="text-muted2 mt-2">Add equipment and set dates to preview pricing.</div>`;
}


/* =========================================================
   New Order / Check-Out modal — one row per piece of
   equipment, each with its own dates, custom hour/day/week
   rates, deposit and charge frequency. Added via a "+".
   ========================================================= */
let rnSeq = 0;

function taxRate(){ const g = (IMS.settings.taxSchedules || []).find(t => t.code === "GA"); return g ? g.rate : 0.08; }
function rnDefaultRate(a){
  const h = (IMS.settings.pricing && IMS.settings.pricing.dailyMinHours) || 8;
  return {
    hourly: a ? Math.round((a.baseDaily / h) * 100) / 100 : 0,
    daily:  a ? a.baseDaily : 0,
    weekly: a ? (a.baseWeekly || a.baseDaily * 7) : 0
  };
}
function rnOpts(exclude){
  const ex = exclude || {};
  return availableSerialized().filter(a => !ex[a.id]).map(a => `<option value="${a.id}">${a.id} — ${a.make} ${a.model} · ${fmtMoney(a.baseDaily)}/d</option>`).join("");
}
/* push default rates of the chosen asset into that item's hour/day/week fields */
function rnFill(seq){
  const sel = $("#rn_a_" + seq);
  const a = sel && sel.value ? getResource({ type: "serialized", refId: sel.value }) : null;
  const d = rnDefaultRate(a);
  ["h", "d", "w"].forEach(k => { const el = $("#rn_" + k + "_" + seq); if (el) el.value = d[k === "h" ? "hourly" : k === "d" ? "daily" : "weekly"]; });
  rnRefreshPreview();
}

/* Add one equipment line-item section to the modal */
function rnAddItem(){
  rnSeq++; const seq = rnSeq, today = hoTodayStr();
  // exclude assets already chosen in other lines
  const used = {};
  document.querySelectorAll("#rn-items select.rn-a").forEach(s => { if (s.value) used[s.value] = true; });
  const box = $("#rn-items");
  if (!box) return;
  const html = `
    <div class="rn-item" data-seq="${seq}">
      <div class="rn-item-head">
        <span class="strong">Equipment ${rnSeq}</span>
        <span class="rn-item-head-right">
          <span class="rn-t mono" id="rn_t_${seq}"></span>
          <button type="button" class="btn btn-ims-outline btn-sm2 rn-toggle" data-seq="${seq}" title="Collapse / expand"><i class="bi bi-chevron-up"></i></button>
          <button type="button" class="btn btn-ims-outline btn-sm2 rn-del" data-seq="${seq}" title="Remove"><i class="bi bi-x-lg"></i></button>
        </span>
      </div>
      <div class="rn-body">
      <div class="row g-2">
        <div class="col-md-12 field-group"><label class="form-label">Equipment</label>
          <select class="form-select rn-a" id="rn_a_${seq}">${rnOpts(used)}</select></div>
        <div class="col-6 field-group"><label class="form-label">Rent from</label><input class="form-control rn-date" id="rn_s_${seq}" type="date" value="${today}"></div>
        <div class="col-6 field-group"><label class="form-label">Return by</label><input class="form-control rn-date" id="rn_e_${seq}" type="date" value="${today}"></div>
      </div>
      <div class="row g-2">
        <div class="col-3 field-group"><label class="form-label">Charge</label>
          <select class="form-select rn-freq" id="rn_f_${seq}"><option value="hour">Hour</option><option value="day" selected>Day</option><option value="week">Week</option></select></div>
        <div class="col-9 field-group rn-ratebox" data-rate="hour" style="display:none"><label class="form-label">Custom Hour rate</label><input class="form-control rn-rate" id="rn_h_${seq}" type="number" step="0.01" min="0"></div>
        <div class="col-9 field-group rn-ratebox" data-rate="day"><label class="form-label">Custom Day rate</label><input class="form-control rn-rate" id="rn_d_${seq}" type="number" step="0.01" min="0"></div>
        <div class="col-9 field-group rn-ratebox" data-rate="week" style="display:none"><label class="form-label">Custom Week rate</label><input class="form-control rn-rate" id="rn_w_${seq}" type="number" step="0.01" min="0"></div>
      </div>
      <div class="row g-2">
        <div class="col-3 field-group"><label class="form-label">Deposit (%)</label><input class="form-control rn-dep" id="rn_p_${seq}" type="number" min="0" max="100" step="1" value="25"></div>
        <div class="col-9 field-group" style="padding-top:24px"><div class="form-check form-switch"><input class="form-check-input rn-ref" type="checkbox" id="rn_x_${seq}" checked><label class="form-check-label" for="rn_x_${seq}">Refundable deposit</label></div></div>
      </div>
      </div>
    </div>`;
  box.insertAdjacentHTML("beforeend", html);
  rnFill(seq); // load default rates for the first option and refresh
  rnApplyFreq(seq); // only show the rate matching the charge frequency
  const seg = box.querySelector('[data-seq="' + seq + '"]');
  seg.querySelector("#rn_a_" + seq).addEventListener("change", () => rnFill(seq));
  seg.querySelector(".rn-freq").addEventListener("change", () => { rnApplyFreq(seq); rnRefreshPreview(); });
  seg.querySelectorAll(".rn-rate, .rn-date, .rn-dep, .rn-ref").forEach(i => i.addEventListener("input", rnRefreshPreview));
  seg.querySelector(".rn-ref").addEventListener("change", rnRefreshPreview);
  const togg = seg.querySelector(".rn-toggle");
  if (togg) togg.addEventListener("click", () => {
    seg.classList.toggle("rn-collapsed");
    const ic = togg.querySelector("i");
    if (ic) ic.className = "bi " + (seg.classList.contains("rn-collapsed") ? "bi-chevron-down" : "bi-chevron-up");
  });
  seg.querySelector(".rn-del").addEventListener("click", () => { seg.remove(); rnRefreshPreview(); });
}

/* Show only the custom-rate box that matches this line's charge frequency. */
function rnApplyFreq(seq){
  const seg = document.querySelector('#rn-items .rn-item[data-seq="' + seq + '"]');
  if (!seg) return;
  const f = seg.querySelector("#rn_f_" + seq);
  if (!f) return;
  const freq = f.value;
  seg.querySelectorAll(".rn-ratebox").forEach(b => { b.style.display = b.dataset.rate === freq ? "" : "none"; });
}


/* ---- New Order / Check-Out modal ---- */
function openNewRentalModal(){
  const custOpts = IMS.parties.slice().sort((a, b) => a.name < b.name ? -1 : 1)
    .map(c => `<option value="${c.id}">${c.name}</option>`).join("") + `<option value="__new__">+ New party…</option>`;
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
    <div class="mb-2"><div id="rn-items"></div>
      <button type="button" class="btn btn-ims-outline btn-sm2" id="rn-add"><i class="bi bi-plus-lg"></i> Add equipment</button></div>
    <div id="rn-summary" class="ho-preview"></div>`;
  const root = openRawModal({
    id: "mdl-rental", size: "lg", title: "New Order / Check Out", icon: "bi-box-arrow-up-right",
    body,
    footer: `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
      <button type="button" class="btn btn-ims" id="rn-save"><i class="bi bi-check2"></i> Create Rental &amp; Check Out</button>`
  });
  const cust = $("#rn-cust");
  cust.addEventListener("change", () => {
    const isNew = cust.value === "__new__";
    $("#rn-new").style.display = isNew ? "" : "none";
    if (!isNew){ const c = getParty(cust.value); const ni = $("#rn-name"); if (c && ni) ni.value = c.name; }
  });
  $("#rn-add").addEventListener("click", rnAddItem);
  rnAddItem();               // start with one equipment line
  $("#rn-save").addEventListener("click", () => createRentalFromModal(root));
}


function createRentalFromModal(root){
  const custVal = $("#rn-cust").value;
  let custId = custVal, custName = "", custContact = "", custAddr = "", custPhone = "", custEmail = "";
  if (custVal === "__new__"){
    custName = ($("#rn-name").value || "").trim();
    if (!custName){ window.alert("Enter the party name."); return; }
    custContact = ($("#rn-contact").value || "").trim() || custName;
    custPhone = ($("#rn-phone").value || "").trim(); custEmail = ($("#rn-email").value || "").trim();
    custAddr = ($("#rn-address").value || "").trim();
    custId = nextPartyId();
    IMS.parties.push({ id: custId, name: custName, contact: custContact, phone: custPhone, email: custEmail, billingAddress: custAddr, billingCycle: "walk-in", notes: "Equipment rental" });
  } else {
    const c = getParty(custVal);
    if (c){ custName = c.name; custContact = c.contact || c.name; custAddr = c.billingAddress || ""; custPhone = c.phone || ""; custEmail = c.email || ""; }
  }
  const items = Array.from(document.querySelectorAll("#rn-items .rn-item")).map(rnCompute).filter(Boolean);
  if (!items.length){ window.alert("Add at least one piece of equipment."); return; }
  const seen = {};
  for (const it of items){ if (seen[it.assetId]){ window.alert(it.assetId + " is already on the rental — use its own line."); return; } seen[it.assetId] = true; }
  let cStart = items[0].start, cEnd = items[0].end;
  items.forEach(it => { if (it.start && (!cStart || it.start < cStart)) cStart = it.start; if (it.end && it.end > cEnd) cEnd = it.end; });
  const cid = nextOrderId();
  const lineItems = items.map(it => ({
    id: nextLiId(), type: "serialized", refId: it.assetId, qty: 1,
    pricingMatrix: "standard", weekendPolicy: "bill", riskPremium: "standard", flatTotal: 0,
    startDate: it.start + "T09:00", endDate: it.end + "T17:00",
    customRates: it.rates, freq: it.freq, depositPct: it.depPct, depositRefundable: it.refundable
  }));
  IMS.orders.push({
    orderId: cid, partyId: custId, party: custName,
    jobSite: custAddr || "Front counter pickup",
    projectName: "Equipment Rental — " + custName,
    startDate: cStart + "T09:00", endDate: cEnd + "T17:00", status: "active", counter: true,
    orderType: "loan", billing: { enabled: true },
    geofenceRadius: 300, overheads: [],
    siteLat: (IMS.yard && IMS.yard.lat) || 33.7490, siteLng: (IMS.yard && IMS.yard.lng) || -84.3880,
    lineItems
  });
  items.forEach(it => {
    const a = getResource({ type: "serialized", refId: it.assetId });
    if (a){ a.status = "On Rent"; a.orderId = cid; }
    hoLog(it.assetId, cid, "Check-Out", custContact, "Rental checked out at the front desk.");
  });
  dismissModal(root);
  renderHandoff();
}

