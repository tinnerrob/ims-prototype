/* =========================================================
   IMS — timesheet.js
   Labor & timesheets — scheduler-style calendar.
   Left: employee roster + active contracts. Main: Day/Week/Month
   calendar. Rows are employees; colored blocks are clocked segments
   (Job / Work Order / Shop / Overhead / Idle). Click a block to edit
   its clock in/out; drag blocks to move/resize.
   ========================================================= */
"use strict";

/* =========================================================
   STAGE 5 — LABOR & TIME ALLOCATION
   ========================================================= */

/* ---- local state ---- */
const LAB = { view: "week", anchor: null, empSel: "EMP-001" };

/* ---- target taxonomy ---- */
const TS_KIND = {
  contract:  { label: "Job",        icon: "bi-briefcase",         cls: "ts-contract" },
  workorder: { label: "Work Order", icon: "bi-tools",             cls: "ts-wo" },
  shop:      { label: "Shop",       icon: "bi-wrench-adjustable", cls: "ts-shop" },
  overhead:  { label: "Overhead",   icon: "bi-diagram-3",         cls: "ts-overhead" },
  idle:      { label: "Idle",       icon: "bi-hourglass-split",   cls: "ts-idle" }
};
const tsKind = t => TS_KIND[t] || { label: t, icon: "", cls: "ts-idle" };

const labEmps = () => IMS.labor.slice().sort((a, b) => (a.empId < b.empId ? -1 : 1));
const getEmp = id => IMS.labor.find(e => e.empId === id);

/* ---- time helpers ---- */
const hmMin = s => { if (s == null) return 0; const p = String(s).split(":").map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };
const minHM = m => pad2(Math.floor((((m % 1440) + 1440) % 1440) / 60)) + ":" + pad2(((m % 60) + 60) % 60);
const r2 = n => Math.round(n * 100) / 100;
const snap15 = m => { const r = Math.round(m / 15) * 15; return r < 0 ? 0 : r >= 1440 ? 1439 : r; };
const segHours = ts => {
  if (ts.hours != null) return ts.hours;
  if (ts.clockOut) return r2((hmMin(ts.clockOut) - hmMin(ts.clockIn)) / 60);
  return 0;
};
const segBill = ts => { const e = getEmp(ts.empId); return r2(segHours(ts) * (e ? e.hourlyBillable : 0)); };
const segCost = ts => { const e = getEmp(ts.empId); return r2(segHours(ts) * (e ? e.hourlyCost : 0)); };
const segLabel = ts => {
  if (ts.targetType === "contract") { const c = getContract(ts.targetId); return c ? `${c.contractId} · ${c.projectName}` : ts.targetId; }
  if (ts.targetType === "workorder") return ts.targetId;
  return tsKind(ts.targetType).label;
};
const isLive = ts => ts && !ts.clockOut;
const getTS = id => IMS.timesheets.find(t => t.tsId === id);

