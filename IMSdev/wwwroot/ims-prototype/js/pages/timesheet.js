/* =========================================================
   IMS — timesheet.js
   Labor & timesheets — mirrors the scheduler's 3-pane page:
     Left (.sched-side):  Employees + Active Contracts
     Middle (.sched-timeline): Day/Week/Month calendar (employee rows
        with colored clock-segment bars). Click a bar to edit its
        clock in/out; drag bars to move / resize.
     Right (.sched-inspector): selected employee details
   A full-width "time allocation" summary sits below the 3 columns.
   ========================================================= */
"use strict";

/* =========================================================
   STAGE 5 — LABOR & TIME ALLOCATION
   ========================================================= */
const LAB = { view: "week", anchor: null, empSel: "EMP-001" };

const TS_KIND = {
  contract:  { label: "Job",        icon: "bi-briefcase",         cls: "ts-contract" },
  workorder: { label: "Work Order", icon: "bi-tools",             cls: "ts-wo" },
  shop:      { label: "Shop",       icon: "bi-wrench-adjustable", cls: "ts-shop" },
  overhead:  { label: "Overhead",   icon: "bi-diagram-3",         cls: "ts-overhead" },
  idle:      { label: "Idle",       icon: "bi-hourglass-split",   cls: "ts-idle" },
  lunch:     { label: "Lunch",      icon: "bi-cup-hot",           cls: "ts-lunch" }
};
const isLunch = t => t.targetType === "lunch";
const tsKind = t => TS_KIND[t] || { label: t, icon: "", cls: "ts-idle" };

const labEmps = () => IMS.labor.slice().sort((a, b) => (a.empId < b.empId ? -1 : 1));
const getEmp = id => IMS.labor.find(e => e.empId === id);
const getTS = id => IMS.timesheets.find(t => t.tsId === id);
const isLive = ts => ts && !ts.clockOut;

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
const segBill = ts => { if (isLunch(ts)) return 0; const e = getEmp(ts.empId); return r2(segHours(ts) * (e ? e.hourlyBillable : 0)); };
const segCost = ts => { if (isLunch(ts)) return 0; const e = getEmp(ts.empId); return r2(segHours(ts) * (e ? e.hourlyCost : 0)); };
const segLabel = ts => {
  if (ts.targetType === "contract") { const c = getContract(ts.targetId); return c ? `${c.contractId} · ${c.projectName}` : ts.targetId; }
  if (ts.targetType === "workorder") return ts.targetId;
  return tsKind(ts.targetType).label;
};
const tsShort = seg => (seg.targetType === "contract" || seg.targetType === "workorder") ? seg.targetId : tsKind(seg.targetType).label;

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
const DAY_A = 0, DAY_B = 1440, ROWH = 54;   // day view = full 24h from midnight (matches scheduler); row height px
const ROWM = Math.max(4, Math.round(ROWH * 0.1)); // vertical margin inside a row band (keeps bars centered)
const effEndMin = (ts, now) => ts.clockOut ? hmMin(ts.clockOut) : now;

/* Week/month: per employee-day, stack by time-overlap (sequential segments share a row). */
function laneDays(empId, days, nowMin){
  const colIdx = {}; days.forEach((d, i) => colIdx[dISO(d)] = i);
  const cols = days.length, cw = 100 / cols;
  const byDay = {}; labSegs(empId).forEach(t => { (byDay[t.date] = byDay[t.date] || []).push(t); });
  let laneRows = 1; const items = [];
  Object.keys(byDay).forEach(k => {
    const arr = byDay[k].slice(0, 6).sort((x, y) => hmMin(x.clockIn) - hmMin(y.clockIn));
    laneRows = Math.max(laneRows, arr.length);          // one stacked row per segment on that day
    const inset = cols > 26 ? 0.6 : 2.2; const ci = colIdx[k];
    arr.forEach((seg, slot) => {
      items.push({ seg, live: isLive(seg), left: ci * cw + inset / 2, width: cw - inset,
        top: slot * ROWH + ROWM, height: ROWH - 2 * ROWM });
    });
  });
  return { items, laneRows };
}

