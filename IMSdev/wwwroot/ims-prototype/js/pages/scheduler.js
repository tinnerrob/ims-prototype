/* =========================================================
   IMS — scheduler.js (split out of app.js)
   Scheduler view: contract queue, resource pool, timeline, booking/drag-drop, conflict detection.
   ========================================================= */
"use strict";

/* =========================================================
   STAGE 2 — CONTRACT MANAGEMENT & SCHEDULER
   ========================================================= */


/* ---- weekly timeline helpers ---- */
const mondayOf = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0,0,0,0); return x; };
const weekDates = ws => [0,1,2,3,4,5,6].map(i => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
const dayDates = d => [new Date(d)];
const fmtWeekday = d => d.toLocaleDateString("en-US", { weekday:"short" });
/* Current timeline anchor + day-count based on the active view (day / week / month). */
function schedAnchor(){
  if (App.schedView === "month") return App.schedMonth;
  if (App.schedView === "day"){ if (!App.schedDay) App.schedDay = new Date(App.schedWeek || new Date()); return App.schedDay; }
  return App.schedWeek;
}

function schedCols(){
  const a = schedAnchor();
  if (App.schedView === "month") return monthDates(a).length;
  if (App.schedView === "day") return 96; // quarter-hour (15-min) blocks
  return 7;
}
/* Milliseconds per scheduling block: 15 min in day view, otherwise 1 day. */
function blockMs(){ return App.schedView === "day" ? 900000 : 86400000; }

/* Position a bar within the current view (day = by time-of-day, week/month = by day). */
function tlGeom(startISO, endISO){
  if (App.schedView === "day") return dayGeom(startISO, endISO, schedAnchor());
  const cols = App.schedView === "month" ? monthDates(schedAnchor()).length : 7;
  return barGeom(startISO, endISO, schedAnchor(), cols);
}
/* Day view: show the daily start-time → end-time window across the 24-hour day.
   Bars reflect the contract's operating hours each day, not the full day. */
function dayGeom(startISO, endISO, anchor){
  const a = new Date(anchor); a.setHours(0, 0, 0, 0);
  const dayEnd = new Date(a); dayEnd.setDate(a.getDate() + 1);
  const st = parseDT(startISO), en = parseDT(endISO);
  if (en < a || st >= dayEnd) return null; // visible day outside the scheduled window
  let s = st.getHours() * 60 + st.getMinutes();
  let e = en.getHours() * 60 + en.getMinutes();
  if (e <= s) e = Math.min(1440, s + 60); // guard zero/negative spans
  s = Math.max(0, Math.min(1439, s));
  e = Math.max(s, Math.min(1440, e));
  return { left: s / 1440 * 100, width: (e - s) / 1440 * 100 };
}

/* ---- per-line-item scheduling window ---- */

function barGeom(startISO, endISO, anchor, cols){
  const s = Math.floor((parseDT(startISO) - anchor) / 86400000);
  const e = Math.floor((parseDT(endISO) - anchor) / 86400000);
  if (e < 0 || s > cols - 1) return null;
  const st = Math.max(0, s), en = Math.min(cols - 1, e);
  if (st > en) return null;
  return { left: st / cols * 100, width: (en - st + 1) / cols * 100 };
}

function shortItemLabel(li){ const r = getResource(li); if (!r) return li.refId; if (li.type === "serialized") return r.id; return r.sku || r.empId || r.partId || r.kitId || r.accId || r.id; }
/* Does another active contract already book this resource over the given window? */
function resourceOverlap(type, ref, contract){
  const st = parseDT(contract.startDate), en = parseDT(contract.endDate);
  for (const oc of IMS.contracts){
    if (oc.contractId === contract.contractId || oc.status !== "active") continue;
    const oli = (oc.lineItems || []).find(o => o.type === type && o.refId === ref);
    if (!oli) continue;
    const ost = parseDT(liStart(oli, oc)), oen = parseDT(liEnd(oli, oc));
    if (st <= oen && ost <= en) return oc;
  }
  return null;
}

function resourceConflict(li, c){
  const st = parseDT(liStart(li, c)), en = parseDT(liEnd(li, c));
  for (const oc of IMS.contracts){
    if (oc.contractId === c.contractId || oc.status !== "active") continue;
    const oli = (oc.lineItems || []).find(o => o.type === li.type && o.refId === li.refId);
    if (!oli) continue;
    const ost = parseDT(liStart(oli, oc)), oen = parseDT(liEnd(oli, oc));
    if (st <= oen && ost <= en){
      // Quantity resources may be split across contracts; only unique resources (serialized/labor) hard-conflict.
      if (isQuantityType(li.type)) return { conflict: false, booked: true, contractId: oc.contractId, start: ost, end: oen };
      return { conflict: true, contractId: oc.contractId, start: ost, end: oen };
    }
  }
  return { conflict: false };
}

function renderScheduler(){
  if (!App.schedWeek) {
    const starts = IMS.contracts.filter(c => c.status === "active").map(c => parseDT(c.startDate)).sort((a, b) => a - b);
    const first = starts[0] || new Date();
    App.schedWeek = mondayOf(first);
    App.schedMonth = new Date(first.getFullYear(), first.getMonth(), 1);
    App.schedDay = first ? new Date(first) : new Date();
  }
  const contracts = IMS.contracts.filter(c => c.status === "active");
  const sel = getContract(App.contractId);
  if (!sel || sel.status !== "active") App.contractId = contracts[0] ? contracts[0].contractId : null;

  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="scheduler-3col">
      <aside class="sched-side">
        <div class="sched-queue" id="schedQueue"></div>
      </aside>
      <div class="sched-timeline">
        <div id="dndError"></div>
        <div class="tl-nav">
          <button class="btn btn-ims-outline btn-sm2" id="wkPrev"><i class="bi bi-chevron-left"></i></button>
          <span class="strong" id="wkLabel"></span>
          <button class="btn btn-ims-outline btn-sm2" id="wkNext"><i class="bi bi-chevron-right"></i></button>
          <div class="btn-group ms-auto" id="viewToggle">
            <button class="btn btn-sm2 ${App.schedView === "day" ? "btn-ims" : "btn-ims-outline"}" data-view="day">Day</button>
            <button class="btn btn-sm2 ${App.schedView === "week" ? "btn-ims" : "btn-ims-outline"}" data-view="week">Week</button>
            <button class="btn btn-sm2 ${App.schedView === "month" ? "btn-ims" : "btn-ims-outline"}" data-view="month">Month</button>
          </div>
        </div>
        <div class="tl-week" id="tlWeek"></div>
      </div>
      <aside class="sched-inspector" id="schedInspector"></aside>
    </div>`;

  delegate($("#content"), "click", "#viewToggle [data-view]", b => { App.schedView = b.dataset.view; renderScheduler(); });
  $("#wkPrev").addEventListener("click", () => {
    const a = schedAnchor();
    if (App.schedView === "month") App.schedMonth = new Date(a.getFullYear(), a.getMonth() - 1, 1);
    else if (App.schedView === "day") a.setDate(a.getDate() - 1);
    else a.setDate(a.getDate() - 7);
    renderScheduler();
  });
  $("#wkNext").addEventListener("click", () => {
    const a = schedAnchor();
    if (App.schedView === "month") App.schedMonth = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    else if (App.schedView === "day") a.setDate(a.getDate() + 1);
    else a.setDate(a.getDate() + 7);
    renderScheduler();
  });

  renderSchedQueue();
  renderTimeline();
  renderInspector(getContract(App.contractId));
  bindDnD();
}

function resCard(type, ref, label, sub, unavailable){
  return `<div class="res-card ${unavailable ? "inactive" : ""}" draggable="true" data-resource-id="${ref}" data-resource-type="${type}" title="${unavailable ? "Unavailable" : "Drag to a contract block"}">
    <div class="res-card-head"><span class="type-chip tc-${type}">${TYPE_LABEL[type] || type}</span>${unavailable ? `<span class="badge-status st-out"><i class="bi bi-ban"></i>Unavailable</span>` : ""}</div>
    <div class="strong" style="font-size:12px">${label}</div>
    <div class="text-muted2" style="font-size:10.5px">${sub}</div>
  </div>`;
}

/* Navigate the scheduler to a contract's start period (day/week/month) and expand it. */
function focusContract(id){
  const c = getContract(id);
  if (!c) return;
  App.contractId = id;
  const st = parseDT(c.startDate);
  if (App.schedView === "month") App.schedMonth = new Date(st.getFullYear(), st.getMonth(), 1);
  else if (App.schedView === "week") App.schedWeek = mondayOf(st);
  else App.schedDay = new Date(st.getFullYear(), st.getMonth(), st.getDate());
  if (!App.schedExpanded) App.schedExpanded = new Set();
  App.schedExpanded.add(id);
  renderScheduler();
}

function renderSchedQueue(){
  const box = $("#schedQueue");
  const contracts = IMS.contracts.filter(c => c.status === "active");
  const cList = contracts.map(c => `<div class="queue-contract ${c.contractId === App.contractId ? "active" : ""}" data-qcid="${c.contractId}">
    <div class="qc-head"><i class="bi bi-briefcase"></i><span class="strong" style="font-size:12px">${c.contractId}</span></div>
    <div class="text-muted2" style="font-size:11px">${c.customer}</div>
    <div class="text-muted2" style="font-size:10.5px">${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}</div>
  </div>`).join("") || `<p class="text-muted2 py-2">No active contracts.</p>`;
  const poolTabs = [{ key:"serialized", label:"Serialized Equipment" }, { key:"bulk", label:"Bulk Resources" }, { key:"consumable", label:"Consumables" }, { key:"parts", label:"Stock Inventory" }, { key:"labor", label:"Labor / Employees" }, { key:"kits", label:"Kits" }, { key:"attachments", label:"Attachments" }];
  box.innerHTML = `
    <div class="card mb-3">
      <div class="card-header"><span class="card-title"><i class="bi bi-briefcase"></i> Active Contracts</span>
        <span class="badge-status st-onrent">${contracts.length} active</span></div>
      <div class="card-body queue-scroll">${cList}</div>
      <div class="card-body" style="padding-top:8px"><button class="btn btn-ims btn-sm2 w-100" id="addContractBtn" type="button"><i class="bi bi-plus-lg"></i> New Contract</button></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-box-seam"></i> Resource Pool</span>
        <span class="text-muted2" style="font-size:11px">drag to a block</span></div>
      <div class="card-body">
        <select class="form-select mb-2" id="poolFilter">${poolTabs.map(t => `<option value="${t.key}" ${App.schedPoolTab === t.key ? "selected" : ""}>${t.label}</option>`).join("")}</select>
        <div class="queue-scroll" id="poolList"></div>
        <button class="btn btn-ims btn-sm2 w-100 mt-2" id="addPoolResBtn" type="button"><i class="bi bi-plus-lg"></i> ${poolAddLabel()}</button>
      </div>
    </div>`;
  const pf = $("#poolFilter");
  if (pf) pf.addEventListener("change", e => {
    App.schedPoolTab = e.target.value;
    renderPoolList();
    const b = $("#addPoolResBtn");
    if (b) b.innerHTML = `<i class="bi bi-plus-lg"></i> ${poolAddLabel()}`;
  });
  delegate($("#schedQueue"), "click", "[data-qcid]", b => focusContract(b.dataset.qcid));
  $("#addContractBtn").addEventListener("click", () => contractModal());
  $("#addPoolResBtn").addEventListener("click", addPoolResource);
  renderPoolList();
}

function poolAddLabel(){
  switch (App.schedPoolTab) {
    case "serialized": return "New Equipment";
    case "bulk": return "New Bulk Resource";
    case "consumable": return "New Consumable";
    case "labor": return "New Labor Item";
    case "parts": return "New Part";
    case "kits": return "New Kit";
    case "attachments": return "New Attachment";
    default: return "New Resource";
  }
}

function addPoolResource(){
  const t = App.schedPoolTab;
  if (t === "kits") kitModal(null);
  else if (t === "attachments") attachmentModal(null);
  else openAddModal(t);
}

function renderPoolList(){
  const box = $("#poolList");
  const t = App.schedPoolTab;
  let html = "";
  if (t === "serialized") html = IMS.serializedAssets.filter(a => recActive(a)).map(a => resCard("serialized", a.id, `${a.id} · ${a.make} ${a.model}`, `${a.status} · ${fmtMoney(a.baseDaily)}/d`, a.status === "In Shop" || a.status === "On Rent")).join("");
  else if (t === "bulk") html = IMS.bulkResources.filter(b => recActive(b)).map(b => resCard("bulk", b.sku, `${b.sku} · ${b.name}`, `${fmtInt(b.qtyAvailable)} avail · ${fmtInt(globalBookedQty("bulk", b.sku))} booked · ${fmtMoney(b.baseDaily)}/u`)).join("");
  else if (t === "consumable") html = IMS.consumables.filter(c => recActive(c)).map(c => resCard("consumable", c.sku, `${c.sku} · ${c.name}`, `${fmtInt(c.qtyOnHand)} on hand · ${fmtInt(globalBookedQty("consumable", c.sku))} booked · ${fmtMoney(c.retailPrice)}`)).join("");
  else if (t === "labor") html = IMS.labor.filter(e => recActive(e)).map(e => resCard("labor", e.empId, `${e.empId} · ${e.name}`, `${e.role} · ${fmtMoney(e.hourlyBillable)}/hr`)).join("");
  else if (t === "parts") html = IMS.parts.filter(p => recActive(p)).map(p => resCard("part", p.partId, `${p.partId} · ${p.description}`, `${p.bin} · ${fmtInt(p.qtyOnHand)} on hand · ${fmtInt(globalBookedQty("part", p.partId))} booked · ${fmtMoney(p.costPrice)}`)).join("");
  else if (t === "kits") html = IMS.kits.filter(k => recActive(k)).map(k => resCard("kit", k.kitId, `${k.kitId} · ${k.name}`, `${fmtInt(k.qtyOwned || 1)} owned · ${fmtInt(globalBookedQty("kit", k.kitId))} booked · ${fmtMoney(k.baseRate)}/d`)).join("");
  else if (t === "attachments") html = IMS.attachments.filter(a => recActive(a)).map(a => resCard("attachment", a.accId, `${a.accId} · ${a.name}`, `${a.category} · ${fmtInt(a.qtyOwned || 1)} owned · ${fmtInt(globalBookedQty("attachment", a.accId))} booked · ${fmtMoney(a.daily)}/d`)).join("");
  box.innerHTML = html || `<p class="text-muted2 py-2">No resources in this pool.</p>`;
}

function monthDates(m){
  const y = m.getFullYear(), mo = m.getMonth();
  const n = new Date(y, mo + 1, 0).getDate();
  return [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31].slice(0, n).map(d => new Date(y, mo, d));
}

function renderTimeline(){
  const week = $("#tlWeek");
  const isMonth = App.schedView === "month";
  const isDay = App.schedView === "day";
  const anchor = schedAnchor();
  const days = isMonth ? monthDates(anchor) : (isDay ? dayDates(anchor) : weekDates(anchor));
  const contracts = IMS.contracts.filter(c => c.status === "active");
  const conflictKeys = new Set(collectConflicts().map(f => f.type + "|" + f.refId));
  let gridCols, minWidth, head;
  if (isDay){
    gridCols = 24; // hour gridlines
    minWidth = 120; // fit the 24-hour day on one page (no horizontal scroll)
    head = `<div class="tl-head" style="grid-template-columns:120px 1fr"><div class="tl-corner">Day</div>` +
      `<div class="tl-day-head tl-day-hours" style="display:grid;grid-template-columns:repeat(24,1fr)">` +
      [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23].map(h => `<div>${pad2(h)}:00</div>`).join("") +
      `</div></div>`;
  } else {
    const cols = days.length;
    gridCols = cols;
    minWidth = 120 + cols * 90;
    const corner = isMonth ? "Month" : "Week";
    head = `<div class="tl-head" style="grid-template-columns:120px repeat(${cols},minmax(90px,1fr))"><div class="tl-corner">${corner}</div>` +
      days.map(d => `<div class="tl-day-head">${isMonth ? d.getDate() : fmtWeekday(d)}<div class="text-muted2" style="font-size:10px">${isMonth ? fmtWeekday(d) : d.getMonth() + 1 + "/" + d.getDate()}</div></div>`).join("") + `</div>`;
  }
  let lanes = "";
  contracts.forEach(c => {
    const items = c.lineItems || [];
    const expanded = App.schedExpanded && App.schedExpanded.has(c.contractId);
    const g = tlGeom(c.startDate, c.endDate);
    if (!g) return;
    const t = contractTotals(c);
    const cTitle = `${c.contractId}<br>${c.projectName}<br>${fmtDate(c.startDate)}<br>${fmtTime(c.startDate)} →<br>${fmtDate(c.endDate)}<br>${fmtTime(c.endDate)}`;
    let rows = `<div class="tl-row tl-row-contract ${c.contractId === App.contractId ? "selected" : ""}" data-contract-id="${c.contractId}">
      <div class="tl-row-label">${c.contractId}<div class="text-muted2" style="font-size:10px">${c.customer}</div></div>
      <div class="tl-row-track" style="--cols:${gridCols}">
        <div class="tl-block ${c.contractId === App.contractId ? "selected" : ""}" data-contract-id="${c.contractId}" style="left:${g.left}%;width:${g.width}%" title="${cTitle}">
          <span class="tl-block-chev" data-expand="${c.contractId}"><i class="bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"}"></i></span>
          <span class="tl-block-title">${c.projectName}</span>
          <span class="tl-block-sub">${fmtMoney(t.gross)} · ${items.length} items · ${t.days}d</span>
          <span class="tl-h tl-h-l" data-resize="${c.contractId}"></span>
          <span class="tl-h tl-h-r" data-resize="${c.contractId}"></span>
        </div>
      </div>
    </div>`;
    if (expanded) {
      if (!items.length) {
        rows += `<div class="tl-row"><div class="tl-row-label">&nbsp;</div><div class="tl-row-track"><div class="tl-empty-wrap">Drag resources onto the contract block.</div></div></div>`;
      } else {
        items.forEach(li => {
          const lg = tlGeom(liStart(li, c), liEnd(li, c));
          if (!lg) return;
          const cf = resourceConflict(li, c);
          const inConflict = conflictKeys.has(li.type + "|" + li.refId);
          const status = inConflict ? (cf.conflict ? ("Booked " + cf.contractId) : "Overbooked") : (cf.booked ? ("Shared " + cf.contractId) : "Available");
          const sub = `${liDays(li, c)}d · ${status}`;
          const liTitle = `${itemLabel(li)}<br>${TYPE_LABEL[li.type] || li.type}<br>${fmtDate(liStart(li, c))}<br>${fmtTime(liStart(li, c))} →<br>${fmtDate(liEnd(li, c))}<br>${fmtTime(liEnd(li, c))}`;
          rows += `<div class="tl-row ${inConflict ? "conflict" : ""}">
            <div class="tl-row-label res">${TYPE_LABEL[li.type] || li.type}<div class="text-muted2" style="font-size:10px">${shortItemLabel(li)}</div></div>
            <div class="tl-row-track" style="--cols:${gridCols}">
              <div class="tl-block tl-res tl-res-${li.type} ${inConflict ? "conflict" : ""}" data-contract-id="${c.contractId}" data-li-id="${li.id}" style="left:${lg.left}%;width:${lg.width}%" title="${liTitle}">
                <span class="tl-block-title">${itemName(li)}</span>
                <span class="tl-block-sub">${sub}</span>
                <span class="tl-h tl-h-l" data-resize="${c.contractId}" data-li="${li.id}"></span>
                <span class="tl-h tl-h-r" data-resize="${c.contractId}" data-li="${li.id}"></span>
              </div>
            </div>
          </div>`;
        });
      }
    }
    lanes += `<div class="tl-lane ${expanded ? "expanded" : ""}">${rows}</div>`;
  });
  $("#wkLabel").textContent = isMonth ? anchor.toLocaleDateString("en-US", { month:"long", year:"numeric" })
    : isDay ? anchor.toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" })
    : "Week of " + anchor.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  week.innerHTML = `<div class="tl-inner" style="min-width:${minWidth}px">${head}<div class="tl-body">${lanes || `<p class="text-muted2 py-3 text-center">No active contracts this period.</p>`}</div></div>`;
  $$(".tl-block:not(.tl-res)").forEach(b => {
    let singleTimer;
    b.addEventListener("click", () => {
      if (window.__suppressClick) { window.__suppressClick = false; return; }
      App.contractId = b.dataset.contractId;
      clearTimeout(singleTimer);
      singleTimer = setTimeout(() => {
        if (!App.schedExpanded) App.schedExpanded = new Set();
        const id = b.dataset.contractId;
        if (App.schedExpanded.has(id)) App.schedExpanded.delete(id); else App.schedExpanded.add(id);
        renderSchedQueue(); renderTimeline(); renderInspector(getContract(id));
      }, 250);
    });
    b.addEventListener("dblclick", () => {
      clearTimeout(singleTimer);
      const c = getContract(b.dataset.contractId);
      if (c) contractEditModal(c);
    });
    const chev = b.querySelector("[data-expand]");
    if (chev) chev.addEventListener("click", ev => {
      ev.stopPropagation();
      clearTimeout(singleTimer);
      const id = b.dataset.contractId;
      App.contractId = id;
      if (!App.schedExpanded) App.schedExpanded = new Set();
      if (App.schedExpanded.has(id)) App.schedExpanded.delete(id); else App.schedExpanded.add(id);
      renderSchedQueue(); renderTimeline(); renderInspector(getContract(id));
    });
  });
  $$("[data-resize]").forEach(h => attachResizeDrag(h));
  $$(".tl-res").forEach(bar => {
    let singleTimer;
    bar.addEventListener("mousedown", e => {
      if (e.target.closest(".tl-h")) return;
      e.preventDefault();
      startSchedDrag(bar, bar.dataset.contractId, bar.dataset.liId, "move", e.clientX);
    });
    bar.addEventListener("click", () => {
      if (window.__suppressClick) { window.__suppressClick = false; return; }
      App.contractId = bar.dataset.contractId;
      clearTimeout(singleTimer);
      singleTimer = setTimeout(() => {
        renderSchedQueue(); renderInspector(getContract(bar.dataset.contractId));
      }, 250);
    });
    bar.addEventListener("dblclick", () => {
      clearTimeout(singleTimer);
      App.contractId = bar.dataset.contractId;
      scheduleTimeModal(bar.dataset.contractId, bar.dataset.liId);
    });
  });
  initTlTooltips();
}

function scheduleTimeModal(contractId, liId){
  const c = getContract(contractId);
  if (!c) return;
  const li = liId ? (c.lineItems || []).find(x => x.id === liId) : null;
  const name = li ? itemLabel(li) : `${c.contractId} · ${c.projectName}`;
  const startISO = li ? liStart(li, c) : c.startDate;
  const endISO = li ? liEnd(li, c) : c.endDate;
  const datePart = iso => { const d = parseDT(iso); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const timePart = iso => { const d = parseDT(iso); const p = n => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
  const body = `
    <div class="mb-2"><span class="strong">${name}</span> <span class="text-muted2" style="font-size:12px">· times snap to 15-min</span></div>
    <div class="row g-3">
      <div class="col-6">
        <label class="form-label">Start</label>
        <input type="date" class="form-control mb-1" id="tt-start-date" value="${datePart(startISO)}">
        <input type="time" class="form-control" id="tt-start-time" value="${timePart(startISO)}">
      </div>
      <div class="col-6">
        <label class="form-label">Expected Return</label>
        <input type="date" class="form-control mb-1" id="tt-stop-date" value="${datePart(endISO)}">
        <input type="time" class="form-control" id="tt-stop-time" value="${timePart(endISO)}">
      </div>
    </div>`;
  const footer = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
    <button type="button" class="btn btn-ims" id="tt-save"><i class="bi bi-check2"></i> Save Times</button>`;
  openRawModal({ id: "timeModal", title: li ? "Schedule Time — Resource" : "Schedule Time — Contract", icon: "bi-clock-history", body, footer });
  const snap15 = d => { d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0); return d; };
  $("#tt-save").addEventListener("click", () => {
    let s = snap15(parseDT($("#tt-start-date").value + "T" + $("#tt-start-time").value));
    let e = snap15(parseDT($("#tt-stop-date").value + "T" + $("#tt-stop-time").value));
    if (e < s) e = new Date(s);
    commitBarDates(c, liId, s, e);
    const m = document.querySelector("#timeModal");
    if (m){ const bm = window.bootstrap.Modal.getInstance(m); if (bm) bm.hide(); else m.remove(); }
    renderScheduler();
  });
}