/* ---- calendar window ---- */
const dISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const labAddDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function labAnchor(){ if (!LAB.anchor) LAB.anchor = new Date(); return new Date(LAB.anchor); }
function labDays(){
  const a = labAnchor();
  if (LAB.view === "month"){ const n = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate(); const o = []; for (let i = 1; i <= n; i++) o.push(new Date(a.getFullYear(), a.getMonth(), i)); return o; }
  if (LAB.view === "week"){ const w = new Date(a); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); w.setHours(0, 0, 0, 0); const o = []; for (let i = 0; i < 7; i++) o.push(labAddDays(w, i)); return o; }
  const d = new Date(a); d.setHours(0, 0, 0, 0); return [d];
}
function labNav(delta){
  const a = labAnchor();
  if (LAB.view === "month") a.setMonth(a.getMonth() + delta);
  else if (LAB.view === "week") a.setDate(a.getDate() + delta * 7);
  else a.setDate(a.getDate() + delta);
  LAB.anchor = a; renderTimesheet();
}
function setLabView(v){
  LAB.view = v; const a = labAnchor();
  if (v === "month") LAB.anchor = new Date(a.getFullYear(), a.getMonth(), 1);
  else if (v === "week") LAB.anchor = labAddDays(a, -((a.getDay() + 6) % 7));
  renderTimesheet();
}
function labRangeLabel(){
  const days = labDays();
  if (LAB.view === "month") return days[0].toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (LAB.view === "week") return "Week of " + days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return days[0].toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
function labSegs(empId){
  const keys = {}; labDays().forEach(d => keys[dISO(d)] = true);
  return IMS.timesheets.filter(t => t.empId === empId && keys[t.date]);
}

/* ---- layout geometry ---- */
const DAY_A = 360, DAY_B = 1200, ROWH = 30;   // day window 06:00–20:00; track row height px
const effEndMin = (ts, now) => ts.clockOut ? hmMin(ts.clockOut) : now;

/* Week/month: stack per employee-day by time-overlap. Sequential segments share a row. */
function laneDays(empId, days, nowMin){
  const colIdx = {}; days.forEach((d, i) => colIdx[dISO(d)] = i);
  const cols = days.length, cw = 100 / cols;
  const byDay = {}; labSegs(empId).forEach(t => { (byDay[t.date] = byDay[t.date] || []).push(t); });
  let laneRows = 1; const items = [];
  Object.keys(byDay).forEach(k => {
    const arr = byDay[k].slice(0, 8).sort((x, y) => hmMin(x.clockIn) - hmMin(y.clockIn));
    const slotEnd = [];
    arr.forEach(seg => {
      let s = hmMin(seg.clockIn), e = effEndMin(seg, nowMin); if (e <= s) e = s + 30;
      let slot = slotEnd.findIndex(end => s >= end);
      if (slot < 0) { slot = slotEnd.length; slotEnd.push(e); } else slotEnd[slot] = e;
      laneRows = Math.max(laneRows, slot + 1);
      const inset = cols > 26 ? 0.6 : 2.2; const ci = colIdx[k];
      items.push({ seg, live: isLive(seg), left: ci * cw + inset / 2, width: cw - inset, top: slot * ROWH, height: ROWH - 5 });
    });
  });
  return { items, laneRows };
}

/* Day view: time-of-day blocks; overlap stacks. */
function laneDay(empId, nowMin){
  const span = DAY_B - DAY_A;
  const segs = labSegs(empId).slice().sort((a, b) => hmMin(a.clockIn) - hmMin(b.clockIn));
  const lanesEnd = [], placed = [];
  segs.forEach(seg => {
    let s = hmMin(seg.clockIn), e = effEndMin(seg, nowMin); if (e <= s) e = s + 30;
    s = Math.max(DAY_A, s); e = Math.min(DAY_B, Math.max(s, e));
    let slot = lanesEnd.findIndex(end => s >= end);
    if (slot < 0) { slot = lanesEnd.length; lanesEnd.push(e); } else lanesEnd[slot] = e;
    placed.push({ seg, s, e, slot });
  });
  const items = placed.map(p => ({
    seg: p.seg, live: isLive(p.seg),
    left: (p.s - DAY_A) / span * 100, width: Math.max(1.4, (p.e - p.s) / span * 100),
    top: p.slot * ROWH, height: ROWH - 5
  }));
  return { items, laneRows: Math.max(1, lanesEnd.length) };
}

const tsShort = seg => seg.targetType === "contract" || seg.targetType === "workorder" ? seg.targetId : tsKind(seg.targetType).label;
function tsTip(seg){
  const e = getEmp(seg.empId);
  const end = seg.clockOut ? seg.clockOut : "now";
  const hrs = isLive(seg) ? "running" : segHours(seg) + " hr";
  return `${seg.date}  ${seg.clockIn}–${end}  ${hrs}\n${segLabel(seg)}\n${e ? e.name : seg.empId} · ${e ? e.role : ""}`;
}

/* A block. Closed segments are draggable (move); in day view they also get resize handles. */
function blockHTML(it, showTxt, isDay){
  const seg = it.seg, live = isLive(seg);
  const style = `left:${r2(it.left)}%;width:${r2(it.width)}%;top:${it.top}px;height:${it.height}px`;
  const handle = (h, cls) => `<span class="ts-h ${cls}" data-resize="${h}" title="Drag to resize"></span>`;
  const dragable = !live;
  const handles = isDay && dragable ? handle("l", "ts-h-l") + handle("r", "ts-h-r") : "";
  return `<div class="ts-block ${tsKind(seg.targetType).cls}${live ? " ts-live" : ""}${dragable ? " draggable" : ""}"
      data-ts="${seg.tsId}" data-move title="${tsTip(seg)}" style="${style}">
      ${handles}${showTxt ? `<span class="ts-block-lbl">${tsShort(seg)}</span>` : ""}
    </div>`;
}


/* ---- left panel: employee roster + active contracts ---- */
function labRosterHTML(){
  const rows = labEmps().map(e => {
    const sel = e.empId === LAB.empSel ? " active" : "";
    const live = openSeg(e.empId);
    const status = live ? `<span class="lab-dot live"></span><span class="lab-live-tag">${tsShort(live)} since ${live.clockIn}</span>` : `<span class="lab-dot"></span>Clocked out`;
    return `<div class="lab-roster-row${sel}" data-emp="${e.empId}">
      <button class="btn btn-ims-outline btn-sm2 lab-punch-ico" data-clock="${e.empId}" title="Clock ${e.name} in/out"><i class="bi bi-stopwatch"></i></button>
      <div class="lab-roster-main">
        <div class="lab-name">${e.name}</div>
        <div class="text-muted2" style="font-size:10.5px">${e.empId} · ${e.role}</div>
        <div class="lab-roster-status">${status}</div>
      </div>
    </div>`;
  }).join("");
  const active = IMS.contracts.filter(c => c.status === "active");
  const crows = active.slice().sort((a, b) => a.contractId < b.contractId ? -1 : 1)
    .map(c => `<div class="lab-contract"><span class="mono strong">${c.contractId}</span> · ${c.projectName}
      <div class="text-muted2">${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}</div></div>`).join("");
  return `<div class="card mb-3">
      <div class="card-header"><span class="card-title"><i class="bi bi-people"></i> Employees</span>
        <button class="btn btn-ims btn-sm2" id="tsPunch"><i class="bi bi-stopwatch"></i> Punch</button></div>
      <div class="card-body lab-roster">${rows}</div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-briefcase"></i> Active Contracts</span>
        <span class="badge-status st-onrent">${active.length}</span></div>
      <div class="card-body lab-contracts">${crows || `<p class="text-muted2">None active.</p>`}</div>
    </div>`;
}

/* ---- main render (split across two inserts) ---- */
function renderTimesheet(){
  const days = labDays(), isDay = LAB.view === "day", now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes(), todayKey = dISO(now);

  let headCols;
  if (isDay){
    const cells = [];
    for (let h = DAY_A / 60; h < DAY_B / 60; h++){ const hh = h % 12 === 0 ? 12 : h % 12; cells.push(`<div class="tl-day-head">${hh}${h < 12 ? "a" : "p"}</div>`); }
    headCols = `<div class="tl-head" style="grid-template-columns:120px repeat(${DAY_B / 60 - DAY_A / 60},1fr)"><div class="tl-corner">Employee</div>${cells.join("")}</div>`;
  } else {
    headCols = `<div class="tl-head" style="grid-template-columns:120px repeat(${days.length},minmax(${LAB.view === "month" ? 34 : 84}px,1fr))"><div class="tl-corner">Employee</div>` +
      days.map(d => `<div class="tl-day-head ${dISO(d) === todayKey ? "today" : ""}">${LAB.view === "month" ? d.getDate() : d.toLocaleDateString("en-US", { weekday: "short" })}<div class="text-muted2" style="font-size:10px">${d.getMonth() + 1}/${d.getDate()}</div></div>`).join("") + `</div>`;
  }
  const minW = 120 + (isDay ? (DAY_B - DAY_A) / 60 * 42 : LAB.view === "month" ? days.length * 38 : 7 * 88);

  const lanes = labEmps().map(emp => {
    const geo = isDay ? laneDay(emp.empId, nowMin) : laneDays(emp.empId, days, nowMin);
    const trackH = Math.max(26, geo.laneRows * ROWH + 6);
    const closed = labSegs(emp.empId).reduce((s, t) => s + segHours(t), 0);
    const open = openSeg(emp.empId);
    const status = open ? `<span class="lab-dot live"></span><span class="ts-live-txt">On ${tsShort(open)} · since ${open.clockIn}</span>` : `<span class="lab-dot"></span>Clocked out · ${r2(closed)} hr`;
    const blocks = geo.items.map(it => blockHTML(it, isDay || LAB.view === "week", isDay)).join("");
    return `<div class="lab-lane">
      <div class="lab-label">
        <div class="lab-name">${emp.name}<button class="lab-clock btn btn-ims-outline btn-sm2" data-clock="${emp.empId}" title="Punch ${emp.name}"><i class="bi bi-stopwatch"></i></button></div>
        <div class="text-muted2" style="font-size:10.5px">${emp.empId} · ${emp.role}</div>
        <div class="lab-status">${status}</div>
      </div>
      <div class="lab-track" style="min-height:${trackH}px">
        ${blocks || `<span class="text-muted2 lab-empty">No time</span>`}
        ${isDay ? `<div class="lab-nowline" style="left:${Math.max(0, Math.min(100, (nowMin - DAY_A) / (DAY_B - DAY_A) * 100))}%"></div>` : ""}
      </div>
    </div>`;
  }).join("");


  const selEmp = getEmp(LAB.empSel) || { name: LAB.empSel };
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="lab-layout">
      <aside class="lab-panel">${labRosterHTML()}</aside>
      <main class="lab-main">
        <div class="card mb-3"><div class="card-body lab-toolbar">
          <div class="btn-group btn-group-sm" id="tsViewToggle">
            ${["day", "week", "month"].map(v => `<button class="btn ${LAB.view === v ? "btn-ims" : "btn-ims-outline"}" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}
          </div>
          <button class="btn btn-ims-outline btn-sm2 ms-2" id="tsPrev"><i class="bi bi-chevron-left"></i></button>
          <span class="strong ms-2" id="tsLabel" style="min-width:150px;display:inline-block">${labRangeLabel()}</span>
          <button class="btn btn-ims-outline btn-sm2" id="tsNext"><i class="bi bi-chevron-right"></i></button>
          <span class="text-muted2 ms-auto" style="font-size:11px">Punching for <span class="strong">${selEmp.name}</span></span>
        </div></div>
        <div class="card"><div class="card-body lab-scroll">
          <div class="tl-week"><div class="tl-inner" style="min-width:${minW}px">
            ${headCols}<div class="tl-body lab-body">${lanes}</div>
          </div></div>
        </div></div>
      </main>
    </div>
    ${labSummaryHTML()}
    <div class="lab-legend-bottom">${legendHTML()}</div>`;

  bindTimesheet(isDay);
}

function legendHTML(){
  const L = [["ts-contract", "Job"], ["ts-wo", "Work Order"], ["ts-shop", "Shop"], ["ts-overhead", "Overhead"], ["ts-idle", "Idle"]];
  return `<span class="lab-legend-item">Drag a bar to move${LAB.view === "day" ? " / resize" : ""}; click to edit</span>` +
    L.map(x => `<span class="lab-legend-item"><i class="bi bi-square-fill ${x[0]}"></i>${x[1]}</span>`).join("");
}

function bindTimesheet(isDay){
  $("#tsViewToggle").querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setLabView(b.dataset.view)));
  $("#tsPrev").addEventListener("click", () => labNav(-1));
  $("#tsNext").addEventListener("click", () => labNav(1));
  $("#tsPunch").addEventListener("click", () => openPunch(LAB.empSel));
  $$(".lab-roster-row").forEach(r => r.addEventListener("click", () => { LAB.empSel = r.dataset.emp; renderTimesheet(); }));
  $$(".lab-clock, .lab-punch-ico").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); openPunch(b.dataset.clock); }));
  /* block: move (body) / resize (handles) in day view, move in week/month, edit on click */
  $$(".ts-block").forEach(b => {
    b.addEventListener("click", e => { if (labJustDrag) { labJustDrag = false; return; } segEdit(b.dataset.ts); });
    if (b.classList.contains("draggable")) b.addEventListener("mousedown", e => { if (e.target.closest(".ts-h")) return; labDragBegin(e, b.dataset.ts, "move"); });
  });
  if (isDay){
    $$(".ts-h").forEach(h => h.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); labDragBegin(e, h.closest(".ts-block").dataset.ts, h.dataset.resize); }));
  }
}