/* Day view: time-of-day blocks; overlaps stack. */
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
    left: (p.s - DAY_A) / span * 100, width: Math.max(1.2, (p.e - p.s) / span * 100),
    top: p.slot * ROWH + ROWM, height: ROWH - 2 * ROWM
  }));
  return { items, laneRows: Math.max(1, lanesEnd.length) };
}

function tsTip(seg){
  const e = getEmp(seg.empId);
  const end = seg.clockOut ? seg.clockOut : "now";
  const hrs = isLive(seg) ? "running" : segHours(seg) + " hr";
  return `${seg.date}  ${seg.clockIn}–${end}  ${hrs}\n${segLabel(seg)}\n${e ? e.name : seg.empId} · ${e ? e.role : ""}`;
}

/* A bar inside a scheduler-style .tl-row-track. Closed bars are draggable; in day view
   they also get left/right resize handles. */
function blockHTML(it, showTxt, isDay){
  const seg = it.seg, live = isLive(seg);
  const style = `left:${r2(it.left)}%;width:${r2(it.width)}%;top:${it.top}px;height:${it.height}px`;
  const h = c => `<span class="ts-h ${c}" data-resize="${c === "ts-h-l" ? "l" : "r"}" title="Drag to resize"></span>`;
  const handles = isDay && !live ? h("ts-h-l") + h("ts-h-r") : "";
  const inner = showTxt
    ? `<span class="ts-block-title">${tsShort(seg)}</span><span class="ts-block-sub">${live ? "running" : (seg.clockOut ? seg.clockIn + "–" + seg.clockOut : segHours(seg) + "h")}</span>`
    : "";
  return `<div class="ts-block ${tsKind(seg.targetType).cls}${live ? " ts-live" : ""}${live ? "" : " draggable"}"
      data-ts="${seg.tsId}" title="${tsTip(seg)}" style="${style}">
      ${handles}${inner}
    </div>`;
}


/* ---- LEFT pane: employees + active contracts ---- */
function labLeftHTML(){
  const active = IMS.contracts.filter(c => c.status === "active").slice().sort((a, b) => a.contractId < b.contractId ? -1 : 1);
  const chip = (t, id, label, cls) => `<button type="button" class="lab-chip ${cls}" draggable="true" data-type="${t}" data-id="${id || ""}" title="Drag onto an employee row to clock in">${label}</button>`;
  const crows = active.map(c => `<div class="queue-contract lab-poolrow ts-contract" draggable="true" data-type="contract" data-id="${c.contractId}" title="Drag onto an employee row to clock in">
      <div class="lab-prow-head"><span class="strong mono">${c.contractId}</span><span class="badge-status st-onrent">Active</span></div>
      <div class="lab-prow-name">${c.projectName}</div>
      <div class="text-muted2" style="font-size:10.5px">${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}</div></div>`).join("");
  const tasks = ["shop", "overhead", "idle"].map(t => chip(t, "", tsKind(t).label, tsKind(t).cls)).join("");
  const wos = IMS.workOrders.filter(w => w.status !== "Completed").map(w => chip("workorder", w.woId, w.woId, "ts-wo")).join("");
  return `<div class="ts-side">
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-briefcase"></i> Active Contracts</span>
        <span class="badge-status st-onrent">${active.length}</span></div>
      <div class="card-body ts-contract-list">${crows || `<p class="text-muted2">None active.</p>`}</div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-lightning-charge"></i> Quick Tasks</span></div>
      <div class="card-body ts-chips">
        <div class="ts-chip-label">Overhead / other</div>${tasks || ""}
        ${wos ? `<div class="ts-chip-label">Work orders</div>${wos}` : ""}
      </div>
    </div>
    <div class="text-muted2 ts-side-note">Drag a contract or task onto an employee's row to clock them in. Click the <i class="bi bi-stopwatch"></i> on a row to punch (includes Lunch).</div>
  </div>`;
}