function initTlTooltips(){
  if (!(window.bootstrap && bootstrap.Tooltip)) return;
  if (window.__tlTips){ window.__tlTips.forEach(t => { try { t.dispose(); } catch(_){} }); window.__tlTips = null; }
  window.__tlTips = $$("#tlWeek .tl-block[title]").map(el => new bootstrap.Tooltip(el, { trigger: "hover", container: "body", html: true }));
}


/* All resources booked on two+ active contracts with overlapping windows.
   serialized/labor = hard conflict; quantity = conflict only when overbooked (sum booked
   in the overlap exceeds capacity), otherwise it's a legitimate shared allocation. */
function collectConflicts(){
  const active = IMS.contracts.filter(c => c.status === "active");
  const groups = {};
  active.forEach(c => (c.lineItems || []).forEach(li => {
    const key = li.type + "|" + li.refId;
    (groups[key] = groups[key] || { type: li.type, refId: li.refId, bookings: [] }).bookings.push({ contract: c, li });
  }));
  const conflicts = [];
  Object.keys(groups).forEach(key => {
    const g = groups[key], b = g.bookings;
    for (let i = 0; i < b.length; i++){
      for (let j = i + 1; j < b.length; j++){
        const a = b[i], d = b[j];
        const ast = parseDT(liStart(a.li, a.contract)), aen = parseDT(liEnd(a.li, a.contract));
        const dst = parseDT(liStart(d.li, d.contract)), den = parseDT(liEnd(d.li, d.contract));
        if (!(ast <= den && dst <= aen)) continue;
        const hard = !isQuantityType(g.type);
        if (!hard){
          const r = getResource({ type: g.type, refId: g.refId });
          const cap = r ? resourceCapacity(g.type, r) : 0;
          const qsum = b.reduce((s, x) => {
            const xst = parseDT(liStart(x.li, x.contract)), xen = parseDT(liEnd(x.li, x.contract));
            return s + ((ast <= xen && xst <= aen) ? (x.li.qty || 1) : 0);
          }, 0);
          if (qsum <= cap) continue; /* legitimately split, not a conflict */
        }
        conflicts.push({
          type: g.type, refId: g.refId,
          contractA: a.contract.contractId, contractB: d.contract.contractId,
          ovStart: ast > dst ? ast : dst,
          ovEnd: aen < den ? aen : den,
          hard
        });
      }
    }
  });
  return conflicts.sort((x, y) => x.ovStart - y.ovStart);
}