/* ---- drag: move + resize (scheduler-style snapping) ---- */
let labDrag = null, labJustDrag = false;

function labDragBegin(e, tsId, mode){
  const seg = getTS(tsId);
  if (!seg || isLive(seg)) return;
  const block = e.currentTarget.closest ? e.currentTarget.closest(".ts-block") : null;
  const track = (block || e.currentTarget).closest(".lab-track");
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const days = labDays(), isDay = LAB.view === "day";
  const colIdx = {}; days.forEach((d, i) => colIdx[dISO(d)] = i);
  labJustDrag = false;
  labDrag = {
    tsId, mode, isDay, grabX: e.clientX, rectW: rect.width || 1,
    origIn: hmMin(seg.clockIn), origOut: seg.clockOut ? hmMin(seg.clockOut) : hmMin(seg.clockIn),
    origCol: colIdx[seg.date] != null ? colIdx[seg.date] : 0,
    cols: days.length, lastD: 0, block
  };
  document.addEventListener("mousemove", labDragMove);
  document.addEventListener("mouseup", labDragUp);
}
function labDragMove(e){
  const d = labDrag, seg = d && getTS(d.tsId);
  if (!seg) return;
  if (d.isDay){
    const span = DAY_B - DAY_A, perPx = span / d.rectW;
    const dn = Math.round((e.clientX - d.grabX) / perPx / 15) * 15;
    let ns = d.origIn, ne = d.origOut;
    if (d.mode === "l"){ ns = Math.max(DAY_A, Math.min(d.origOut - 15, d.origIn + dn)); }
    else if (d.mode === "r"){ ne = Math.min(DAY_B, Math.max(d.origIn + 15, d.origOut + dn)); }
    else {
      ns = d.origIn + dn; ne = d.origOut + dn;
      if (ns < DAY_A){ const sh = DAY_A - ns; ns += sh; ne += sh; }
      if (ne > DAY_B){ const sh = ne - DAY_B; ns -= sh; ne -= sh; }
    }
    if (ns >= ne) ne = ns + 15;
    ns = Math.max(DAY_A, Math.min(DAY_B, ns)); ne = Math.max(DAY_A, Math.min(DAY_B, ne));
    if (ne <= ns) ne = Math.min(DAY_B, ns + 15);
    if (dn) labJustDrag = true;
    seg.clockIn = minHM(snap15(ns)); seg.clockOut = minHM(snap15(ne)); seg.hours = r2((snap15(ne) - snap15(ns)) / 60);
    const left = (snap15(ns) - DAY_A) / span * 100, w = Math.max(1.4, (snap15(ne) - snap15(ns)) / span * 100);
    if (d.block){ d.block.style.left = left + "%"; d.block.style.width = w + "%"; }
  } else {
    const pxCol = d.rectW / d.cols;
    const dc = Math.round((e.clientX - d.grabX) / pxCol);
    if (dc !== d.lastD){
      d.lastD = dc; labJustDrag = true;
      const nd = parseDT(seg.date); nd.setDate(nd.getDate() + dc); seg.date = dISO(nd);
      const cw = 100 / d.cols, inset = d.cols > 26 ? 0.6 : 2.2;
      const ci = d.origCol + dc;
      if (d.block){ d.block.style.left = (ci * cw + inset / 2) + "%"; }
    }
  }
}
function labDragUp(){
  document.removeEventListener("mousemove", labDragMove);
  document.removeEventListener("mouseup", labDragUp);
  const moved = labDrag && labJustDrag;
  labDrag = null;
  labJustDrag = false;
  if (moved) renderTimesheet();
}