/* ---- RIGHT pane: selected employee ---- */
function labInspectorHTML(){
  const emp = getEmp(LAB.empSel) || { empId: LAB.empSel, name: LAB.empSel, role: "" };
  const live = openSeg(emp.empId);
  const win = labSegs(emp.empId);
  const totH = r2(win.reduce((s, t) => s + segHours(t), 0));
  const lines = win.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 10).map(t =>
    `<div class="list-line"><span class="l"><i class="bi ${tsKind(t.targetType).icon} ${tsKind(t.targetType).cls}"></i>${fmtDate(t.date)} ${t.clockIn}${t.clockOut ? "–" + t.clockOut : ""} · ${segLabel(t)}</span><span class="r">${isLive(t) ? "running" : segHours(t) + "h"}</span></div>`).join("");
  return `<div class="lab-insp">
    <div class="d-flex align-items-center gap-2 mb-1"><span class="strong">${emp.name}</span>${live ? `<span class="badge-status st-reorder">Clocked in</span>` : `<span class="badge-status st-out">Clocked out</span>`}</div>
    <div class="text-muted2 mb-2" style="font-size:11px">${emp.empId} · ${emp.role} · ${r2(totH)} hr in ${LAB.view}</div>
    <button class="btn btn-ims btn-sm2 w-100 mb-3" id="tsInspPunch"><i class="bi bi-stopwatch"></i> ${live ? "Clock Out" : "Clock In"}</button>
    <div class="strong mb-1" style="font-size:12px">This ${LAB.view}:</div>
    ${lines || `<p class="text-muted2">No time logged.</p>`}
    <div class="lab-insp-tot"><span class="l">Total</span><span class="r strong">${totH} hr · ${fmtMoney(r2(win.reduce((s, t) => s + segBill(t), 0)))}</span></div>
  </div>`;
}

function legendHTML(){
  const L = [["ts-contract", "Job"], ["ts-wo", "WO"], ["ts-shop", "Shop"], ["ts-overhead", "Overhead"], ["ts-idle", "Idle"], ["ts-lunch", "Lunch"]];
  return `<span class="lab-legend-item"><i class="bi bi-arrow-down-left-circle"></i>Drag a chip onto a row to clock in</span>` +
    L.map(x => `<span class="lab-legend-item"><i class="bi bi-square-fill ${x[0]}"></i>${x[1]}</span>`).join("");
}