/* Right-hand pane: a live scheduling-conflict list (replaces contract details). */
function renderInspector(c){
  const box = $("#schedInspector");
  if (!box) return;
  const conflicts = collectConflicts();
  const rows = conflicts.map(f => {
    const r = getResource({ type: f.type, refId: f.refId });
    const name = r ? itemLabel({ type: f.type, refId: f.refId }) : f.refId;
    const badge = f.hard ? `<span class="badge-status st-out">Hard Conflict</span>` : `<span class="badge-status st-reorder">Overbooked</span>`;
    return `<div class="conflict-item ${f.hard ? "hard" : "shared"}">
      <div class="ci-head"><span class="type-chip tc-${f.type}">${TYPE_LABEL[f.type] || f.type}</span><span class="strong">${name}</span>${badge}</div>
      <div class="ci-dates">${fmtDate(f.ovStart)} → ${fmtDate(f.ovEnd)}</div>
      <div class="ci-contracts"><span class="mono">${f.contractA}</span><i class="bi bi-arrow-right"></i><span class="mono">${f.contractB}</span></div>
    </div>`;
  }).join("");
  box.innerHTML = `
    <div class="strong mb-1 d-flex align-items-center gap-2"><i class="bi bi-exclamation-triangle me-1"></i>Scheduling Conflicts
      <span class="badge-status ${conflicts.length ? "st-out" : "st-available"}">${conflicts.length}</span></div>
    <div class="text-muted2 mb-2" style="font-size:11px">${conflicts.length ? "Red rows on the timeline mark each conflicted booking." : "All resources are uniquely scheduled."}</div>
    <div class="conflict-list">${rows || `<p class="text-muted2 py-3">No scheduling conflicts.</p>`}</div>`;
}