/* ---- clock in / out ---- */
function nextTsId(){
  let max = 0;
  IMS.timesheets.forEach(t => { const n = parseInt((t.tsId || "TS-0").split("-")[1], 10); if (n > max) max = n; });
  return "TS-" + pad2(max + 1);
}
function openSeg(empId){ return IMS.timesheets.find(t => t.empId === empId && !t.clockOut) || null; }
function closeOpen(empId, endMin){
  const o = openSeg(empId);
  if (!o) return;
  o.clockOut = minHM(endMin); o.hours = r2((endMin - hmMin(o.clockIn)) / 60);
}
function punchIn(empId, targetType, targetId, startMin){
  closeOpen(empId, startMin);
  IMS.timesheets.push({
    tsId: nextTsId(), empId, date: dISO(new Date()),
    clockIn: minHM(snap15(startMin)), clockOut: null,
    targetType, targetId: (targetType === "contract" || targetType === "workorder") ? targetId : null,
    hours: null
  });
  LAB.empSel = empId; renderTimesheet();
}
function punchOut(empId){
  const n = new Date();
  closeOpen(empId, n.getHours() * 60 + n.getMinutes());
  LAB.empSel = empId; renderTimesheet();
}

function openPunch(empId){
  const emp = getEmp(empId) || { name: empId, role: "" };
  const active = IMS.contracts.filter(c => c.status === "active");
  const wos = IMS.workOrders.filter(w => w.status !== "Completed");
  const open = openSeg(empId);
  const n = new Date();
  const nowMin = snap15(n.getHours() * 60 + n.getMinutes());
  const tgt = (t, id, label, cls) => `<button type="button" class="punch-tgt ${cls}" data-t="${t}" data-id="${id || ""}"><span class="strong">${label}</span></button>`;
  const body = `
    <div class="lab-punch-head">
      <div><span class="strong">${emp.name}</span><div class="text-muted2">${emp.role} · ${empId}</div></div>
      <span class="badge-status ${open ? "st-reorder" : "st-out"}">${open ? "Clocked in on " + segLabel(open) : "Clocked out"}</span>
    </div>
    <div class="text-muted2 mb-2" style="font-size:12px">${open
      ? `Currently on <strong>${segLabel(open)}</strong> since ${open.clockIn}. Choosing below switches jobs (closing the current one at ${minHM(nowMin)}).`
      : `Clock into a job, work order, shop, overhead or idle starting at <strong>${minHM(nowMin)}</strong> (edit the time to start earlier).`}</div>
    <div class="field-group mb-2"><label class="form-label">Start time</label>
      <input type="time" class="form-control" id="punch-time" value="${minHM(nowMin)}"></div>
    <div class="punch-label">Job (contract)</div><div class="punch-grid">${active.map(c => tgt("contract", c.contractId, `${c.contractId} · ${c.projectName}`, "ts-contract")).join("")}</div>
    <div class="punch-label">Work orders</div><div class="punch-grid">${wos.length ? wos.map(w => tgt("workorder", w.woId, `${w.woId} · ${w.assetId}`, "ts-wo")).join("") : `<span class="text-muted2" style="font-size:12px">None open.</span>`}</div>
    <div class="punch-label">Other</div><div class="punch-grid">
      ${tgt("shop", "", "Shop", "ts-shop")}${tgt("overhead", "", "Overhead", "ts-overhead")}${tgt("idle", "", "Idle", "ts-idle")}</div>`;
  const footer = `
    ${open ? `<button type="button" class="btn btn-outline-danger me-auto" id="pp-clockout"><i class="bi bi-stop-circle"></i> Clock Out</button>` : ""}
    <button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>`;
  const root = openRawModal({ id: "mdl-punch", title: "Clock In / Out", icon: "bi-stopwatch", body, footer });
  const startOf = () => { const v = root.querySelector("#punch-time").value; return v ? snap15(hmMin(v)) : nowMin; };
  root.querySelectorAll(".punch-tgt").forEach(b => b.addEventListener("click", () => {
    const sm = startOf(); dismissModal(root); punchIn(empId, b.dataset.t, b.dataset.id || null, sm);
  }));
  const co = root.querySelector("#pp-clockout");
  if (co) co.addEventListener("click", () => { dismissModal(root); punchOut(empId); });
}