/* ---- MAIN render: scheduler 3-col ---- */
function renderTimesheet(){
  const days = labDays(), isDay = LAB.view === "day", now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes(), todayKey = dISO(now);
  const cols = days.length;

  /* header columns (120px sticky label to match .tl-row) */
  let headCols;
  const GUT = 40; // right gutter column (clock buttons), slightly shrinking the calendar
  if (isDay){
    const cells = [];
    for (let h = DAY_A / 60; h < DAY_B / 60; h++){ const hh = h % 12 === 0 ? 12 : h % 12; cells.push(`<div class="tl-day-head">${hh}${h < 12 ? "a" : "p"}</div>`); }
    headCols = `<div class="tl-head" style="grid-template-columns:120px repeat(${DAY_B / 60 - DAY_A / 60},1fr) ${GUT}px"><div class="tl-corner">Employee</div>${cells.join("")}<div class="tl-gutter"></div></div>`;
  } else {
    headCols = `<div class="tl-head" style="grid-template-columns:120px repeat(${cols},minmax(${LAB.view === "month" ? 34 : 88}px,1fr)) ${GUT}px"><div class="tl-corner">Employee</div>` +
      days.map(d => `<div class="tl-day-head ${dISO(d) === todayKey ? "today" : ""}">${LAB.view === "month" ? d.getDate() : d.toLocaleDateString("en-US", { weekday: "short" })}<div class="text-muted2" style="font-size:10px">${d.getMonth() + 1}/${d.getDate()}</div></div>`).join("") + `<div class="tl-gutter"></div></div>`;
  }
  const minW = 120 + GUT + (isDay ? (DAY_B - DAY_A) / 60 * 44 : LAB.view === "month" ? cols * 40 : cols * 92);

  const lanes = labEmps().map(emp => {
    const geo = isDay ? laneDay(emp.empId, nowMin) : laneDays(emp.empId, days, nowMin);
    const trackH = geo.laneRows * ROWH;
    const closed = labSegs(emp.empId).reduce((s, t) => s + segHours(t), 0);
    const open = openSeg(emp.empId);
    const status = open ? `<span class="lab-dot live"></span>${tsShort(open)} · since ${open.clockIn}` : `${r2(closed)} hr logged`;
    const blocks = geo.items.map(it => blockHTML(it, isDay || LAB.view === "week", isDay)).join("");
    return `<div class="tl-row lab-row${emp.empId === LAB.empSel ? " active" : ""}" data-emp="${emp.empId}">
      <div class="tl-row-label res lab-lbl">
        <div class="lab-l-name">${emp.name}${open ? `<i class="lab-live-dot" title="On ${tsShort(open)} since ${open.clockIn}"></i>` : ""}</div>
        <div class="lab-l-code">${emp.empId}</div>
        <div class="lab-l-title">${emp.role}</div>
        <div class="lab-l-hours">${r2(closed)} hr logged</div>
      </div>
      <div class="tl-row-track lab-track" style="--cols:${cols};min-height:${trackH}px">
        ${blocks || `<span class="text-muted2 lab-empty">No time</span>`}
        ${isDay ? `<div class="lab-nowline" style="left:${Math.max(0, Math.min(100, (nowMin - DAY_A) / (DAY_B - DAY_A) * 100))}%"></div>` : ""}
      </div>
      <div class="lab-row-clock"><button class="btn btn-ims-outline btn-sm2" data-clock="${emp.empId}" title="Punch ${emp.name}"><i class="bi bi-stopwatch"></i></button></div>
    </div>`;
  }).join("");

  const viewBtns = ["day", "week", "month"].map(v => `<button class="btn btn-sm2 ${LAB.view === v ? "btn-ims" : "btn-ims-outline"}" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("");
  const selEmp = getEmp(LAB.empSel) || { name: LAB.empSel };

  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="ts-page">
      <aside class="sched-side">${labLeftHTML()}</aside>
      <div class="sched-timeline">
        <div class="tl-nav">
          <button class="btn btn-ims-outline btn-sm2" id="tsPrev"><i class="bi bi-chevron-left"></i></button>
          <span class="strong" id="tsLabel">${labRangeLabel()}</span>
          <button class="btn btn-ims-outline btn-sm2" id="tsNext"><i class="bi bi-chevron-right"></i></button>
          <div class="btn-group ms-auto" id="tsViewToggle">${viewBtns}</div>
        </div>
        <div class="ts-hint"><i class="bi bi-arrow-down-left-circle"></i> Drag a contract or task onto an employee row to clock in · drag a bar to move/resize · click a bar to edit · clock icon = punch</div>
        <div class="tl-week" id="tsWeek"><div class="tl-inner" style="min-width:${minW}px">
          ${headCols}
          <div class="tl-body">${lanes}</div>
        </div></div>
      </div>
    </div>
    ${labSummaryHTML()}
    <div class="lab-legend-bottom">${legendHTML()}</div>`;

  bindTimesheet(isDay);
}

function bindTimesheet(isDay){
  $("#tsViewToggle").querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setLabView(b.dataset.view)));
  $("#tsPrev").addEventListener("click", () => labNav(-1));
  $("#tsNext").addEventListener("click", () => labNav(1));
  $$("[data-clock]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); openPunch(b.dataset.clock); }));
  $$(".lab-row").forEach(r => {
    r.addEventListener("click", e => {
      if (e.target.closest(".ts-block") || e.target.closest(".lab-row-clock") || e.target.closest("[data-clock]")) return;
      LAB.empSel = r.dataset.emp; renderTimesheet();
    });
    const hi = e => { e.preventDefault(); r.classList.add("drop-hi"); };
    r.addEventListener("dragover", hi);
    r.addEventListener("dragleave", () => r.classList.remove("drop-hi"));
    r.addEventListener("drop", e => {
      e.preventDefault(); r.classList.remove("drop-hi");
      const raw = (e.dataTransfer && e.dataTransfer.getData("text/plain")) || "";
      let o = null; try { o = JSON.parse(raw); } catch(_) {}
      if (o && o.type) clockInto(r.dataset.emp, o.type, o.id || null);
    });
  });
  $$(".sched-side [draggable]").forEach(ch => ch.addEventListener("dragstart", e => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ type: ch.dataset.type, id: ch.dataset.id || null }));
    e.dataTransfer.effectAllowed = "copy";
  }));
  if (window.bootstrap && bootstrap.Tooltip) $$(".ts-block[title]").forEach(el => { try { new bootstrap.Tooltip(el, { trigger: "hover", container: "body", html: true }); } catch(_){} });
  $$(".ts-block").forEach(b => {
    b.addEventListener("click", e => { if (labJustDrag) { labJustDrag = false; return; } segEdit(b.dataset.ts); });
    if (b.classList.contains("draggable")) b.addEventListener("mousedown", e => { if (e.target.closest(".ts-h")) return; labDragBegin(e, b.dataset.ts, "move"); });
  });
  if (isDay) $$(".ts-h").forEach(h => h.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); labDragBegin(e, h.closest(".ts-block").dataset.ts, h.dataset.resize); }));
}


