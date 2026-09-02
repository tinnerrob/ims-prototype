/* =========================================================
   IMS — timesheet.js (split out of app.js)
   Labor & timesheets — scheduler-style calendar (day / week / month).
   Rows are employees; colored blocks are clocked segments attributed to a
   target: Contract (job), Work Order, Shop, Overhead, or Idle.
   ========================================================= */
"use strict";

/* =========================================================
   STAGE 5 — LABOR & TIME ALLOCATION
   ========================================================= */

/* ---- local state (persists across renders on this page) ---- */
const LAB = { view: "week", anchor: null, empSel: "EMP-001" };

/* ---- target taxonomy ---- */
const TS_KIND = {
  contract:  { label: "Job",        icon: "bi-briefcase",     cls: "ts-contract" },
  workorder: { label: "Work Order", icon: "bi-tools",         cls: "ts-wo" },
  shop:      { label: "Shop",       icon: "bi-wrench-adjustable", cls: "ts-shop" },
  overhead:  { label: "Overhead",   icon: "bi-diagram-3",     cls: "ts-overhead" },
  idle:      { label: "Idle",       icon: "bi-hourglass-split", cls: "ts-idle" }
};
const tsKind = t => TS_KIND[t] || { label: t, icon: "", cls: "ts-idle" };

/* Employee whose timesheet entries appear on a lane (in emp order). */
const labEmps = () => IMS.labor.slice().sort((a, b) => (a.empId < b.empId ? -1 : 1));
const getEmp = id => IMS.labor.find(e => e.empId === id);

/* ---- time helpers ---- */
const hmMin = s => { if (s == null) return 0; const p = String(s).split(":").map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };
const minHM = m => pad2(Math.floor(((m % 1440) + 1440) % 1440 / 60)) + ":" + pad2(((m % 60) + 60) % 60);
const r2 = n => Math.round(n * 100) / 100;
/* Segment length in hours. Open (live) segments count 0 until clocked out. */
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