/* ---- quantity-aware availability & collision ---- */


/* Sum of qty already booked for (type, ref) on OTHER active contracts overlapping [startISO, endISO]. */
function bookedQtyOnWindow(type, ref, startISO, endISO, excludeId){
  let q = 0;
  const s = parseDT(startISO), e = parseDT(endISO);
  for (const oc of IMS.contracts){
    if (oc.contractId === excludeId || oc.status !== "active") continue;
    for (const li of (oc.lineItems || [])){
      if (li.type !== type || li.refId !== ref) continue;
      const ost = parseDT(liStart(li, oc)), oen = parseDT(liEnd(li, oc));
      if (s <= oen && ost <= e) q += (li.qty || 1);
    }
  }
  return q;
}

/* Total qty booked for (type, ref) across all active contracts (display only). */
function globalBookedQty(type, ref){
  return IMS.contracts.filter(c => c.status === "active").reduce((sum, c) =>
    sum + (c.lineItems || []).filter(li => li.type === type && li.refId === ref).reduce((x, li) => x + (li.qty || 1), 0), 0);
}

function availabilityFor(type, ref, contract){
  const r = getResource({ type, refId: ref });
  if (!r) return { total: 0, booked: 0, available: 0 };
  if (type === "bulk" || type === "kit" || type === "attachment"){
    const total = resourceCapacity(type, r);
    const booked = bookedQtyOnWindow(type, ref, contract.startDate, contract.endDate, contract.contractId);
    return { total, booked, available: Math.max(0, total - booked) };
  }
  if (type === "consumable" || type === "part"){
    const total = r.qtyOnHand || 0;
    return { total, booked: bookedQtyOnWindow(type, ref, contract.startDate, contract.endDate, contract.contractId), available: total };
  }
  return { total: 1, booked: 0, available: 1 };
}