/* ---- drag: move + resize (grip-delta, 15-min snap) ---- */
let labDrag = null, labJustDrag = false;

function labDragBegin(e, tsId, mode){
  const seg = getTS(tsId);
  if (!seg || isLive(seg)) return;
  const track = (e.currentTarget || {}).closest ? e.currentTarget.closest(".lab-track") : null;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const days = labDays(), isDay = LAB.view === "day";
  const colIdx = {}; days.forEach((d, i) => colIdx[dISO(d)] = i);
  labJustDrag = false;
  labDrag = {
    tsId, mode, isDay, grabX: e.clientX, rectLeft: rect.left || 0, rectW: rect.width || 1,
    origIn: hmMin(seg.clockIn), origOut: seg.clockOut ? hmMin(seg.clockOut) : hmMin(seg.clockIn),
    origCol: colIdx[seg.date] != null ? colIdx[seg.date] : 0,
    cols: days.length, lastD: 0, block: e.currentTarget.closest(".ts-block")
  };
  document.addEventListener("mousemove", labDragMove);
  document.addEventListener("mouseup", labDragUp);
}
function labDragMove(e){
  const d = labDrag, seg = d && getTS(d.tsId);
  if (!seg) return;
  if (d.isDay){
    const span = DAY_B - DAY_A;
    let ns = d.origIn, ne = d.origOut;
    if (d.mode === "l" || d.mode === "r"){
      // scheduler-style: the edge follows the cursor and snaps to the 15-min grid
      const pm = DAY_A + (e.clientX - d.rectLeft) / d.rectW * span;
      const t = Math.max(DAY_A, Math.min(DAY_B, snap15(pm)));
      if (d.mode === "l") ns = Math.max(DAY_A, Math.min(d.origOut - 15, t));
      else ne = Math.min(DAY_B, Math.max(d.origIn + 15, t));
    } else {
      const perPx = span / d.rectW;
      const dn = Math.round((e.clientX - d.grabX) / perPx / 15) * 15;
      ns = d.origIn + dn; ne = d.origOut + dn;
      if (ns < DAY_A){ const sh = DAY_A - ns; ns += sh; ne += sh; }
      if (ne > DAY_B){ const sh = ne - DAY_B; ns -= sh; ne -= sh; }
    }
    ns = Math.max(DAY_A, Math.min(DAY_B, ns)); ne = Math.max(DAY_A, Math.min(DAY_B, ne));
    if (ne <= ns) ne = Math.min(DAY_B, ns + 15);
    if (ns !== d.origIn || ne !== d.origOut) labJustDrag = true;
    seg.clockIn = minHM(snap15(ns)); seg.clockOut = minHM(snap15(ne)); seg.hours = r2((snap15(ne) - snap15(ns)) / 60);
    const left = (snap15(ns) - DAY_A) / span * 100, w = Math.max(1.2, (snap15(ne) - snap15(ns)) / span * 100);
    if (d.block){ d.block.style.left = left + "%"; d.block.style.width = w + "%"; }
  } else {
    const pxCol = d.rectW / d.cols;
    const dc = Math.round((e.clientX - d.grabX) / pxCol);
    if (dc !== d.lastD){
      d.lastD = dc; labJustDrag = true;
      const nd = parseDT(seg.date); nd.setDate(nd.getDate() + dc); seg.date = dISO(nd);
      const cw = 100 / d.cols, inset = d.cols > 26 ? 0.6 : 2.2;
      if (d.block){ d.block.style.left = ((d.origCol + dc) * cw + inset / 2) + "%"; }
    }
  }
}
function labDragUp(){
  document.removeEventListener("mousemove", labDragMove);
  document.removeEventListener("mouseup", labDragUp);
  const moved = labDrag && labJustDrag;
  labDrag = null; labJustDrag = false;
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
function nowExact(){ const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
function punchIn(empId, targetType, targetId, startMin, dateISO){
  closeOpen(empId, startMin);                       // exact keyed time, no rounding
  IMS.timesheets.push({
    tsId: nextTsId(), empId, date: dateISO || dISO(new Date()),
    clockIn: minHM(startMin), clockOut: null,
    targetType, targetId: (targetType === "contract" || targetType === "workorder") ? targetId : null,
    hours: null
  });
  LAB.empSel = empId; renderTimesheet();
}
function clockInto(empId, type, id){ punchIn(empId, type, id, nowExact(), dISO(new Date())); }
function punchOut(empId){ closeOpen(empId, nowExact()); LAB.empSel = empId; renderTimesheet(); }
function lunchOut(empId, min, dateISO){ punchIn(empId, "lunch", null, min, dateISO); }  // clock out for lunch (opens grey lunch)
function lunchIn(empId, min){ closeOpen(empId, min); renderTimesheet(); } // clock back in (closes grey lunch)

function openPunch(empId){
  const emp = getEmp(empId) || { name: empId, role: "" };
  const active = IMS.contracts.filter(c => c.status === "active");
  const wos = IMS.workOrders.filter(w => w.status !== "Completed");
  const open = openSeg(empId);
  const onLunch = open && isLunch(open);
  const nowMin = nowExact();                        // exact current time (no snap)
  const tgt = (t, id, label, cls) => `<button type="button" class="punch-tgt ${cls}" data-t="${t}" data-id="${id || ""}"><span class="strong">${label}</span></button>`;
  const lunchBtns = onLunch
    ? `<button type="button" class="btn btn-ims btn-sm2 w-100 mb-3" id="lunch-in"><i class="bi bi-cup-hot"></i> Clock In from Lunch (at the time above)</button>`
    : `<button type="button" class="btn btn-ims-outline btn-sm2 w-100 mb-3" id="lunch-out"><i class="bi bi-cup-hot"></i> Clock Out for Lunch (at the time above)</button>`;
  const body = `
    <div class="lab-punch-head"><div><span class="strong">${emp.name}</span><div class="text-muted2">${emp.role} · ${empId}</div></div>
      <span class="badge-status ${open ? (onLunch ? "st-staged" : "st-reorder") : "st-out"}">${open ? (onLunch ? "On lunch" : "Clocked in on " + segLabel(open)) : "Clocked out"}</span></div>
    <div class="text-muted2 mb-2" style="font-size:12px">${onLunch
      ? "You're on lunch. Set the time above (lunch-in), then use the lunch button or pick a target to resume."
      : (open ? `On <strong>${segLabel(open)}</strong> since ${open.clockIn}. Choosing below switches jobs (closing it at the time above).` : "Clock into a job, work order, shop, overhead or idle at the time above.")}</div>
    <div class="row g-2 mb-2">
      <div class="col-5"><label class="form-label">Work date</label>
        <input type="date" class="form-control" id="punch-date" value="${dISO(new Date())}"></div>
      <div class="col-7"><label class="form-label">${onLunch ? "Lunch-in time" : open ? "Clock-out time for current" : "Punch time"}</label>
        <input type="time" class="form-control" id="punch-time" value="${minHM(nowMin)}"></div>
    </div>
    ${lunchBtns}
    <div class="punch-label">Job</div><div class="punch-grid">${active.map(c => tgt("contract", c.contractId, `${c.contractId} · ${c.projectName}`, "ts-contract")).join("")}</div>
    <div class="punch-label">Work order</div><div class="punch-grid">${wos.length ? wos.map(w => tgt("workorder", w.woId, `${w.woId} · ${w.assetId}`, "ts-wo")).join("") : `<span class="text-muted2" style="font-size:12px">None open.</span>`}</div>
    <div class="punch-label">Other</div><div class="punch-grid">${tgt("shop", "", "Shop", "ts-shop")}${tgt("overhead", "", "Overhead", "ts-overhead")}${tgt("idle", "", "Idle", "ts-idle")}</div>`;
  const footer = `
    ${open ? `<button type="button" class="btn btn-outline-danger me-auto" id="pp-clockout"><i class="bi bi-stop-circle"></i> Clock Out</button>` : ""}
    <button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>`;
  const root = openRawModal({ id: "mdl-punch", title: "Clock In / Out", icon: "bi-stopwatch", body, footer });
  const timeOf = () => { const v = root.querySelector("#punch-time").value; return v ? hmMin(v) : nowMin; }; // exact, never rounds
  const dateOf = () => { const el = root.querySelector("#punch-date"); const v = el && el.value; return v || dISO(new Date()); };
  root.querySelectorAll(".punch-tgt").forEach(b => b.addEventListener("click", () => {
    const tm = timeOf(), dt = dateOf(); dismissModal(root); punchIn(empId, b.dataset.t, b.dataset.id || null, tm, dt);
  }));
  const lo = root.querySelector("#lunch-out");
  if (lo) lo.addEventListener("click", () => { const tm = timeOf(), dt = dateOf(); dismissModal(root); lunchOut(empId, tm, dt); });
  const li = root.querySelector("#lunch-in");
  if (li) li.addEventListener("click", () => { const tm = timeOf(); dismissModal(root); lunchIn(empId, tm); });
  const co = root.querySelector("#pp-clockout");
  if (co) co.addEventListener("click", () => { dismissModal(root); punchOut(empId); });
}


/* ---- click a bar: edit clock in/out + assignment ---- */
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
    opt("Work order", wos.map(w => ["workorder|" + w.woId, w.woId + " · " + w.assetId])) +
    opt("Other", [["shop|", "Shop"], ["overhead|", "Overhead"], ["idle|", "Idle"], ["lunch|", "Lunch"]]) + `</select>`;
  const body = `
    <div class="lab-punch-head"><div><span class="strong">${emp.name}</span><div class="text-muted2">${emp.empId} · ${emp.role} · ${ts.tsId}</div></div></div>
    ${live ? `<div class="alert-text mb-2"><i class="bi bi-stopwatch"></i> Running since ${ts.clockIn}. Set an end time below, or Clock Out now.</div>` : ""}
    <div class="field-group mb-2"><label class="form-label">Date</label><input type="date" class="form-control" id="seg-date" value="${ts.date}"></div>
    <div class="row g-2 mb-2"><div class="col-6"><label class="form-label">Clock in</label><input type="time" class="form-control" id="seg-in" value="${ts.clockIn}"></div>
      <div class="col-6"><label class="form-label">Clock out${live ? " (blank = still running)" : ""}</label><input type="time" class="form-control" id="seg-out" value="${ts.clockOut || ""}"></div></div>
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
    return { date: root.querySelector("#seg-date").value, inMin, outMin: outRaw ? hmMin(outRaw) : null, tv: root.querySelector("#seg-target").value };
  };
  root.querySelector("#seg-save").addEventListener("click", () => {
    const v = read();
    if (!v.date || (v.outMin != null && v.outMin <= v.inMin)){ window.alert("Clock out must be after clock in."); return; }
    const [tt, tid] = v.tv.split("|");
    ts.date = v.date; ts.clockIn = minHM(v.inMin);                       // manual entry: exact, never rounds
    if (v.outMin != null){ ts.clockOut = minHM(v.outMin); ts.hours = r2((v.outMin - v.inMin) / 60); }
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

/* ---- bottom time-allocation summary ---- */
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