/* ---- click a block: edit its clock in/out + assignment ---- */
function segEdit(tsId){
  const ts = getTS(tsId); if (!ts) return;
  const emp = getEmp(ts.empId) || { name: ts.empId };
  const live = isLive(ts);
  const active = IMS.contracts.filter(c => c.status === "active");
  const wos = IMS.workOrders.filter(w => w.status !== "Completed");
  const selVal = ts.targetType + "|" + (ts.targetId || "");
  const opt = (label, arr) => `<optgroup label="${label}">` + arr.map(o => `<option value="${o[0]}" ${selVal === o[0] ? "selected" : ""}>${o[1]}</option>`).join("") + `</optgroup>`;
  const targetSel = `<select class="form-control" id="seg-target">` +
    opt("Job", active.map(c => ["contract|" + c.contractId, c.contractId + " · " + c.projectName])) +
    opt("Work Order", wos.map(w => ["workorder|" + w.woId, w.woId + " · " + w.assetId])) +
    opt("Other", [["shop|", "Shop"], ["overhead|", "Overhead"], ["idle|", "Idle"]]) + `</select>`;
  const body = `
    <div class="lab-punch-head"><div><span class="strong">${emp.name}</span><div class="text-muted2">${emp.empId} · ${emp.role} · ${ts.tsId}</div></div></div>
    ${live ? `<div class="alert-text mb-2"><i class="bi bi-stopwatch"></i> Running since ${ts.clockIn}. Set an end below (or Clock Out now) to close it.</div>` : ""}
    <div class="row g-2 mb-2">
      <div class="col-12"><label class="form-label">Date</label><input type="date" class="form-control" id="seg-date" value="${ts.date}"></div>
    </div>
    <div class="row g-2 mb-2">
      <div class="col-6"><label class="form-label">Clock in</label><input type="time" class="form-control" id="seg-in" value="${ts.clockIn}"></div>
      <div class="col-6"><label class="form-label">Clock out${live ? " (leave blank if still running)" : ""}</label><input type="time" class="form-control" id="seg-out" value="${ts.clockOut || ""}"></div>
    </div>
    <div class="mb-2"><label class="form-label">Assigned to</label>${targetSel}</div>`;
  const footer = `
    <button type="button" class="btn btn-outline-danger me-auto" id="seg-del"><i class="bi bi-trash"></i> Delete</button>
    ${live ? `<button type="button" class="btn btn-ims" id="seg-now"><i class="bi bi-stop-circle"></i> Clock Out Now</button>` : ""}
    <button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
    <button type="button" class="btn btn-ims" id="seg-save"><i class="bi bi-check2"></i> Save</button>`;
  const root = openRawModal({ id: "mdl-seg", title: "Edit Time — " + ts.tsId, icon: "bi-pencil-square", body, footer });

  const read = () => {
    const inMin = hmMin(root.querySelector("#seg-in").value);
    const outRaw = root.querySelector("#seg-out").value;
    const outMin = outRaw ? hmMin(outRaw) : null;
    return {
      date: root.querySelector("#seg-date").value,
      inMin, outRaw, outMin,
      tv: root.querySelector("#seg-target").value
    };
  };
  root.querySelector("#seg-save").addEventListener("click", () => {
    const v = read();
    if (!v.date || v.outMin != null && v.outMin <= v.inMin){ window.alert("Clock out must be after clock in."); return; }
    const [tt, tid] = v.tv.split("|");
    ts.date = v.date; ts.clockIn = minHM(snap15(v.inMin));
    if (v.outRaw){ ts.clockOut = minHM(snap15(v.outMin)); ts.hours = r2((snap15(v.outMin) - snap15(v.inMin)) / 60); }
    else { ts.clockOut = null; ts.hours = null; }
    ts.targetType = tt; ts.targetId = (tt === "contract" || tt === "workorder") ? (tid || null) : null;
    dismissModal(root); renderTimesheet();
  });
  const now = root.querySelector("#seg-now");
  if (now) now.addEventListener("click", () => {
    const n = new Date(); ts.clockOut = minHM(n.getHours() * 60 + n.getMinutes()); ts.hours = r2((hmMin(ts.clockOut) - hmMin(ts.clockIn)) / 60);
    dismissModal(root); renderTimesheet();
  });
  root.querySelector("#seg-del").addEventListener("click", () => {
    IMS.timesheets = IMS.timesheets.filter(t => t.tsId !== tsId);
    dismissModal(root); renderTimesheet();
  });
}