function canAllocate(type, ref, contract, qty){
  qty = Math.max(1, parseInt(qty, 10) || 1);
  const r = getResource({ type, refId: ref });
  if (!r || !recActive(r)) return { ok: false, reason: "Resource inactive" };
  if ((contract.lineItems || []).some(li => li.type === type && li.refId === ref)) return { ok: false, reason: "Already allocated to this contract" };
  if (type === "serialized" && r.status === "In Shop") return { ok: false, reason: "Resource in shop — unavailable for scheduling" };
  if (type === "serialized" || type === "labor"){
    const ov = resourceOverlap(type, ref, contract);
    if (ov) return { ok: true, conflict: true, reason: `Booked on ${ov.contractId} — booking anyway (conflict)` };
    return { ok: true, reason: "" };
  }
  const av = availabilityFor(type, ref, contract);
  if (qty > av.available) return { ok: true, overbook: true, total: av.total, booked: av.booked, available: av.available, reason: `Only ${av.available} of ${av.total} available — ${av.booked} booked on another contract for this period` };
  return { ok: true, overbook: false, total: av.total, booked: av.booked, available: av.available, reason: "" };
}

function allocateResource(type, ref, contract, qty){
  qty = Math.max(1, parseInt(qty, 10) || 1);
  contract.lineItems = contract.lineItems || [];
  contract.lineItems.push({ id:"LI-" + Date.now(), type, refId:ref, qty, startDate: contract.startDate, endDate: contract.endDate, pricingMatrix:type === "labor" ? "flat" : "standard", weekendPolicy:"bill", riskPremium:"standard", flatTotal:0 });
  syncInventoryOnStage(type, ref, qty, true, contract);
}

/* Commit a quantity allocation, refresh the inspector/timeline/pool, and flash a check. */
function doAllocate(type, ref, contract, qty, dropBlock){
  allocateResource(type, ref, contract, qty);
  if (dropBlock) showDropCheck(dropBlock);
  renderInspector(contract); renderTimeline(); renderSchedQueue();
}

/* Quantity booking prompt shown when a multi-unit resource is dropped on a block. */
function bookQtyModal(type, ref, contract, dropBlock){
  const label = itemLabel({ type, refId: ref });
  const av = availabilityFor(type, ref, contract);
  const body = `
    <div class="mb-1"><span class="strong">${label}</span></div>
    <div class="text-muted2 mb-3" style="font-size:12px">${fmtInt(av.total)} owned · ${fmtInt(av.booked)} booked elsewhere · <span class="strong">${fmtInt(av.available)} available</span></div>
    <div class="field-group"><label class="form-label">Quantity to book</label>
      <input class="form-control" type="number" min="1" id="bq-qty" value="1"></div>`;
  const footer = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
    <button type="button" class="btn btn-ims" id="bq-save"><i class="bi bi-check2"></i> Book</button>`;
  const root = openRawModal({ id:"mdl-bookqty", title:"Book " + (TYPE_LABEL[type] || type), icon:"bi-box-seam", body, footer });
  root.querySelector("#bq-save").addEventListener("click", () => {
    const qty = Math.max(1, parseInt(root.querySelector("#bq-qty").value, 10) || 1);
    const chk = canAllocate(type, ref, contract, qty);
    if (!chk.ok) { showDndError(chk.reason); dismissModal(root); return; }
    dismissModal(root);
    if (chk.overbook) overbookModal(type, ref, contract, qty, chk, dropBlock);
    else doAllocate(type, ref, contract, qty, dropBlock);
  });
}

/* Overbooking accept/cancel warning shown when the requested qty exceeds availability. */
function overbookModal(type, ref, contract, qty, chk, dropBlock){
  const label = itemLabel({ type, refId: ref });
  const body = `
    <div class="d-flex align-items-center gap-2 mb-3"><i class="bi bi-exclamation-triangle-fill text-danger" style="font-size:24px"></i>
      <div>
        <div class="strong">Overbooking Warning</div>
        <div class="text-muted2" style="font-size:12px">${label} is already booked on another contract for this period.</div>
      </div></div>
    <div class="list-line"><span class="l">Total owned</span><span class="r">${fmtInt(chk.total)}</span></div>
    <div class="list-line"><span class="l">Booked elsewhere</span><span class="r">${fmtInt(chk.booked)}</span></div>
    <div class="list-line"><span class="l">Available</span><span class="r">${fmtInt(chk.available)}</span></div>
    <div class="list-line"><span class="l">You are booking</span><span class="r strong">${fmtInt(qty)}</span></div>
    <div class="text-muted2" style="font-size:12px;margin-top:10px">This exceeds the units available. Proceed anyway?</div>`;
  const footer = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
    <button type="button" class="btn btn-ims" id="ob-yes"><i class="bi bi-check2"></i> Accept Overbooking</button>`;
  const root = openRawModal({ id:"mdl-overbook", title:"Overbooking Confirmation", icon:"bi-exclamation-triangle", body, footer });
  root.querySelector("#ob-yes").addEventListener("click", () => { doAllocate(type, ref, contract, qty, dropBlock); dismissModal(root); });
}