/* ---- calendar window (anchor + column days) ---- */
const dISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const labAddDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function labTodayDate(){ return new Date(); } // real clock date (system "today")
function labAnchor(){
  if (!LAB.anchor) LAB.anchor = new Date();
  return new Date(LAB.anchor);
}
function labDays(){
  const a = labAnchor();
  if (LAB.view === "month"){ const n = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate(); const out = []; for (let i = 1; i <= n; i++) out.push(new Date(a.getFullYear(), a.getMonth(), i)); return out; }
  if (LAB.view === "week"){ const w = new Date(a); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); w.setHours(0, 0, 0, 0); const out = []; for (let i = 0; i < 7; i++) out.push(labAddDays(w, i)); return out; }
  const d = new Date(a); d.setHours(0, 0, 0, 0); return [d];
}
function labNav(delta){
  const a = labAnchor();
  if (LAB.view === "month") a.setMonth(a.getMonth() + delta);
  else if (LAB.view === "week") a.setDate(a.getDate() + delta * 7);
  else a.setDate(a.getDate() + delta);
  LAB.anchor = a;
  renderTimesheet();
}
function setLabView(v){
  LAB.view = v;
  const a = labAnchor();
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
/* segments of one employee that fall inside the visible window */
function labSegs(empId){
  const days = labDays();
  const keys = {};
  days.forEach(d => keys[dISO(d)] = true);
  return IMS.timesheets.filter(t => t.empId === empId && keys[t.date]);
}



/* ---- layout geometry ---- */
const DAY_A = 360, DAY_B = 1200, ROWH = 30;            // day window 06:00–20:00, row height px
const effEndMin = (ts, now) => ts.clockOut ? hmMin(ts.clockOut) : now; // live segments run to "now"
const isLive = ts => ts && !ts.clockOut;

/* Week/month: group an employee's window segments by day, stack by time-overlap.
   Sequential segments on one day share a row; only time-overlapping ones stack. */
function laneDays(empId, days, nowMin){
  const colIdx = {}; days.forEach((d, i) => colIdx[dISO(d)] = i);
  const cols = days.length, cw = 100 / cols;
  const byDay = {};
  labSegs(empId).forEach(t => { (byDay[t.date] = byDay[t.date] || []).push(t); });
  let laneRows = 1;
  const items = [];
  Object.keys(byDay).forEach(k => {
    const arr = byDay[k].slice(0, 8).sort((x, y) => hmMin(x.clockIn) - hmMin(y.clockIn));
    const slotEnd = [];
    arr.forEach(seg => {
      let s = hmMin(seg.clockIn), e = effEndMin(seg, nowMin);
      if (e <= s) e = s + 30;
      let slot = slotEnd.findIndex(end => s >= end);
      if (slot < 0) { slot = slotEnd.length; slotEnd.push(e); } else slotEnd[slot] = e;
      laneRows = Math.max(laneRows, slot + 1);
      const ci = colIdx[k];
      const inset = cols > 26 ? 0.5 : 2.2;
      items.push({
        seg, live: isLive(seg),
        left: ci * cw + inset / 2, width: cw - inset,
        top: slot * ROWH, height: ROWH - 5, slot
      });
    });
  });
  return { items, laneRows };
}


/* Day view: time-of-day blocks; overlap stacks into extra rows. */
function laneDay(empId, nowMin){
  const span = DAY_B - DAY_A;
  const segs = labSegs(empId).slice().sort((a, b) => hmMin(a.clockIn) - hmMin(b.clockIn));
  const lanesEnd = [], placed = [];
  segs.forEach(seg => {
    let s = hmMin(seg.clockIn), e = effEndMin(seg, nowMin);
    if (e <= s) e = Math.min(1440, s + 30);
    s = Math.max(DAY_A, s); e = Math.min(DAY_B, Math.max(s, e));
    let slot = lanesEnd.findIndex(end => s >= end);
    if (slot < 0) { slot = lanesEnd.length; lanesEnd.push(e); } else lanesEnd[slot] = e;
    placed.push({ seg, s, e, slot });
  });
  const laneRows = Math.max(1, lanesEnd.length);
  const items = placed.map(p => ({
    seg: p.seg, live: isLive(p.seg),
    left: (p.s - DAY_A) / span * 100, width: Math.max(1.2, (p.e - p.s) / span * 100),
    top: p.slot * ROWH, height: ROWH - 5, slot: p.slot
  }));
  return { items, laneRows };
}

function tsShort(seg){
  if (seg.targetType === "contract") return seg.targetId;
  if (seg.targetType === "workorder") return seg.targetId;
  return tsKind(seg.targetType).label;
}
function tsTip(seg){
  const e = getEmp(seg.empId);
  const end = seg.clockOut ? seg.clockOut : "now";
  const hrs = isLive(seg) ? "live" : segHours(seg) + " hr";
  return `${seg.date}  ${seg.clockIn}–${end}  ${hrs}\n${segLabel(seg)}\n${e ? e.name : seg.empId} · ${e ? e.role : ""}`;
}
function blockHTML(it, label){
  const extra = it.live ? " ts-live" : "";
  const style = `left:${r2(it.left)}%;width:${r2(it.width)}%;top:${it.top}px;height:${it.height}px`;
  return `<div class="ts-block ${tsKind(it.seg.targetType).cls}${extra}" data-ts="${it.seg.tsId}" title="${tsTip(it.seg)}" style="${style}">${label || ""}</div>`;
}


/* ---- main render ---- */
function renderTimesheet(){
  const days = labDays();
  const isDay = LAB.view === "day";
  const emps = labEmps();
  const now = labTodayDate();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayKey = dISO(now);

  /* header columns */
  let headCols;
  if (isDay){
    const hourCells = [];
    for (let h = DAY_A / 60; h < DAY_B / 60; h++){
      const hh = h % 12 === 0 ? 12 : h % 12;
      hourCells.push(`<div class="tl-day-head">${hh}${h < 12 ? "a" : "p"}<div class="text-muted2" style="font-size:9px">00</div></div>`);
    }
    headCols = `<div class="tl-head" style="grid-template-columns:150px repeat(${DAY_B / 60 - DAY_A / 60},1fr)"><div class="tl-corner">Employee</div>${hourCells.join("")}</div>`;
  } else {
    headCols = `<div class="tl-head" style="grid-template-columns:150px repeat(${days.length},minmax(${LAB.view === "month" ? 34 : 84}px,1fr))"><div class="tl-corner">Employee</div>` +
      days.map(d => `<div class="tl-day-head ${dISO(d) === todayKey ? "today" : ""}">${LAB.view === "month" ? d.getDate() : d.toLocaleDateString("en-US", { weekday: "short" })}<div class="text-muted2" style="font-size:10px">${d.getMonth() + 1}/${d.getDate()}</div></div>`).join("") + `</div>`;
  }
  const minW = 150 + (isDay ? (DAY_B - DAY_A) / 60 * 42 : LAB.view === "month" ? days.length * 38 : 7 * 88);

  const lanes = emps.map(emp => {
    const geo = isDay ? laneDay(emp.empId, nowMin) : laneDays(emp.empId, days, nowMin);
    const trackH = Math.max(26, geo.laneRows * ROWH + 6);
    const closed = labSegs(emp.empId).reduce((s, t) => s + segHours(t), 0);
    const open = IMS.timesheets.find(t => t.empId === emp.empId && !t.clockOut);
    const status = open
      ? `<span class="lab-dot live"></span><span class="ts-live-txt">On <span class="strong">${tsShort(open)}</span> since ${open.clockIn}</span>`
      : `<span class="lab-dot"></span>Clocked out`;
    const blocks = geo.items.map(it => blockHTML(it, (isDay || LAB.view === "week") ? tsShort(it.seg) : "")).join("");
    return `<div class="lab-lane">
      <div class="lab-row">
        <div class="lab-label">
          <div class="lab-name">${emp.name}<button class="lab-clock btn btn-ims-outline btn-sm2" data-clock="${emp.empId}" title="Punch ${emp.name}"><i class="bi bi-stopwatch"></i></button></div>
          <div class="text-muted2" style="font-size:10.5px">${emp.empId} · ${emp.role}</div>
          <div class="lab-status">${status}</div>
        </div>
        <div class="lab-track" style="min-height:${trackH}px">
          ${blocks || `<span class="text-muted2 lab-empty">No time in ${LAB.view}</span>`}
          ${isDay ? `<div class="lab-nowline" style="left:${Math.max(0, Math.min(100, (nowMin - DAY_A) / (DAY_B - DAY_A) * 100))}%"></div>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card mb-3">
      <div class="card-body lab-toolbar">
        <div class="btn-group btn-group-sm" id="tsViewToggle">
          ${["day", "week", "month"].map(v => `<button class="btn ${LAB.view === v ? "btn-ims" : "btn-ims-outline"}" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}
        </div>
        <button class="btn btn-ims-outline btn-sm2 ms-2" id="tsPrev"><i class="bi bi-chevron-left"></i></button>
        <span class="strong ms-2" id="tsLabel" style="min-width:150px;display:inline-block">${labRangeLabel()}</span>
        <button class="btn btn-ims-outline btn-sm2" id="tsNext"><i class="bi bi-chevron-right"></i></button>
        <div class="ms-auto d-flex align-items-center gap-2">
          <select class="form-select form-select-sm" id="tsEmp" style="max-width:210px">${labEmps().map(e => `<option value="${e.empId}" ${LAB.empSel === e.empId ? "selected" : ""}>${e.empId} — ${e.name}</option>`).join("")}</select>
          <button class="btn btn-ims btn-sm2" id="tsPunch"><i class="bi bi-stopwatch"></i> Punch / Clock</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-body lab-scroll">
        <div class="tl-week"><div class="tl-inner" style="min-width:${minW}px">
          ${headCols}
          <div class="tl-body lab-body">${lanes || `<p class="text-muted2 py-3 text-center">No employees.</p>`}</div>
        </div></div>
      </div>
    </div>
    ${labSummaryHTML()}
    <div class="lab-legend-bottom">${legendHTML()}</div>`;

  bindTimesheet();
}

function legendHTML(){
  const L = [["ts-contract", "Job (Contract)"], ["ts-wo", "Work Order"], ["ts-shop", "Shop"], ["ts-overhead", "Overhead"], ["ts-idle", "Idle"]];
  return `<span class="lab-legend-item"><i class="bi bi-mouse2" style="color:var(--slate-400)"></i>Click a block for details</span>` +
    L.map(x => `<span class="lab-legend-item"><i class="bi bi-square-fill ${x[0]}"></i>${x[1]}</span>`).join("");
}

function bindTimesheet(){
  $("#tsViewToggle").querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setLabView(b.dataset.view)));
  $("#tsPrev").addEventListener("click", () => labNav(-1));
  $("#tsNext").addEventListener("click", () => labNav(1));
  $("#tsEmp").addEventListener("change", e => { LAB.empSel = e.target.value; renderTimesheet(); });
  $("#tsPunch").addEventListener("click", () => openPunch(LAB.empSel));
  $$(".lab-clock").forEach(b => b.addEventListener("click", () => openPunch(b.dataset.clock)));
  $$(".ts-block").forEach(b => b.addEventListener("click", () => segDetail(b.dataset.ts)));
}


/* ---- summary card (over the visible window) ---- */
function labSummaryHTML(){
  const days = labDays();
  const keys = {}; days.forEach(d => keys[dISO(d)] = true);
  const segs = IMS.timesheets.filter(t => keys[t.date]);
  const totH = r2(segs.reduce((s, t) => s + segHours(t), 0));
  const totC = r2(segs.reduce((s, t) => s + segCost(t), 0));
  const totB = r2(segs.reduce((s, t) => s + segBill(t), 0));
  const byKind = {};
  segs.forEach(t => { const k = t.targetType || "?"; byKind[k] = r2((byKind[k] || 0) + segHours(t)); });
  const totalForBar = totH || 1;
  const bars = Object.keys(TS_KIND).map(k => {
    const h = byKind[k] || 0;
    const L = TS_KIND[k];
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


/* ---- clock in / out ---- */
function nextTsId(){
  let max = 0;
  IMS.timesheets.forEach(t => { const n = parseInt((t.tsId || "TS-0").split("-")[1], 10); if (n > max) max = n; });
  return "TS-" + pad2(max + 1);
}
function roundUp15(min){ return Math.ceil(min / 15) * 15 >= 1440 ? 1439 : Math.ceil(min / 15) * 15; }
function openSeg(empId){ return IMS.timesheets.find(t => t.empId === empId && !t.clockOut) || null; }
function closeOpen(empId, endMin){
  const o = openSeg(empId);
  if (!o) return;
  o.clockOut = minHM(endMin);
  o.hours = r2((endMin - hmMin(o.clockIn)) / 60);
}
function punchIn(empId, targetType, targetId, startMin){
  closeOpen(empId, startMin);                      // switching jobs closes any running segment first
  IMS.timesheets.push({
    tsId: nextTsId(), empId, date: dISO(labTodayDate()),
    clockIn: minHM(startMin), clockOut: null,
    targetType, targetId: (targetType === "contract" || targetType === "workorder") ? targetId : null,
    hours: null
  });
  LAB.empSel = empId;
  renderTimesheet();
}
function punchOut(empId){
  closeOpen(empId, labTodayDate().getHours() * 60 + labTodayDate().getMinutes());
  LAB.empSel = empId;
  renderTimesheet();
}


/* Punch modal — pick where to clock in, or clock out if already running. */
function openPunch(empId){
  const emp = getEmp(empId) || { name: empId, role: "" };
  const active = IMS.contracts.filter(c => c.status === "active");
  const wos = IMS.workOrders.filter(w => w.status !== "Completed");
  const open = openSeg(empId);
  const nowMin = roundUp15(labTodayDate().getHours() * 60 + labTodayDate().getMinutes());

  const tgt = (t, id, label, cls) => `<button type="button" class="punch-tgt ${cls}" data-t="${t}" data-id="${id || ""}"><span class="strong">${label}</span></button>`;
  const jobs = active.map(c => tgt("contract", c.contractId, `${c.contractId} · ${c.projectName}`, "ts-contract"));
  const woB = wos.map(w => tgt("workorder", w.woId, `${w.woId} · ${w.assetId}`, "ts-wo"));
  const extras = [
    tgt("shop", "", "Shop", "ts-shop"),
    tgt("overhead", "", "Overhead", "ts-overhead"),
    tgt("idle", "", "Idle", "ts-idle")
  ];

  const body = `
    <div class="lab-punch-head">
      <div><span class="strong">${emp.name}</span><div class="text-muted2">${emp.role} · ${empId}</div></div>
      <span class="badge-status ${open ? "st-reorder" : "st-out"}">${open ? "Clocked in on " + segLabel(open) : "Clocked out"}</span>
    </div>
    <div class="text-muted2 mb-2" style="font-size:12px">${open
      ? `Currently on <strong>${segLabel(open)}</strong> since ${open.clockIn}. Choosing below switches jobs (closing the current one at ${minHM(nowMin)}).`
      : `Clock into a job, work order, shop, overhead or idle starting at <strong>${minHM(nowMin)}</strong> (leave the time alone to start now).`}</div>
    <div class="field-group mb-3"><label class="form-label">Start time</label>
      <input type="time" class="form-control" id="punch-time" value="${minHM(nowMin)}"></div>
    <div class="punch-label">Job (contract)</div><div class="punch-grid">${jobs.join("")}</div>
    <div class="punch-label">Work orders</div><div class="punch-grid">${woB.length ? woB.join("") : `<span class="text-muted2" style="font-size:12px">No open work orders.</span>`}</div>
    <div class="punch-label">Other</div><div class="punch-grid">${extras.join("")}</div>`;
  const footer = `
    ${open ? `<button type="button" class="btn btn-outline-danger me-auto" id="pp-clockout"><i class="bi bi-stop-circle"></i> Clock Out</button>` : ""}
    <button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>`;

  const root = openRawModal({ id: "mdl-punch", title: "Clock In / Out", icon: "bi-stopwatch", body, footer });
  const startMinOf = () => { const v = root.querySelector("#punch-time").value; return v ? roundUp15(hmMin(v)) : nowMin; };
  root.querySelectorAll(".punch-tgt").forEach(b => b.addEventListener("click", () => {
    const sm = startMinOf();
    dismissModal(root);
    punchIn(empId, b.dataset.t, b.dataset.id || null, sm);
  }));
  const co = root.querySelector("#pp-clockout");
  if (co) co.addEventListener("click", () => { dismissModal(root); punchOut(empId); });
}

/* Click a block -> details + delete / clock-out */
function segDetail(tsId){
  const ts = IMS.timesheets.find(t => t.tsId === tsId);
  if (!ts) return;
  const emp = getEmp(ts.empId) || { name: ts.empId };
  const live = isLive(ts);
  const body = `
    <div class="list-line"><span class="l">Employee</span><span class="r strong">${emp.name}</span></div>
    <div class="list-line"><span class="l">Date</span><span class="r">${fmtDate(ts.date)}</span></div>
    <div class="list-line"><span class="l">Time</span><span class="r">${ts.clockIn}–${ts.clockOut || "now"} ${live ? `<span class="badge-status st-reorder">Running</span>` : ""}</span></div>
    <div class="list-line"><span class="l">Assigned to</span><span class="r"><i class="bi ${tsKind(ts.targetType).icon} me-1 ${tsKind(ts.targetType).cls}"></i>${segLabel(ts)}</span></div>
    <div class="list-line"><span class="l">Hours</span><span class="r">${live ? "in progress" : segHours(ts) + " hr"}</span></div>
    <div class="list-line"><span class="l">Cost / Billable</span><span class="r">${fmtMoney(segCost(ts))} / ${fmtMoney(segBill(ts))}</span></div>`;
  const footer = `
    <button type="button" class="btn btn-outline-danger me-auto" id="ts-del"><i class="bi bi-trash"></i> Delete</button>
    ${live ? `<button type="button" class="btn btn-ims" id="ts-co"><i class="bi bi-stop-circle"></i> Clock Out</button>` : ""}
    <button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Close</button>`;
  const root = openRawModal({ id: "mdl-seg", title: "Time Entry " + ts.tsId, icon: "bi-clock-history", body, footer });
  $("#ts-del").addEventListener("click", () => {
    IMS.timesheets = IMS.timesheets.filter(t => t.tsId !== tsId);
    dismissModal(root); renderTimesheet();
  });
  const co = $("#ts-co");
  if (co) co.addEventListener("click", () => { dismissModal(root); punchOut(ts.empId); });
}