/* ---- bottom time-allocation summary (kept) ---- */
function labSummaryHTML(){
  const days = labDays(); const keys = {}; days.forEach(d => keys[dISO(d)] = true);
  const segs = IMS.timesheets.filter(t => keys[t.date]);
  const totH = r2(segs.reduce((s, t) => s + segHours(t), 0));
  const totC = r2(segs.reduce((s, t) => s + segCost(t), 0));
  const totB = r2(segs.reduce((s, t) => s + segBill(t), 0));
  const byKind = {};
  segs.forEach(t => { const k = t.targetType || "?"; byKind[k] = r2((byKind[k] || 0) + segHours(t)); });
  const totalForBar = totH || 1;
  const bars = Object.keys(TS_KIND).map(k => {
    const h = byKind[k] || 0; const L = TS_KIND[k];
    return `<div class="list-line"><span class="l"><i class="bi ${L.icon} me-1 ${L.cls}"></i>${L.label}</span>
      <span class="r"><span class="mini-bar"><span class="${L.cls}" style="width:${r2(h / totalForBar * 100)}%"></span></span>${r2(h)} hr</span></div>`;
  }).join("");
  return `<div class="lab-summary">
    <div class="lab-sum-title"><i class="bi bi-bar-chart"></i> Time allocation — ${labRangeLabel()}</div>
    <div class="lab-sum-body">
      <div class="lab-sum-left">${bars || `<p class="text-muted2">No time logged.</p>`}</div>
      <div class="lab-sum-right">
        <div class="list-line"><span class="l">Total hours</span><span class="r strong">${totH} hr</span></div>
        <div class="list-line"><span class="l">Direct labor cost</span><span class="r">${fmtMoney(totC)}</span></div>
        <div class="list-line"><span class="l">Billable value</span><span class="r">${fmtMoney(totB)}</span></div>
        <div class="list-line"><span class="l">Contribution</span><span class="r text-success">${fmtMoney(r2(totB - totC))}</span></div>
      </div>
    </div>
  </div>`;
}