function parseDrag(e){
  const raw = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
  if (raw) { try { return JSON.parse(raw); } catch(_) { return null; } }
  return window.__dragRes || null;
}

function showDndError(msg){ const box = $("#dndError"); if (!box) return; box.innerHTML = `<div class="dnd-error">${msg}</div>`; clearTimeout(box._t); box._t = setTimeout(() => { box.innerHTML = ""; }, 3000); }

function showDropCheck(block){
  const badge = document.createElement("span");
  badge.className = "drop-check";
  badge.innerHTML = "<i class='bi bi-check2-circle'></i>";
  block.appendChild(badge);
  setTimeout(() => { if (badge.parentNode) badge.parentNode.removeChild(badge); }, 1400);
}

function bindDnD(){
  if (window.__dndBound) return;
  window.__dndBound = true;
  document.addEventListener("dragstart", e => {
    const card = e.target.closest("[data-resource-id]");
    if (!card) return;
    e.dataTransfer.setData("text/plain", JSON.stringify({ type:card.dataset.resourceType, ref:card.dataset.resourceId }));
    window.__dragRes = { type: card.dataset.resourceType, ref: card.dataset.resourceId };
    e.dataTransfer.effectAllowed = "copyMove";
  });
  document.addEventListener("dragover", e => {
    const block = e.target.closest(".tl-block:not(.tl-res)");
    if (!block) return;
    e.preventDefault();
    const parsed = parseDrag(e);
    const chk = parsed && canAllocate(parsed.type, parsed.ref, getContract(block.dataset.contractId));
    if (chk && chk.ok) { block.classList.add("drop-ok"); block.classList.remove("drop-deny"); e.dataTransfer.dropEffect = "copy"; }
    else { block.classList.add("drop-deny"); block.classList.remove("drop-ok"); e.dataTransfer.dropEffect = "none"; showDndError(chk ? chk.reason : "Unknown resource"); }
  });
  document.addEventListener("dragleave", e => {
    const block = e.target.closest(".tl-block:not(.tl-res)");
    if (block) block.classList.remove("drop-ok", "drop-deny");
  });
  document.addEventListener("drop", e => {
    const block = e.target.closest(".tl-block:not(.tl-res)");
    if (!block) return;
    e.preventDefault();
    block.classList.remove("drop-ok", "drop-deny");
    const parsed = parseDrag(e);
    const c = getContract(block.dataset.contractId);
    if (!parsed || !c) return;
    const chk = canAllocate(parsed.type, parsed.ref, c);
    if (!chk.ok) { showDndError(chk.reason); return; }
    if (isQuantityType(parsed.type)) {
      bookQtyModal(parsed.type, parsed.ref, c, block);
    } else {
      allocateResource(parsed.type, parsed.ref, c, 1);
      showDropCheck(block);
      renderInspector(c); renderTimeline(); renderSchedQueue();
    }
  });
  document.addEventListener("dragend", e => {
    const block = e.target.closest(".tl-block:not(.tl-res)");
    if (block) block.classList.remove("drop-ok", "drop-deny");
    window.__dragRes = null;
  });
}

/* ---- timeline bar drag / resize ---- */
let schedDrag = null;
function attachResizeDrag(h){
  const edge = h.classList.contains("tl-h-l") ? "left" : "right";
  h.addEventListener("mousedown", e => {
    e.preventDefault(); e.stopPropagation();
    startSchedDrag(h.closest(".tl-block"), h.dataset.resize, h.dataset.li || null, edge, e.clientX);
  });
  h.addEventListener("click", e => e.stopPropagation());
}

function startSchedDrag(blockEl, contractId, liId, mode, clientX){
  const track = blockEl.closest(".tl-row-track");
  const c = getContract(contractId);
  if (!c || !track) return;
  const anchor = schedAnchor();
  const cols = schedCols();
  const rect = track.getBoundingClientRect();
  const isContract = !liId;
  const li = isContract ? null : c.lineItems.find(x => x.id === liId);
  const sD = isContract ? parseDT(c.startDate) : parseDT(liStart(li, c));
  const eD = isContract ? parseDT(c.endDate) : parseDT(liEnd(li, c));
  const pxPerDay = rect.width / cols;
  const pointerDay = Math.round((clientX - rect.left) / pxPerDay);
  schedDrag = { blockEl, contractId, liId, isContract, mode, sD: new Date(sD), eD: new Date(eD), rect: { left: rect.left }, pxPerDay, anchor, cols, pointerDayStart: pointerDay };
  document.addEventListener("mousemove", onSchedDragMove);
  document.addEventListener("mouseup", onSchedDragUp);
}
/* Commit a bar's date range. The contract is the envelope:
   - the contract AUTO-GROWS to contain any resource that extends past it;
   - resizing the contract only pulls resources in when it shrinks —
     growing the contract never stretches a resource (resources only grow when you
     resize them, and doing so grows the contract to match). */
function commitBarDates(c, liId, s, en){
  if (s > en) en = new Date(s);
  let sStr = toISO(s), eStr = toISO(en);
  if (!liId){
    const oldStart = parseDT(c.startDate), oldEnd = parseDT(c.endDate);
    const newStart = parseDT(sStr), newEnd = parseDT(eStr);
    c.startDate = sStr; c.endDate = eStr;
    (c.lineItems || []).forEach(li => {
      /* Freeze each resource to its own dates so it doesn't ride along with the
         contract (a resource that had no explicit dates inherits the OLD bounds). */
      if (!li.startDate) li.startDate = toISO(oldStart);
      if (!li.endDate) li.endDate = toISO(oldEnd);
      /* Only adjust if the resource is now out of range (before/after the contract). */
      const ls = parseDT(li.startDate), le = parseDT(li.endDate);
      if (ls < newStart) li.startDate = toISO(newStart);
      if (le > newEnd) li.endDate = toISO(newEnd);
    });
  } else {
    /* resource drives the contract envelope: grow the contract to fit it */
    const cs = parseDT(c.startDate), ce = parseDT(c.endDate);
    if (s < cs) c.startDate = sStr;
    if (en > ce) c.endDate = eStr;
    const li = c.lineItems.find(x => x.id === liId);
    if (li){ li.startDate = sStr; li.endDate = eStr; }
  }
  return { sStr, eStr, s, en };
}


function onSchedDragMove(e){
  if (!schedDrag) return;
  const c = getContract(schedDrag.contractId);
  if (!c) return;
  const { rect, pxPerDay, cols, anchor, pointerDayStart } = schedDrag;
  const pDay = Math.round((e.clientX - rect.left) / pxPerDay);
  const bMs = blockMs();
  const atB = block => new Date(anchor.getTime() + block * bMs);
  let s, en;
  if (App.schedView === "day"){
    /* Day view: resize/move edits the operating-hours window (time-of-day) only,
       keeping the actual calendar dates of start/end intact so multi-day bars
       don't jump to the visible day or overshoot. */
    const bMin = bMs / 60000; // 15-min block
    const targetMin = Math.max(0, Math.min(1439, pDay * bMin));
    const sD = schedDrag.sD, eD = schedDrag.eD;
    const sMin0 = sD.getHours() * 60 + sD.getMinutes();
    const eMin0 = eD.getHours() * 60 + eD.getMinutes();
    if (schedDrag.mode === "left"){
      s = new Date(sD); s.setHours(0, Math.min(targetMin, eMin0 - bMin), 0, 0);
      en = new Date(eD);
    } else if (schedDrag.mode === "right"){
      s = new Date(sD);
      en = new Date(eD); en.setHours(0, Math.max(targetMin, sMin0 + bMin), 0, 0);
    } else {
      const delta = pDay - pointerDayStart;
      s = new Date(sD.getTime() + delta * bMs);
      en = new Date(eD.getTime() + delta * bMs);
    }
  } else {
    const curStartISO = schedDrag.isContract ? c.startDate : liStart(c.lineItems.find(x => x.id === schedDrag.liId), c);
    const curEndISO   = schedDrag.isContract ? c.endDate   : liEnd(c.lineItems.find(x => x.id === schedDrag.liId), c);
    const startBlock = Math.floor((parseDT(curStartISO) - anchor) / bMs);
    const endBlock   = Math.floor((parseDT(curEndISO) - anchor) / bMs);
    if (schedDrag.mode === "left"){
      const target = Math.min(Math.max(pDay, 0), endBlock);
      s = atB(target); en = atB(endBlock);
    } else if (schedDrag.mode === "right"){
      const target = Math.max(Math.min(pDay, cols - 1), startBlock);
      s = atB(startBlock); en = atB(target);
    } else {
      const delta = pDay - pointerDayStart;
      s = new Date(schedDrag.sD.getTime() + delta * bMs);
      en = new Date(schedDrag.eD.getTime() + delta * bMs);
    }
  }
  const { sStr, eStr } = commitBarDates(c, schedDrag.liId, s, en);
  const bg = tlGeom(sStr, eStr);
  if (bg && schedDrag.blockEl){ schedDrag.blockEl.style.left = bg.left + "%"; schedDrag.blockEl.style.width = bg.width + "%"; }
  const cg = tlGeom(c.startDate, c.endDate);
  const cEl = document.querySelector(".tl-block[data-contract-id=\"" + schedDrag.contractId + "\"]:not([data-li-id])");
  if (cg && cEl){ cEl.style.left = cg.left + "%"; cEl.style.width = cg.width + "%"; }
}

function onSchedDragUp(){
  document.removeEventListener("mousemove", onSchedDragMove);
  document.removeEventListener("mouseup", onSchedDragUp);
  if (!schedDrag) return;
  const c = getContract(schedDrag.contractId);
  const changed = (() => {
    if (!c) return false;
    if (schedDrag.isContract) return parseDT(c.startDate).getTime() !== schedDrag.sD.getTime() || parseDT(c.endDate).getTime() !== schedDrag.eD.getTime();
    const li = c.lineItems.find(x => x.id === schedDrag.liId);
    if (!li) return false;
    return parseDT(liStart(li, c)).getTime() !== schedDrag.sD.getTime() || parseDT(liEnd(li, c)).getTime() !== schedDrag.eD.getTime();
  })();
  if (changed) window.__suppressClick = true;
  schedDrag = null;
  /* Only re-render when a real drag changed dates. Re-rendering on a plain click
     would destroy the bar before the browser can fire the double-click handler. */
  if (changed) {
    renderTimeline();
    renderInspector(c);
    renderSchedQueue();
  }
}

function contractModal(){ openContractModal(null); }

function contractEditModal(contract){ openContractModal(contract); }

function overheadPickOptions(ohs){
  const have = new Set(ohs.map(o => o.ohId));
  const opts = IMS.settings.overheads.filter(o => !have.has(o.ohId))
    .map(o => `<option value="${o.ohId}">${o.name} · ${o.category}</option>`).join("");
  return `<option value="">— select overhead —</option>` + (opts || `<option value="" disabled>All overheads added</option>`);
}

function cloneOh(o){
  return { id: "OH-" + Date.now() + "-" + Math.floor(Math.random() * 1e4), ohId:o.ohId, name:o.name, category:o.category,
    chargeType:o.chargeType, cost:o.cost, retail:o.retail, pct:o.pct || 0, qty:1, locked: !!o.locked };
}

function openContractModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  const ohs = (existing && existing.overheads !== undefined)
    ? existing.overheads.map(cloneOh)
    : defaultOverheads();
  const custOpts = IMS.customers.map(c => `<option value="${c.id}" ${c.id === e.customerId ? "selected" : ""}>${c.name}</option>`).join("");
  const datePart = iso => { const d = parseDT(iso); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const timePart = iso => { const d = parseDT(iso); const p = n => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
  const combineDT = (d, t) => d + "T" + t;
  const body = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="c-active" ${(e.status ? e.status === "active" : true) ? "checked" : ""}><label class="form-check-label" for="c-active"><strong>Active</strong></label></div>
      <span class="text-muted2" style="font-size:11.5px">Active contracts bill normally; inactive are closed/archived</span>
    </div>
    <div class="row g-3">
      <div class="col-md-4 field-group"><label class="form-label">Contract ID</label><input class="form-control" id="c-id" value="${e.contractId || "CT-2024-" + pad2(IMS.contracts.length + 1)}"></div>
      <div class="col-md-4 field-group"><label class="form-label">Customer</label><select class="form-select" id="c-cust">${custOpts}</select></div>
      <div class="col-md-4 field-group"><label class="form-label">Project Name</label><input class="form-control" id="c-project" value="${e.projectName || ""}"></div>
      <div class="col-md-6 field-group"><label class="form-label">Job Site Address</label><input class="form-control" id="c-site" value="${e.jobSite || ""}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Geofence Radius (m)</label><input class="form-control" id="c-geo" type="number" value="${e.geofenceRadius || 300}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Site Lat</label><input class="form-control" id="c-slat" type="number" step="0.0001" value="${e.siteLat || 33.7490}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Site Lng</label><input class="form-control" id="c-slng" type="number" step="0.0001" value="${e.siteLng || -84.3880}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Rental Start</label><input class="form-control mb-1" id="c-start-date" type="date" value="${datePart(e.startDate || "2026-09-01T07:00")}"><input class="form-control" id="c-start-time" type="time" value="${timePart(e.startDate || "2026-09-01T07:00")}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Expected Return</label><input class="form-control mb-1" id="c-end-date" type="date" value="${datePart(e.endDate || "2026-09-15T17:00")}"><input class="form-control" id="c-end-time" type="time" value="${timePart(e.endDate || "2026-09-15T17:00")}"></div>
    </div>
    <div class="divider"></div>
    <div class="strong mb-2"><i class="bi bi-layers"></i> Fixed Overhead &amp; Compliance Adjustments</div>
    <div class="row g-2 mb-2">
      <div class="col-md-6"><select class="form-select" id="oh-pick">${overheadPickOptions(ohs)}</select></div>
      <div class="col-md-3"><button class="btn btn-ims btn-sm2 w-100" type="button" id="oh-add"><i class="bi bi-plus-lg"></i> Add Overhead</button></div>
      <div class="col-md-3"><span class="text-muted2" style="font-size:11px">Locked defaults auto-injected · override cost/retail per contract</span></div>
    </div>
    <div id="oh-list"></div>
    <div class="divider"></div>
    <div class="profit-panel" id="oh-fin"></div>`;
  const footer = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
    <button type="button" class="btn btn-ims" id="c-save"><i class="bi bi-check2"></i> Save Contract</button>`;
  const root = openRawModal({ id:"mdl-contract", size:"lg", title:(isEdit ? "Edit" : "New") + " Contract / Job", icon:"bi-file-earmark-text", body, footer });
  const tmpContract = () => ({ startDate: combineDT(root.querySelector("#c-start-date").value, root.querySelector("#c-start-time").value), endDate: combineDT(root.querySelector("#c-end-date").value, root.querySelector("#c-end-time").value), lineItems: existing ? existing.lineItems || [] : [], overheads: ohs });
  renderOhList(root, ohs);
  const renderFin = () => renderOhFinance(root, tmpContract());
  root.querySelector("#oh-add").addEventListener("click", () => {
    const id = root.querySelector("#oh-pick").value;
    if (!id) return;
    const cfg = IMS.settings.overheads.find(o => o.ohId === id);
    if (cfg) { ohs.push(cloneOh({ ...cfg, locked:false })); renderOhList(root, ohs); root.querySelector("#oh-pick").innerHTML = overheadPickOptions(ohs); renderFin(); }
  });
  root.querySelector("#oh-list").addEventListener("click", e => {
    const rem = e.target.closest("[data-ohrem]");
    if (rem) { ohs.splice(parseInt(rem.dataset.ohrem, 10), 1); renderOhList(root, ohs); root.querySelector("#oh-pick").innerHTML = overheadPickOptions(ohs); renderFin(); }
  });
  root.querySelector("#oh-list").addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.ohcost) ohs[parseInt(t.dataset.ohcost, 10)].cost = parseFloat(t.value) || 0;
    else if (t.dataset.ohretail) ohs[parseInt(t.dataset.ohretail, 10)].retail = parseFloat(t.value) || 0;
    renderFin();
  });
  root.querySelector("#c-start-date").addEventListener("change", renderFin);
  root.querySelector("#c-start-time").addEventListener("change", renderFin);
  root.querySelector("#c-end-date").addEventListener("change", renderFin);
  root.querySelector("#c-end-time").addEventListener("change", renderFin);
  root.querySelector("#c-save").addEventListener("click", () => {
    const cust = getCustomer(root.querySelector("#c-cust").value);
    const active = root.querySelector("#c-active").checked;
    const obj = {
      contractId: root.querySelector("#c-id").value,
      customerId: root.querySelector("#c-cust").value,
      customer: cust ? cust.name : root.querySelector("#c-cust").value,
      projectName: root.querySelector("#c-project").value,
      jobSite: root.querySelector("#c-site").value,
      geofenceRadius: parseFloat(root.querySelector("#c-geo").value) || 0,
      siteLat: parseFloat(root.querySelector("#c-slat").value) || 0,
      siteLng: parseFloat(root.querySelector("#c-slng").value) || 0,
      startDate: combineDT(root.querySelector("#c-start-date").value, root.querySelector("#c-start-time").value),
      endDate: combineDT(root.querySelector("#c-end-date").value, root.querySelector("#c-end-time").value),
      active, status: active ? "active" : "closed",
      overheads: ohs
    };
    if (isEdit) Object.assign(existing, obj);
    else IMS.contracts.unshift(Object.assign({ lineItems: [] }, obj));
    App.contractId = obj.contractId;
    App.ccTab = "contracts";
    App.contractFilter = "active";
    showView(App.view);
    dismissModal(root);
  });
  renderFin();
}

function renderOhList(root, ohs){
  const box = root.querySelector("#oh-list");
  box.innerHTML = ohs.map((oh, i) => `<div class="overhead-row">
    <div class="oh-info">
      <span class="type-chip ${oh.category === "Compliance" ? "tc-consumable" : (oh.category === "Facility" ? "tc-bulk" : "tc-serialized")}">${oh.category}</span>
      <span class="strong">${oh.name}</span> ${oh.locked ? `<i class="bi bi-lock" title="Auto-injected default"></i>` : ""}
      <span class="text-muted2" style="font-size:11px">${oh.chargeType}${oh.chargeType === "Percent of Equipment Total" ? " · " + oh.pct + "%" : ""}</span>
    </div>
    <div class="oh-edits">
      <label>Cost <input class="form-control form-control-sm" data-ohcost="${i}" type="number" value="${oh.cost}"></label>
      <label>Retail <input class="form-control form-control-sm" data-ohretail="${i}" type="number" value="${oh.retail}"></label>
      ${oh.locked ? "" : `<button class="remove" data-ohrem="${i}" title="Remove"><i class="bi bi-x-circle"></i></button>`}
    </div>
  </div>`).join("") || `<p class="text-muted2 py-2">No overhead adjustments for this contract.</p>`;
}

function renderOhFinance(root, tmpContract){
  const t = contractTotals(tmpContract);
  root.querySelector("#oh-fin").innerHTML = `
    <div class="label"><i class="bi bi-calculator"></i> Contract Financial Preview</div>
    <table class="totals-table">
      <tr><td>Equipment Rental Gross</td><td>${fmtMoney(t.equipmentGross)}</td></tr>
      <tr><td>Overhead &amp; Service Billable</td><td>${fmtMoney(t.overheadRetail)}</td></tr>
      <tr class="grand"><td>Total Gross Revenue</td><td>${fmtMoney(t.gross)}</td></tr>
      <tr><td>− Overhead Pass-Through Cost</td><td>${fmtMoney(t.overheadCost)}</td></tr>
      <tr><td>− Labor + Consumable + Depreciation</td><td>${fmtMoney(t.laborCost + t.consumableCost + t.depreciation)}</td></tr>
      <tr class="grand"><td>Estimated Net Profit</td><td>${fmtMoney(t.net)}</td></tr>
    </table>
    <div class="label" style="margin-top:8px">Net Margin ${fmtPct(t.margin)} · ${t.days}-day contract</div>`;
}









