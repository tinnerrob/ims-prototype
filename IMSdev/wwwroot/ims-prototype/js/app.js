/* =========================================================
   IMS — Application Logic (vanilla JS, SPA shell)
   Renders views into #content, keeps client-side state in
   memory, and mocks the pricing / geofence engines.
   ========================================================= */
"use strict";

/* ---------- tiny DOM helpers ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const fmtMoney = n => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = n => Number(n || 0).toLocaleString("en-US");
const fmtPct = n => (Number(n) || 0).toFixed(1) + "%";
const pad2 = n => String(n).padStart(2, "0");

/* ---------- app state ---------- */
const App = {
  view: "dashboard",
  invTab: "serialized",
  ccTab: "customers",
  contractFilter: "active",
  invFilter: "all",
  kitTab: "kits",
  catType: "serialized",
  contractId: "CT-2024-001",
  schedWeek: null,
  schedMonth: null,
  schedDay: null,
  schedView: "week",
  schedPoolTab: "serialized",
  geoFilter: "",
  tick: 0,
  simTimer: null,
  breachAlerts: [],
  notif: 0
};

/* ---------- date / duration helpers ---------- */
const parseDT = s => {
  s = String(s).replace(" ", "T");
  /* Date-only ISO strings ("YYYY-MM-DD") must be treated as LOCAL midnight, not UTC,
     or the local timezone shifts them back a day and breaks addDays / day-offset math. */
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)){
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(s);
};

function daysBetween(a, b){
  const diff = (parseDT(b) - parseDT(a)) / 86400000;
  return Math.max(1, Math.round(diff));
}

function countWeekdays(a, b){
  const end = parseDT(b);
  const cur = parseDT(a);
  let n = 0;
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, n);
}

function fmtDT(s){
  const d = parseDT(s);
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtDate(s){
  const d = parseDT(s);
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
}

function fmtTime(s){
  const d = parseDT(s);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function timeNow(){
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}


/* =========================================================
   STAGE 3 — PRICING RULES ENGINE
   ========================================================= */
const RISK_PREMIUM = { standard: 0, coastal: 0.15, hazmat: 0.25 };

/* Per-customer billing cadence -> cycle length in days. */
const BILLING_CYCLES = { daily: 1, weekly: 7, "bi-weekly": 14, monthly: 28, quarterly: 84 };
const BILLING_CYCLE_LABEL = { daily: "Daily", weekly: "Weekly", "bi-weekly": "Bi-Weekly", monthly: "Monthly", quarterly: "Quarterly" };
/* Billing cycle length in days for a contract (from its customer), defaulting to the
   global pricing.cycleDays (28) for customers without an explicit cadence. */
const customerCycleDays = contractOrId => {
  const cust = contractOrId && contractOrId.contractId
    ? getCustomer(contractOrId.customerId)
    : getCustomer(contractOrId);
  if (cust && BILLING_CYCLES[cust.billingCycle] != null) return BILLING_CYCLES[cust.billingCycle];
  return IMS.settings.pricing.cycleDays || 28;
};

const getResource = (item) => {
  if (item.type === "serialized") return IMS.serializedAssets.find(a => a.id === item.refId);
  if (item.type === "bulk")       return IMS.bulkResources.find(b => b.sku === item.refId);
  if (item.type === "consumable") return IMS.consumables.find(c => c.sku === item.refId);
  if (item.type === "labor")      return IMS.labor.find(e => e.empId === item.refId);
  if (item.type === "part")       return IMS.parts.find(p => p.partId === item.refId);
  if (item.type === "kit")        return IMS.kits.find(k => k.kitId === item.refId);
  if (item.type === "attachment") return IMS.attachments.find(a => a.accId === item.refId);
  return null;
};

const itemLabel = (item) => {
  const r = getResource(item);
  if (!r) return item.refId;
  if (item.type === "serialized") return `${r.id} · ${r.make} ${r.model}`;
  if (item.type === "bulk")       return `${r.sku} · ${r.name}`;
  if (item.type === "consumable") return `${r.sku} · ${r.name}`;
  if (item.type === "labor")      return `${r.empId} · ${r.name}`;
  if (item.type === "part")       return `${r.partId} · ${r.description}`;
  if (item.type === "kit")        return `${r.kitId} · ${r.name}`;
  if (item.type === "attachment") return `${r.accId} · ${r.name}`;
  return item.refId;
};
/* Name only (no code) — used on the timeline bars. */
const itemName = (item) => {
  const r = getResource(item);
  if (!r) return item.refId;
  if (item.type === "serialized") return `${r.make} ${r.model}`;
  if (item.type === "bulk" || item.type === "consumable" || item.type === "labor") return r.name;
  if (item.type === "part") return r.description;
  if (item.type === "kit" || item.type === "attachment") return r.name;
  return item.refId;
};

/* Human-readable rate basis for a line item (display in the grid). */
const rateBasis = (item, contract) => {
  const days = liDays(item, contract);
  const r = getResource(item);
  if (!r) return { basis: "", rate: 0, qty: 1, unit: "" };
  if (item.type === "labor")      return { basis: "Hourly", rate: r.hourlyBillable, qty: item.qty, unit: "hr" };
  if (item.type === "consumable") return { basis: "Each", rate: r.retailPrice, qty: item.qty, unit: "ea" };
  if (item.type === "kit")        return { basis: "Daily", rate: r.baseRate, qty: item.qty, unit: "day" };
  if (item.type === "attachment") return { basis: "Daily", rate: r.daily, qty: item.qty, unit: "day" };
  if (item.pricingMatrix === "flat") return { basis: "Flat", rate: item.flatTotal, qty: item.qty, unit: "ea" };
  if (days >= 28)  return { basis: "Monthly", rate: r.baseMonthly, qty: Math.ceil(days / 28), unit: "mo" };
  if (days >= 7)   return { basis: "Weekly", rate: r.baseWeekly, qty: Math.ceil(days / 7), unit: "wk" };
  return { basis: "Daily", rate: r.baseDaily, qty: item.qty, unit: "day" };
};

/* Grand total for a contract line item (gross billable revenue). */
function computeLineTotal(item, contract){
  const days = liDays(item, contract);
  const premium = RISK_PREMIUM[item.riskPremium || "standard"] || 0;
  const r = getResource(item);
  if (!r) return 0;

  if (item.type === "labor")      return Math.round(r.hourlyBillable * item.qty * 100) / 100;
  if (item.type === "consumable") return Math.round(r.retailPrice * item.qty * 100) / 100;
  if (item.type === "part")       return Math.round(r.costPrice * item.qty * 100) / 100;

  /* kits + attachments (daily rate billing) */
  if (item.type === "kit" || item.type === "attachment") {
    const rate = item.type === "kit" ? r.baseRate : r.daily;
    let perUnit;
    if (item.pricingMatrix === "flat") perUnit = Number(item.flatTotal) || 0;
    else {
      let billed = days;
      if (item.weekendPolicy === "skip")            billed = countWeekdays(contract.startDate, contract.endDate);
      else if (item.weekendPolicy === "overtime")   billed = days * 1.5;
      perUnit = rate * billed;
    }
    return Math.round(perUnit * item.qty * (1 + premium) * 100) / 100;
  }

  /* equipment (serialized + bulk) */
  let perUnit;
  if (item.pricingMatrix === "flat") {
    perUnit = Number(item.flatTotal) || 0;
  } else if (item.pricingMatrix === "min") {
    let billed = days;
    if (item.weekendPolicy === "skip")            billed = countWeekdays(contract.startDate, contract.endDate);
    else if (item.weekendPolicy === "overtime")   billed = days * 1.5;
    billed = Math.max(billed, 3); /* daily minimum met */
    perUnit = r.baseDaily * billed;
  } else if (days >= 28) {
    perUnit = r.baseMonthly * Math.ceil(days / 28);
  } else if (days >= 7) {
    perUnit = r.baseWeekly * Math.ceil(days / 7);
  } else {
    let billed = days;
    if (item.weekendPolicy === "skip")            billed = countWeekdays(contract.startDate, contract.endDate);
    else if (item.weekendPolicy === "overtime")   billed = days * 1.5;
    perUnit = r.baseDaily * billed;
  }
  return Math.round(perUnit * item.qty * (1 + premium) * 100) / 100;
}

/* Direct cost for a contract line item. */
function computeLineCost(item){
  const r = getResource(item);
  if (!r) return 0;
  if (item.type === "labor")      return Math.round(r.hourlyCost * item.qty * 100) / 100;
  if (item.type === "consumable") return Math.round(r.costPrice * item.qty * 100) / 100;
  if (item.type === "part")       return Math.round(r.costPrice * item.qty * 100) / 100;
  return 0;
}

/* Asset depreciation factor on a contract (10% annual on serialized fleet). */
function computeDepreciation(item, contract){
  const r = getResource(item);
  if (!r || item.type !== "serialized") return 0;
  const days = liDays(item, contract);
  return Math.round(r.purchaseValue * (days / 365) * 0.10 * item.qty * 100) / 100;
}

/* Equipment (serialized + bulk) rental gross, used as % overhead base. */
function contractEquipBase(contract){
  return (contract.lineItems || []).filter(li => li.type === "serialized" || li.type === "bulk")
    .reduce((s, li) => s + computeLineTotal(li, contract), 0);
}

/* Locked default overheads auto-injected into new / uninitialized contracts. */
function defaultOverheads(){
  return IMS.settings.overheads.filter(o => o.locked).map(o => ({
    id: "OH-" + Date.now() + "-" + Math.floor(Math.random() * 1e4),
    ohId: o.ohId, name: o.name, category: o.category, chargeType: o.chargeType,
    cost: o.cost, retail: o.retail, pct: o.pct || 0, qty: 1, locked: true
  }));
}

/* Compute billable retail + pass-through cost for one overhead line item. */
function overheadCalc(oh, contract){
  const days = daysBetween(contract.startDate, contract.endDate);
  const equip = contractEquipBase(contract);
  const qty = oh.qty || 1;
  let retail = 0, cost = 0;
  if (oh.chargeType === "Percent of Equipment Total") {
    retail = equip * (oh.pct || 0) / 100;
    cost = retail; /* pass-through surcharge */
  } else if (oh.chargeType === "Per Day") {
    retail = (oh.retail || 0) * days;
    cost = (oh.cost || 0) * days;
  } else { /* Flat Fee, Per Mile */
    retail = (oh.retail || 0) * qty;
    cost = (oh.cost || 0) * qty;
  }
  return { retail: Math.round(retail * 100) / 100, cost: Math.round(cost * 100) / 100 };
}

/* Full financial roll-up for a contract (resources + overheads). */
function contractTotals(contract){
  let gross = 0, laborCost = 0, consumableCost = 0, depreciation = 0;
  (contract.lineItems || []).forEach(li => {
    gross          += computeLineTotal(li, contract);
    laborCost      += (li.type === "labor") ? computeLineCost(li) : 0;
    consumableCost += (li.type === "consumable") ? computeLineCost(li) : 0;
    depreciation   += computeDepreciation(li, contract);
  });
  gross = Math.round(gross * 100) / 100;
  laborCost = Math.round(laborCost * 100) / 100;
  consumableCost = Math.round(consumableCost * 100) / 100;
  depreciation = Math.round(depreciation * 100) / 100;

  const overheads = (contract.overheads !== undefined) ? contract.overheads : defaultOverheads();
  let overheadRetail = 0, overheadCost = 0;
  overheads.forEach(oh => { const c = overheadCalc(oh, contract); overheadRetail += c.retail; overheadCost += c.cost; });
  overheadRetail = Math.round(overheadRetail * 100) / 100;
  overheadCost = Math.round(overheadCost * 100) / 100;

  const grossTotal = Math.round((gross + overheadRetail) * 100) / 100;
  const operatingCost = Math.round((laborCost + consumableCost + depreciation + overheadCost) * 100) / 100;
  const net = Math.round((grossTotal - operatingCost) * 100) / 100;
  const margin = grossTotal > 0 ? (net / grossTotal) * 100 : 0;
  return {
    equipmentGross: gross, equipBase: Math.round(contractEquipBase(contract) * 100) / 100,
    overheadRetail, overheadCost, operatingCost,
    gross: grossTotal, laborCost, consumableCost, depreciation, net, margin,
    days: daysBetween(contract.startDate, contract.endDate)
  };
}


/* =========================================================
   STATUS BADGE HELPER
   ========================================================= */
const STATUS_CLS = { "Available":"available", "On Rent":"onrent", "In Shop":"inshop", "Staged":"staged",
  active:"active", Completed:"closed", "In Progress":"inprogress", Scheduled:"inshop", draft:"closed", closed:"closed" };
function statusBadge(status){
  const cls = STATUS_CLS[status] || "available";
  return `<span class="badge-status st-${cls}"><i class="bi bi-circle-fill"></i>${status}</span>`;
}
const recActive = rec => rec ? rec.active !== false : true;
const activeBadge = rec => rec && rec.active === false ? `<span class="badge-status st-out"><i class="bi bi-circle-fill"></i>Inactive</span>` : "";
const activeCell = rec => recActive(rec)
  ? `<span class="badge-status st-active"><i class="bi bi-circle-fill"></i>Active</span>`
  : `<span class="badge-status st-out"><i class="bi bi-circle-fill"></i>Inactive</span>`;

/* =========================================================
   NAVIGATION / ROUTER
   ========================================================= */
const TITLES = { dashboard:"Dashboard", inventory:"Inventory & Assets", contracts:"Customers & Contracts", scheduler:"Scheduler", geo:"Geo Asset Tracking", logistics:"Logistics Board", maintenance:"Service & Maintenance", timesheet:"Labor & Timesheets", yard:"Yard Inspections", invoicing:"Cycle Invoicing", rerents:"Sub-Rentals", branches:"Branch / Yard Profiles", pricing:"Pricing Rules", categories:"Resource Categories" };
const RENDER = { dashboard: renderDashboard, inventory: renderInventory, contracts: renderCustomersContracts, scheduler: renderScheduler, geo: renderGeo, logistics: renderLogistics, maintenance: renderMaintenance, timesheet: renderTimesheet, yard: renderYard, invoicing: renderInvoicing, rerents: renderRerents, branches: renderBranches, pricing: renderPricing, categories: renderCategories };
const DESCRIPTIONS = {
  dashboard:"Aggregated business metrics from all mocked data engines.",
  inventory:"Structural database tables driving scheduling, costing and dispatch.",
  contracts:"Customer records, their rental contracts, and status control (active ↔ closed).",
  scheduler:"Stage multi-resource line items on a contract timeline and tune the pricing rules engine.",
  geo:"Dispatch control — live fleet telemetry and geofence monitoring.",
  logistics:"Dispatch board for deliveries, pickups and route assignment.",
  maintenance:"Work orders, service actions and parts drawn from consumables inventory.",
  timesheet:"Employee time punched against contracts and maintenance work orders.",
  yard:"Asset in/out inspection portal with meter & fuel tracking and overage flags.",
  invoicing:"28-day cycle billing ledger for long-term contract lifecycles.",
  rerents:"Sub-rentals sourced from third-party vendors with spread analysis.",
  branches:"Configure branch / yard locations and facilities.",
  pricing:"Global pricing rules engine, localized tax schedule and overhead fee configs.",
  categories:"Manage the active category options for all inventory resource types."
};

function showView(id){
  App.view = id;
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  $("#pageTitle").textContent = TITLES[id] || "";
  $("#pageSub").textContent = DESCRIPTIONS[id] || "";
  const c = $("#content");
  c.innerHTML = "";
  RENDER[id]();
  window.scrollTo(0, 0);
}

/* =========================================================
   REUSABLE FORM-MODAL BUILDER (Bootstrap 5)
   ========================================================= */
function fieldHTML(f, id){
  const fid = id + "-" + f.key;
  const req = f.required ? " *" : "";
  let input;
  if (f.type === "select") {
    input = `<select class="form-select" id="${fid}">` +
      (f.options || []).map(o => `<option value="${o.value}" ${String(o.value) === String(f.value) ? "selected" : ""}>${o.label}</option>`).join("") +
      `</select>`;
  } else if (f.type === "textarea") {
    input = `<textarea class="form-control" id="${fid}" rows="2">${f.value || ""}</textarea>`;
  } else if (f.type === "checkbox") {
    input = `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="${fid}" ${f.value ? "checked" : ""}><label class="form-check-label" for="${fid}">${f.label}</label></div>`;
    return `<div class="field-group">${input}${f.hint ? `<div class="form-hint">${f.hint}</div>` : ""}</div>`;
  } else {
    input = `<input class="form-control" id="${fid}" type="${f.type || "text"}" value="${f.value ?? ""}" ${f.step ? `step="${f.step}"` : ""} ${f.placeholder ? `placeholder="${f.placeholder}"` : ""}>`;
  }
  const hint = f.hint ? `<div class="form-hint">${f.hint}</div>` : "";
  return `<div class="field-group"><label class="form-label">${f.label}${req}</label>${input}${hint}</div>`;
}

function openFormModal(opts){
  const { id, title, fields, onSave, icon, large } = opts;
  document.querySelectorAll(".modal").forEach(m => m.remove());
  const rows = fields.map(f => fieldHTML(f, id)).join("");
  const el = document.createElement("div");
  el.className = "modal fade";
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="modal-dialog ${large ? "modal-lg" : ""}">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="bi ${icon || "bi-plus-circle"} me-2 text-primary"></i>${title}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">${rows}</div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-ims" id="${id}-save"><i class="bi bi-check2"></i> Save Record</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  const m = new bootstrap.Modal(el);
  el.addEventListener("hidden.bs.modal", () => el.remove());
  m.show();
  $("#" + id + "-save").addEventListener("click", () => {
    const vals = {};
    fields.forEach(f => {
      const input = $("#" + id + "-" + f.key);
      if (!input) return;
      if (f.type === "checkbox") vals[f.key] = input.checked;
      else if (f.type === "number") vals[f.key] = parseFloat(input.value) || 0;
      else vals[f.key] = input.value;
    });
    onSave(vals);
    dismissModal(el);
  });
}

/* Generic raw modal (custom body/footer) — used for read-only detail + detail/edit with lists. */
function openRawModal({ id, title, icon, body, footer, size }){
  document.querySelectorAll(".modal").forEach(m => m.remove());
  const el = document.createElement("div");
  el.className = "modal fade";
  el.id = id;
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="modal-dialog ${size === "lg" ? "modal-lg" : ""}">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="bi ${icon || "bi-info-circle"} me-2 text-primary"></i>${title}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">${footer}</div>
      </div>
    </div>`;
  document.body.appendChild(el);
  const m = new bootstrap.Modal(el);
  el.addEventListener("hidden.bs.modal", () => el.remove());
  m.show();
  return el;
}

/* Hide/remove a modal element (used after a save so the modal always closes). */
function dismissModal(el){
  if (!el) return;
  let m = null;
  try { m = window.bootstrap && bootstrap.Modal.getInstance ? bootstrap.Modal.getInstance(el) : null; } catch(_) { m = null; }
  if (m && m.hide) m.hide();
  else el.remove();
}


/* =========================================================
   STAGE 1 — INVENTORY / RESOURCE MASTER LISTS
   ========================================================= */
const emptyRow = cols => `<tr><td colspan="${cols}" class="text-center text-muted2 py-4">No records — add one with “Add Record”.</td></tr>`;

function invAddLabel(){
  switch (App.invTab) {
    case "serialized": return "New Equipment";
    case "bulk": return "New Bulk Resource";
    case "consumable": return "New Consumable";
    case "labor": return "New Labor Item";
    case "parts": return "New Part";
    case "kits": return App.kitTab === "attach" ? "New Attachment" : "New Kit";
    default: return "Add Record";
  }
}

function renderInventory(){
  const tabs = [
    { key:"serialized", label:"Serialized Equipment", icon:"bi-truck-front", count: IMS.serializedAssets.length },
    { key:"bulk",       label:"Bulk Resources",       icon:"bi-boxes",       count: IMS.bulkResources.length },
    { key:"consumable", label:"Consumables",          icon:"bi-capsule",     count: IMS.consumables.length },
    { key:"labor",      label:"Labor / Employees",    icon:"bi-person-badge",count: IMS.labor.length },
    { key:"parts",      label:"Stock Inventory",      icon:"bi-wrench-adjustable", count: IMS.parts.length },
    { key:"kits",       label:"Kits & Attachments",   icon:"bi-puzzle",      count: IMS.kits.length + IMS.attachments.length }
  ];
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-box-seam"></i> Resource Master Lists</span>
        <button class="btn btn-ims" id="invAddBtn"><i class="bi bi-plus-lg"></i> ${invAddLabel()}</button></div>
      <div class="card-body">
        <div class="subtabs" id="invTabs">
        ${tabs.map(t => `<button class="subtab ${t.key === App.invTab ? "active" : ""}" data-tab="${t.key}">
          <i class="bi ${t.icon}"></i>${t.label}<span class="count-pill">${t.count}</span></button>`).join("")}
      </div>
      <div id="invPanel"></div>
    </div></div>`;
  $$("#invTabs .subtab").forEach(b => b.addEventListener("click", () => { App.invTab = b.dataset.tab; renderInventory(); }));
  $("#invAddBtn").addEventListener("click", () => openAddModal(App.invTab));
  renderInvPanel();
}

function renderInvPanel(){
  const p = $("#invPanel");
  if (App.invTab === "serialized") p.innerHTML = serializedTable();
  else if (App.invTab === "bulk") p.innerHTML = bulkTable();
  else if (App.invTab === "consumable") p.innerHTML = consumableTable();
  else if (App.invTab === "labor") p.innerHTML = laborTable();
  else if (App.invTab === "parts") p.innerHTML = partsTable();
  else if (App.invTab === "kits") { renderInvKitsPanel(); return; }
  bindInvActions();
}

function renderInvKitsPanel(){
  const tabs = [
    { key:"kits", label:"Kits / Assemblies", icon:"bi-puzzle", count: IMS.kits.length },
    { key:"attach", label:"Attachments Matrix", icon:"bi-paperclip", count: IMS.attachments.length }
  ];
  $("#invPanel").innerHTML = `
    <div class="subtabs" id="kitSubTabs" style="border-bottom:1px solid var(--slate-200);margin-bottom:14px">
      ${tabs.map(t => `<button class="subtab ${t.key === App.kitTab ? "active" : ""}" data-tab="${t.key}">
        <i class="bi ${t.icon}"></i>${t.label}<span class="count-pill">${t.count}</span></button>`).join("")}
    </div>
    <div id="kitSubPanel"></div>`;
  $$("#kitSubTabs .subtab").forEach(b => b.addEventListener("click", () => { App.kitTab = b.dataset.tab; renderInvKitsPanel(); }));
  renderKitSubContent();
}

function renderKitSubContent(){
  const p = $("#kitSubPanel");
  p.innerHTML = App.kitTab === "kits" ? kitsList() : attachmentsTable();
  $$("[data-kedit]").forEach(b => b.addEventListener("click", () => kitModal(IMS.kits.find(x => x.kitId === b.dataset.kedit))));
  $$("[data-aedit]").forEach(b => b.addEventListener("click", () => attachmentModal(IMS.attachments.find(x => x.accId === b.dataset.aedit))));
  /* Clicking a kit card or attachment row opens the edit modal (ignores the action buttons). */
  $$("#kitSubPanel [data-edit]").forEach(el => el.addEventListener("click", e => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const id = el.dataset.edit;
    if (App.kitTab === "kits") kitModal(IMS.kits.find(x => x.kitId === id));
    else attachmentModal(IMS.attachments.find(x => x.accId === id));
  }));
}

function serializedTable(){
  const rows = IMS.serializedAssets.map(a => `
    <tr data-edit="${a.id}">
      <td class="strong mono">${a.id}</td>
      <td class="mono text-muted2">${a.serial}</td>
      <td>${a.make} ${a.model}</td>
      <td>${a.category}</td>
      <td class="num">${fmtInt(a.meterHours)}</td>
      <td>${a.fuelType}</td>
      <td class="num">${fmtMoney(a.purchaseValue)}</td>
      <td class="num"><span class="text-muted2">${fmtMoney(a.baseDaily)}</span> / <span class="text-muted2">${fmtMoney(a.baseWeekly)}</span> / <span class="text-muted2">${fmtMoney(a.baseMonthly)}</span></td>
      <td>${activeBadge(a)}${statusBadge(a.status)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-iview="${a.id}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-iedit="${a.id}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Asset ID</th><th>Serial / VIN</th><th>Make / Model</th><th>Category</th><th class="num">Meter Hrs</th>
    <th>Fuel</th><th class="num">Purchase Value</th><th class="num">Daily / Weekly / Monthly</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(10)}</tbody></table></div>`;
}

function bulkTable(){
  const rows = IMS.bulkResources.map(b => `
    <tr data-edit="${b.sku}">
      <td class="strong mono">${b.sku}</td>
      <td>${b.name}</td>
      <td>${b.category}</td>
      <td class="num">${fmtInt(b.totalOwned)}</td>
      <td class="num"><span class="strong">${fmtInt(b.qtyAvailable)}</span> / ${fmtInt(b.qtyOut)}</td>
      <td class="num">${fmtMoney(b.baseDaily)}</td>
      <td class="num">${fmtMoney(b.baseWeekly)}</td>
      <td class="num">${fmtMoney(b.baseMonthly)}</td>
      <td>${activeCell(b)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-iview="${b.sku}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-iedit="${b.sku}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>SKU</th><th>Name</th><th>Category</th><th class="num">Total Owned</th><th class="num">Avail / Out</th><th class="num">Daily</th><th class="num">Weekly</th><th class="num">Monthly</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(10)}</tbody></table></div>`;
}

function consumableTable(){
  const rows = IMS.consumables.map(c => {
    const low = c.qtyOnHand <= c.reorderPoint;
    return `<tr data-edit="${c.sku}">
      <td class="strong mono">${c.sku}</td>
      <td>${c.name}</td>
      <td>${c.category}</td>
      <td class="num"><span class="${low ? "text-danger strong" : ""}">${fmtInt(c.qtyOnHand)}</span></td>
      <td class="num text-muted2">${fmtInt(c.reorderPoint)}</td>
      <td class="num">${fmtMoney(c.costPrice)}</td>
      <td class="num">${fmtMoney(c.retailPrice)}</td>
      <td>${c.active === false ? `<span class="badge-status st-out"><i class="bi bi-circle-fill"></i>Inactive</span>` : (low ? `<span class="badge-status st-reorder"><i class="bi bi-exclamation-triangle"></i>Reorder</span>` : `<span class="badge-status st-available"><i class="bi bi-circle-fill"></i>Stocked</span>`)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-iview="${c.sku}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-iedit="${c.sku}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>SKU</th><th>Name</th><th>Category</th><th class="num">On Hand</th><th class="num">Reorder Pt</th><th class="num">Cost Price</th><th class="num">Retail Price</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(9)}</tbody></table></div>`;
}

function laborTable(){
  const rows = IMS.labor.map(e => `
    <tr data-edit="${e.empId}">
      <td class="strong mono">${e.empId}</td>
      <td>${e.name}</td>
      <td>${e.role}</td>
      <td>${e.category}</td>
      <td>${e.certs.map(c => `<span class="badge-status st-staged">${c}</span>`).join(" ")}</td>
      <td class="num">${fmtMoney(e.hourlyCost)}</td>
      <td class="num">${fmtMoney(e.hourlyBillable)}</td>
      <td class="num text-muted2">${fmtMoney(e.hourlyBillable - e.hourlyCost)}</td>
      <td>${activeCell(e)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-iview="${e.empId}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-iedit="${e.empId}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Emp ID</th><th>Full Name</th><th>Role</th><th>Category</th><th>Certifications</th><th class="num">Cost / hr</th><th class="num">Billable / hr</th><th class="num">Spread / hr</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(10)}</tbody></table></div>`;
}

function bindInvActions(){
  $$("[data-iview]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.iview;
    if (App.invTab === "serialized") serializedView(getAsset(id));
    else if (App.invTab === "bulk") bulkView(getBulk(id));
    else if (App.invTab === "consumable") consumableView(getConsumable(id));
    else if (App.invTab === "labor") laborView(getLabor(id));
    else if (App.invTab === "parts") partsView(getPart(id));
  }));
  $$("[data-iedit]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.iedit;
    if (App.invTab === "serialized") serializedModal(getAsset(id));
    else if (App.invTab === "bulk") bulkModal(getBulk(id));
    else if (App.invTab === "consumable") consumableModal(getConsumable(id));
    else if (App.invTab === "labor") laborModal(getLabor(id));
    else if (App.invTab === "parts") partsModal(getPart(id));
  }));
  /* Clicking a row opens the edit modal (ignores the action buttons/controls). */
  $$("#invPanel tr[data-edit]").forEach(tr => tr.addEventListener("click", e => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const id = tr.dataset.edit;
    if (App.invTab === "serialized") serializedModal(getAsset(id));
    else if (App.invTab === "bulk") bulkModal(getBulk(id));
    else if (App.invTab === "consumable") consumableModal(getConsumable(id));
    else if (App.invTab === "labor") laborModal(getLabor(id));
    else if (App.invTab === "parts") partsModal(getPart(id));
  }));
}


function serializedView(a){
  const cons = contractRefs("serialized", a.id);
  const wos = IMS.workOrders.filter(w => w.assetId === a.id);
  const consList = cons.map(({contract, lines}) => lines.map(li => {
    const t = contractTotals(contract);
    return `<div class="list-line"><span class="l"><span class="strong mono">${contract.contractId}</span> — ${contract.projectName} ${statusBadge(contract.status)}</span><span class="r">${fmtMoney(computeLineTotal(li, contract))}</span></div>`;
  }).join("")).join("");
  const woList = wos.map(w => {
    const x = woComputed(w);
    return `<div class="list-line"><span class="l"><span class="strong mono">${w.woId}</span> — ${w.type} ${statusBadge(w.status)}</span><span class="r">${fmtMoney(x.total)}</span></div>`;
  }).join("");
  const atts = IMS.assetAttachments.filter(x => x.assetId === a.id).map(x => IMS.attachments.find(t => t.accId === x.accId)).filter(Boolean);
  const attList = atts.map(t => `<div class="list-line"><span class="l"><span class="strong mono">${t.accId}</span> — ${t.name} <span class="text-muted2">(${t.category})</span></span><span class="r">${fmtMoney(t.daily)}/day</span></div>`).join("");
  openRawModal({
    id: "mdl-aview", size: "lg", title: "Asset — " + a.id, icon: "bi-truck-front",
    body: detailGrid([
      ["Asset ID", a.id], ["Serial / VIN", a.serial], ["Make / Model", a.make + " " + a.model], ["Category", a.category],
      ["Meter Hours", fmtInt(a.meterHours)], ["Fuel", a.fuelType], ["Purchase Value", fmtMoney(a.purchaseValue)],
      ["Daily", fmtMoney(a.baseDaily)], ["Weekly", fmtMoney(a.baseWeekly)], ["Monthly", fmtMoney(a.baseMonthly)],
      ["GPS Coord", a.lat.toFixed(4) + ", " + a.lng.toFixed(4)], ["Status", statusBadge(a.status)]
    ])
      + section("Assigned to Contracts (" + cons.length + ")", consList)
      + section("Associated Attachments (" + atts.length + ")", attList)
      + section("Maintenance Work Orders (" + wos.length + ")", woList),
    footer: closeBtn
  });
}

function bulkView(b){
  const cons = contractRefs("bulk", b.sku);
  const consList = cons.map(({contract, lines}) => lines.map(li =>
    `<div class="list-line"><span class="l"><span class="strong mono">${contract.contractId}</span> — ${contract.projectName} ${statusBadge(contract.status)}</span><span class="r">${fmtInt(li.qty)} units · ${fmtMoney(computeLineTotal(li, contract))}</span></div>`).join("")).join("");
  openRawModal({
    id: "mdl-bview", size: "lg", title: "Bulk Resource — " + b.sku, icon: "bi-boxes",
    body: detailGrid([
      ["SKU", b.sku], ["Name", b.name], ["Category", b.category],
      ["Total Owned", fmtInt(b.totalOwned)], ["Available", fmtInt(b.qtyAvailable)], ["Out", fmtInt(b.qtyOut)],
      ["Daily", fmtMoney(b.baseDaily)], ["Weekly", fmtMoney(b.baseWeekly)], ["Monthly", fmtMoney(b.baseMonthly)]
    ]) + section("Assigned to Contracts (" + cons.length + ")", consList),
    footer: closeBtn
  });
}

function consumableView(c){
  const cons = contractRefs("consumable", c.sku);
  const consList = cons.map(({contract, lines}) => lines.map(li =>
    `<div class="list-line"><span class="l"><span class="strong mono">${contract.contractId}</span> — ${contract.projectName} ${statusBadge(contract.status)}</span><span class="r">${fmtInt(li.qty)} × ${fmtMoney(computeLineTotal(li, contract))}</span></div>`).join("")).join("");
  const wos = IMS.workOrders.filter(w => (w.parts || []).some(p => p.sku === c.sku));
  const woList = wos.map(w => { const x = woComputed(w); return `<div class="list-line"><span class="l"><span class="strong mono">${w.woId}</span> — ${w.assetId} ${statusBadge(w.status)}</span><span class="r">${fmtMoney(x.total)}</span></div>`; }).join("");
  openRawModal({
    id: "mdl-coview", size: "lg", title: "Consumable — " + c.sku, icon: "bi-capsule",
    body: detailGrid([
      ["SKU", c.sku], ["Name", c.name], ["Category", "Consumable"],
      ["On Hand", fmtInt(c.qtyOnHand) + (c.qtyOnHand <= c.reorderPoint ? " <span class=\"badge-status st-reorder\">Reorder</span>" : "")],
      ["Reorder Point", fmtInt(c.reorderPoint)], ["Cost Price", fmtMoney(c.costPrice)], ["Retail Price", fmtMoney(c.retailPrice)]
    ])
      + section("Used on Contracts (" + cons.length + ")", consList)
      + section("Used in Work Orders (" + wos.length + ")", woList),
    footer: closeBtn
  });
}

function laborView(e){
  const cons = contractRefs("labor", e.empId);
  const consList = cons.map(({contract, lines}) => lines.map(li =>
    `<div class="list-line"><span class="l"><span class="strong mono">${contract.contractId}</span> — ${contract.projectName} ${statusBadge(contract.status)}</span><span class="r">${fmtInt(li.qty)} hr · ${fmtMoney(computeLineTotal(li, contract))}</span></div>`).join("")).join("");
  const ts = IMS.timesheets.filter(x => x.empId === e.empId);
  const tsList = ts.map(x => `<div class="list-line"><span class="l">${fmtDate(x.date)} · ${x.targetType === "contract" ? "Job" : "WO"} ${x.targetId}</span><span class="r">${x.hours} hr · ${fmtMoney(x.hours * e.hourlyCost)}</span></div>`).join("");
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

function partsTable(){
  const rows = IMS.parts.map(p => {
    const low = p.qtyOnHand <= p.reorderPoint;
    return `<tr data-edit="${p.partId}">
      <td class="strong mono">${p.partId}</td>
      <td>${p.description}</td>
      <td>${p.category}</td>
      <td class="mono text-muted2">${p.bin}</td>
      <td class="num"><span class="${low ? "text-danger strong" : ""}">${fmtInt(p.qtyOnHand)}</span></td>
      <td class="num text-muted2">${fmtInt(p.reorderPoint)}</td>
      <td class="num">${fmtMoney(p.costPrice)}</td>
      <td>${p.active === false ? `<span class="badge-status st-out"><i class="bi bi-circle-fill"></i>Inactive</span>` : (low ? `<span class="badge-status st-reorder"><i class="bi bi-exclamation-triangle"></i>Reorder</span>` : `<span class="badge-status st-available"><i class="bi bi-circle-fill"></i>Stocked</span>`)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-iview="${p.partId}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-iedit="${p.partId}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Part ID</th><th>Description</th><th>Category</th><th>Bin / Aisle</th><th class="num">On Hand</th><th class="num">Reorder Pt</th><th class="num">Cost Price</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(9)}</tbody></table></div>`;
}

function partsFields(e){
  e = e || {};
  return [
    { key:"active", label:"Active", type:"checkbox", value: recActive(e) },
    { key:"partId", label:"Part ID (PK)", type:"text", value: e.partId || "PRT-" + String(IMS.parts.length + 1).padStart(3, "0"), required:true },
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
    fields: partsFields(existing),
    onSave: v => {
      const rec = { active:v.active !== false, partId:v.partId, description:v.description, category:v.category, bin:v.bin, qtyOnHand:v.qtyOnHand, reorderPoint:v.reorderPoint, costPrice:v.costPrice };
      if (isEdit) Object.assign(existing, rec);
      else IMS.parts.push(rec);
      renderInventory();
    }
  });
}

function partsView(p){
  const wos = IMS.workOrders.filter(w => (w.parts || []).some(x => x.kind === "part" && x.refId === p.partId));
  const woList = wos.map(w => { const c = woComputed(w); return `<div class="list-line"><span class="l"><span class="strong mono">${w.woId}</span> — ${w.assetId} ${statusBadge(w.status)}</span><span class="r">${fmtMoney(c.total)}</span></div>`; }).join("");
  openRawModal({
    id: "mdl-pview", size: "lg", title: "Service Part — " + p.partId, icon: "bi-wrench-adjustable",
    body: detailGrid([
      ["Part ID", p.partId], ["Description", p.description], ["Bin / Aisle", p.bin],
      ["Qty on Hand", fmtInt(p.qtyOnHand) + (p.qtyOnHand <= p.reorderPoint ? " <span class=\"badge-status st-reorder\">Reorder</span>" : "")],
      ["Reorder Point", fmtInt(p.reorderPoint)], ["Cost Price", fmtMoney(p.costPrice)], ["Status", p.active === false ? "Inactive" : "Active"]
    ]) + section("Used in Work Orders (" + wos.length + ")", woList),
    footer: closeBtn
  });
}

/* ---------- inventory record lookup + detail-modal helpers ---------- */
const getAsset = id => IMS.serializedAssets.find(a => a.id === id);
const getBulk = id => IMS.bulkResources.find(b => b.sku === id);
const getConsumable = id => IMS.consumables.find(c => c.sku === id);
const getLabor = id => IMS.labor.find(e => e.empId === id);
const getPart = id => IMS.parts.find(p => p.partId === id);
const contractRefs = (type, ref) => IMS.contracts
  .map(c => ({ contract: c, lines: (c.lineItems || []).filter(li => li.type === type && li.refId === ref) }))
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
  IMS.serializedAssets.forEach(a => {
    if (a.id.startsWith(code + "-")) { const n = parseInt(a.id.split("-")[1], 10); if (n > max) max = n; }
  });
  return code + "-" + (max + 1);
}
const opt = arr => arr.map(v => ({ value: v, label: v }));

function openAddModal(tab){
  if (tab === "serialized") serializedModal();
  else if (tab === "bulk") bulkModal();
  else if (tab === "consumable") consumableModal();
  else if (tab === "labor") laborModal();
  else if (tab === "parts") partsModal();
  else if (tab === "kits") { App.kitTab === "kits" ? kitModal(null) : attachmentModal(null); }
}

function serializedFields(e){
  e = e || {};
  return [
    { key:"active", label:"Active", type:"checkbox", value: recActive(e) },
    { key:"id", label:"Asset ID (PK)", type:"text", value: e.id || nextAssetId(e.category || "Boom Lift"), required:true },
    { key:"serial", label:"Serial / VIN", type:"text", value: e.serial || "" },
    { key:"make", label:"Make", type:"text", value: e.make || "" },
    { key:"model", label:"Model", type:"text", value: e.model || "" },
    { key:"category", label:"Category", type:"select", value: e.category || activeCats("serialized")[0], options: catOptions("serialized", e.category) },
    { key:"meterHours", label:"Current Meter Hours", type:"number", value: e.meterHours || 0 },
    { key:"fuelType", label:"Fuel Type", type:"select", value: e.fuelType || "Diesel", options: opt(["Diesel","Gasoline","Electric","LPG"]) },
    { key:"purchaseValue", label:"Purchase Value ($)", type:"number", value: e.purchaseValue || 0 },
    { key:"baseDaily", label:"Base Daily Rate ($)", type:"number", value: e.baseDaily || 0 },
    { key:"baseWeekly", label:"Base Weekly Rate ($)", type:"number", value: e.baseWeekly || 0, hint:"Weekly ≈ Daily × 5" },
    { key:"baseMonthly", label:"Base Monthly Rate ($)", type:"number", value: e.baseMonthly || 0, hint:"Monthly ≈ Daily × 15 (28-day period)" },
    { key:"lat", label:"Latitude", type:"number", value: e.lat ?? IMS.yard.lat, step:"0.0001" },
    { key:"lng", label:"Longitude", type:"number", value: e.lng ?? IMS.yard.lng, step:"0.0001" },
    { key:"status", label:"Status", type:"select", value: e.status || "Available", options: opt(["Available","On Rent","In Shop","Staged"]) }
  ];
}

function serializedModal(existing){
  const isEdit = !!existing;
  openFormModal({
    id: "mdl-serial", title: (isEdit ? "Edit" : "New") + " Serialized / Equipment Asset", icon: "bi-truck-front", large: true,
    fields: serializedFields(existing),
    onSave: v => {
      if (isEdit) {
        Object.assign(existing, { active:v.active !== false, serial:v.serial, make:v.make, model:v.model, category:v.category, meterHours:v.meterHours, fuelType:v.fuelType, purchaseValue:v.purchaseValue, baseDaily:v.baseDaily, baseWeekly:v.baseWeekly, baseMonthly:v.baseMonthly, lat:v.lat, lng:v.lng, status:v.status });
      } else {
        IMS.serializedAssets.push({ id:v.id, active:v.active !== false, serial:v.serial, make:v.make, model:v.model, category:v.category, meterHours:v.meterHours, fuelType:v.fuelType, purchaseValue:v.purchaseValue, baseDaily:v.baseDaily, baseWeekly:v.baseWeekly, baseMonthly:v.baseMonthly, lat:v.lat, lng:v.lng, status:v.status, battery:100, lastReported: new Date().toISOString().slice(0,19), contractId:null });
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
    { key:"baseMonthly", label:"Base Monthly Rate / unit ($)", type:"number", value: e.baseMonthly || 0 }
  ];
}

function bulkModal(existing){
  const isEdit = !!existing;
  openFormModal({
    id: "mdl-bulk", title: (isEdit ? "Edit" : "New") + " Bulk Resource", icon: "bi-boxes",
    fields: bulkFields(existing),
    onSave: v => {
      if (isEdit) {
        Object.assign(existing, { active:v.active !== false, sku:v.sku, name:v.name, category:v.category, totalOwned:v.totalOwned, baseDaily:v.baseDaily, baseWeekly:v.baseWeekly, baseMonthly:v.baseMonthly });
      } else {
        IMS.bulkResources.push({ active:v.active !== false, sku:v.sku, name:v.name, category:v.category, totalOwned:v.totalOwned, qtyAvailable:v.totalOwned, qtyOut:0, baseDaily:v.baseDaily, baseWeekly:v.baseWeekly, baseMonthly:v.baseMonthly });
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
    fields: consumableFields(existing),
    onSave: v => {
      const rec = { active:v.active !== false, sku:v.sku, name:v.name, category:v.category, qtyOnHand:v.qtyOnHand, reorderPoint:v.reorderPoint, costPrice:v.costPrice, retailPrice:v.retailPrice };
      if (isEdit) Object.assign(existing, rec);
      else IMS.consumables.push(rec);
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
      if (isEdit) Object.assign(existing, rec);
      else IMS.labor.push(rec);
      renderInventory();
    }
  });
}


/* =========================================================
   STAGE 2 — CONTRACT MANAGEMENT & SCHEDULER
   ========================================================= */
const getContract = id => IMS.contracts.find(c => c.contractId === id);
const getCustomer = id => IMS.customers.find(c => c.id === id);
const customerName = id => { const c = getCustomer(id); return c ? c.name : (getContract(id) || {}).customer || id; };

function updateStageSummary(){
  const s = $("#stageResource"), sum = $("#stageSummary");
  if (!s || !sum) return;
  const sel = s.value;
  if (!sel) { sum.textContent = "Pick a resource, then enter qty (units) or labor hours."; return; }
  const [type, ref] = sel.split("|");
  const r = getResource({ type, refId: ref });
  if (!r) return;
  if (type === "serialized") sum.innerHTML = `<span class="tag">${r.id}</span> ${r.make} ${r.model} — ${statusBadge(r.status)} · base ${fmtMoney(r.baseDaily)}/d`;
  else if (type === "bulk") sum.innerHTML = `<span class="tag">${r.sku}</span> ${r.name} — ${fmtInt(r.qtyAvailable)} available`;
  else if (type === "consumable") sum.innerHTML = `<span class="tag">${r.sku}</span> ${r.name} — retail ${fmtMoney(r.retailPrice)} · ${fmtInt(r.qtyOnHand)} on hand`;
  else sum.innerHTML = `<span class="tag">${r.empId}</span> ${r.name} (${r.role}) — billable ${fmtMoney(r.hourlyBillable)}/hr`;
}

/* ---- weekly timeline helpers ---- */
const mondayOf = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0,0,0,0); return x; };
const weekDates = ws => [0,1,2,3,4,5,6].map(i => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
const dayDates = d => [new Date(d)];
const fmtWeekday = d => d.toLocaleDateString("en-US", { weekday:"short" });
const dayIndexInWeek = (date, ws) => Math.round((date - ws) / 86400000);
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

function atBlock(block){ const a = schedAnchor(); return new Date(a.getTime() + block * blockMs()); }
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
function liStart(li, c){ return li.startDate || c.startDate; }

function liEnd(li, c){ return li.endDate || c.endDate; }

function liDays(li, c){ return daysBetween(liStart(li, c), liEnd(li, c)); }

function toISO(d){ return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

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

  $$("#viewToggle [data-view]").forEach(b => b.addEventListener("click", () => { App.schedView = b.dataset.view; renderScheduler(); }));
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

function handleGlobalSelect(v){
  if (v.startsWith("res:")) { const [, type, ref] = v.split(":"); renderInspectorResource(type, ref); return; }
  if (getContract(v)) { App.contractId = v; renderSchedQueue(); renderTimeline(); renderInspector(getContract(v)); }
}
const TYPE_LABEL = { serialized:"Serialized", bulk:"Bulk", consumable:"Consumable", labor:"Labor", part:"Part", kit:"Kit", attachment:"Attachment" };
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
  const poolTabs = [{ key:"serialized", label:"Serialized Equipment" }, { key:"bulk", label:"Bulk Resources" }, { key:"consumable", label:"Consumables" }, { key:"labor", label:"Labor / Employees" }, { key:"parts", label:"Stock Inventory" }, { key:"kits", label:"Kits" }, { key:"attachments", label:"Attachments" }];
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
  $$("[data-qcid]").forEach(b => b.addEventListener("click", () => focusContract(b.dataset.qcid)));
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
          const status = cf.conflict ? ("Booked " + cf.contractId) : (cf.booked ? ("Shared " + cf.contractId) : "Available");
          const sub = `${liDays(li, c)}d · ${status}`;
          const liTitle = `${itemLabel(li)}<br>${TYPE_LABEL[li.type] || li.type}<br>${fmtDate(liStart(li, c))}<br>${fmtTime(liStart(li, c))} →<br>${fmtDate(liEnd(li, c))}<br>${fmtTime(liEnd(li, c))}`;
          rows += `<div class="tl-row">
            <div class="tl-row-label res">${TYPE_LABEL[li.type] || li.type}<div class="text-muted2" style="font-size:10px">${shortItemLabel(li)}</div></div>
            <div class="tl-row-track" style="--cols:${gridCols}">
              <div class="tl-block tl-res tl-res-${li.type} ${cf.conflict ? "conflict" : ""}" data-contract-id="${c.contractId}" data-li-id="${li.id}" style="left:${lg.left}%;width:${lg.width}%" title="${liTitle}">
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

function inspAssets(c){
  if (!c.lineItems || !c.lineItems.length) return `<p class="text-muted2">No resources allocated yet — drag cards onto the block.</p>`;
  return `<table class="table" style="font-size:11.5px"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Total</th><th></th></tr></thead><tbody>` +
    c.lineItems.map(li => `<tr><td><span class="type-chip tc-${li.type}">${li.type}</span> ${itemLabel(li)}</td><td class="num">${li.qty}</td><td class="num">${fmtMoney(computeLineTotal(li, c))}</td><td class="text-end"><button class="remove" data-remli="${li.id}"><i class="bi bi-x-circle"></i></button></td></tr>`).join("") +
  `</tbody></table>`;
}

function renderInspector(c){
  const box = $("#schedInspector");
  if (!c) { box.innerHTML = `<p class="text-muted2 py-3">Select a contract block to inspect.</p>`; return; }
  const t = contractTotals(c);
  box.innerHTML = `
    <div class="strong mb-1"><i class="bi bi-file-earmark-text me-1"></i>${c.contractId} ${statusBadge(c.status)}</div>
    <div class="insp-list">
      <div class="list-line"><span class="l">Customer</span><span class="r">${c.customer}</span></div>
      <div class="list-line"><span class="l">Project</span><span class="r">${c.projectName}</span></div>
      <div class="list-line"><span class="l">Site</span><span class="r">${c.jobSite}</span></div>
      <div class="list-line"><span class="l">Start</span><span class="r mono">${fmtDate(c.startDate)}</span></div>
      <div class="list-line"><span class="l">Return</span><span class="r mono">${fmtDate(c.endDate)}</span></div>
      <div class="list-line"><span class="l">Days</span><span class="r">${t.days}</span></div>
    </div>
    <div class="divider"></div>
    <div class="strong mb-1">Financial Health</div>
    <div class="insp-list">
      <div class="list-line"><span class="l">Equipment Gross</span><span class="r">${fmtMoney(t.equipmentGross)}</span></div>
      <div class="list-line"><span class="l">Overhead Billable</span><span class="r">${fmtMoney(t.overheadRetail)}</span></div>
      <div class="list-line"><span class="l"><strong>Total Gross</strong></span><span class="r strong">${fmtMoney(t.gross)}</span></div>
      <div class="list-line"><span class="l">Operating Cost</span><span class="r">${fmtMoney(t.operatingCost)}</span></div>
      <div class="list-line"><span class="l"><strong>Net Profit</strong></span><span class="r strong">${fmtMoney(t.net)}</span></div>
      <div class="list-line"><span class="l">Margin</span><span class="r">${fmtPct(t.margin)}</span></div>
    </div>
    <div class="divider"></div>
    <div class="strong mb-1">Allocated Resources (${(c.lineItems || []).length})</div>
    <div class="insp-assets">${inspAssets(c)}</div>
    <button class="btn btn-ims-outline btn-sm2 mt-2 w-100" id="inspEdit"><i class="bi bi-pencil-square"></i> Edit Contract</button>`;
  box.querySelector("#inspEdit").addEventListener("click", () => contractEditModal(c));
  const assetsBox = box.querySelector(".insp-assets");
  assetsBox.addEventListener("click", e => {
    const b = e.target.closest("[data-remli]");
    if (!b) return;
    const li = c.lineItems.find(x => x.id === b.dataset.remli);
    if (!li) return;
    c.lineItems = c.lineItems.filter(x => x.id !== li.id);
    const r = getResource(li);
    if (li.type === "serialized" && r) { r.status = "Available"; r.contractId = null; }
    else syncInventoryOnStage(li.type, li.refId, li.qty, false, c);
    renderInspector(c); renderTimeline(); renderSchedQueue();
  });
}

function renderInspectorResource(type, ref){
  const box = $("#schedInspector");
  const r = getResource({ type, refId: ref });
  if (!r) return;
  const name = itemLabel({ type, refId: ref });
  const onContracts = IMS.contracts.filter(c => (c.lineItems || []).some(li => li.type === type && li.refId === ref));
  box.innerHTML = `
    <div class="strong mb-1"><i class="bi bi-info-circle me-1"></i>${name}</div>
    <div class="insp-list">
      <div class="list-line"><span class="l">Type</span><span class="r">${type}</span></div>
      <div class="list-line"><span class="l">Status</span><span class="r">${type === "serialized" ? statusBadge(r.status) : (recActive(r) ? "Active" : "Inactive")}</span></div>
      <div class="list-line"><span class="l">Allocated to</span><span class="r">${onContracts.length} contract(s)</span></div>
    </div>
    <div class="divider"></div>
    <div class="strong mb-1">Allocation</div>
    ${onContracts.map(c => `<div class="list-line"><span class="l">${c.contractId}</span><span class="r">${fmtMoney(computeLineTotal(c.lineItems.find(li => li.type === type && li.refId === ref), c))}</span></div>`).join("") || `<p class="text-muted2">Not allocated to any contract.</p>`}`;
}

/* ---- quantity-aware availability & collision ---- */

/* Multi-unit (quantity) resource types that can be split across contracts. */
function isQuantityType(type){
  return type === "bulk" || type === "consumable" || type === "part" || type === "kit" || type === "attachment";
}

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

/* Owned/stock capacity for a resource. */
function resourceCapacity(type, r){
  if (type === "bulk") return r.totalOwned || 0;
  if (type === "consumable" || type === "part") return r.qtyOnHand || 0;
  if (type === "attachment" || type === "kit") return r.qtyOwned || 1;
  return 1;
}

/* Availability for (type, ref) on the given contract window: { total, booked, available }. */
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
  if (type === "serialized" && (r.status === "In Shop" || r.status === "On Rent")) return { ok: false, reason: "Resource unavailable for selected schedule timeline" };
  if (type === "serialized" || type === "labor"){
    const ov = resourceOverlap(type, ref, contract);
    if (ov) return { ok: false, reason: `Booked on ${ov.contractId} for this period` };
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

function resizeToDates(c, liId, mode, d){
  const sD = liId ? parseDT(liStart(c.lineItems.find(x => x.id === liId), c)) : parseDT(c.startDate);
  const eD = liId ? parseDT(liEnd(c.lineItems.find(x => x.id === liId), c)) : parseDT(c.endDate);
  let s = new Date(sD), en = new Date(eD);
  if (mode === "left"){ s.setDate(s.getDate() + d); if (s > en) s = new Date(en); }
  else if (mode === "right"){ en.setDate(en.getDate() + d); if (en < s) en = new Date(s); }
  else { s.setDate(s.getDate() + d); en.setDate(en.getDate() + d); }
  return commitBarDates(c, liId, s, en);
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


function stageResource(){
  const sel = $("#stageResource").value;
  if (!sel) return;
  const [type, ref] = sel.split("|");
  const qty = Math.max(1, parseInt($("#stageQty").value, 10) || 1);
  const c = getContract(App.contractId);
  if (!c) return;
  c.lineItems.push({ id:"LI-" + Date.now(), type, refId:ref, qty, startDate: c.startDate, endDate: c.endDate,
    pricingMatrix: type === "labor" ? "flat" : "standard",
    weekendPolicy:"bill", riskPremium:"standard", flatTotal:0 });
  syncInventoryOnStage(type, ref, qty, true, c);
  renderScheduler();
}

function syncInventoryOnStage(type, ref, qty, add, contract){
  const r = getResource({ type, refId: ref });
  if (!r) return;
  if (type === "serialized") {
    r.status = contract.status === "draft" ? "Staged" : "On Rent";
    r.contractId = contract.contractId;
    r.lastReported = new Date().toISOString().slice(0, 19);
  } else if (type === "bulk") {
    if (add) { r.qtyOut += qty; r.qtyAvailable = Math.max(0, r.qtyAvailable - qty); }
    else { r.qtyOut = Math.max(0, r.qtyOut - qty); r.qtyAvailable += qty; }
  } else if (type === "consumable") {
    r.qtyOnHand = Math.max(0, add ? r.qtyOnHand - qty : r.qtyOnHand + qty);
  } else if (type === "part") {
    r.qtyOnHand = Math.max(0, add ? r.qtyOnHand - qty : r.qtyOnHand + qty);
  }
}

function unstageLineItem(liId){
  const c = getContract(App.contractId);
  const li = (c.lineItems || []).find(x => x.id === liId);
  if (!li) return;
  c.lineItems = c.lineItems.filter(x => x.id !== liId);
  const r = getResource(li);
  if (li.type === "serialized" && r) {
    r.status = r.contractId === c.contractId ? "Available" : r.status;
    r.contractId = null;
  } else {
    syncInventoryOnStage(li.type, li.refId, li.qty, false, c);
  }
  renderScheduler();
}

function selOpts(field, cur){
  if (field === "pricingMatrix") return `<option value="standard" ${cur==="standard"?"selected":""}>Standard (D/W/M)</option><option value="min" ${cur==="min"?"selected":""}>Daily Min Met</option><option value="flat" ${cur==="flat"?"selected":""}>Flat Rate</option>`;
  if (field === "weekendPolicy") return `<option value="bill" ${cur==="bill"?"selected":""}>Bill Weekends 1.0x</option><option value="skip" ${cur==="skip"?"selected":""}>Skip Weekends 0.0x</option><option value="overtime" ${cur==="overtime"?"selected":""}>Shift/Overtime 1.5x</option>`;
  if (field === "riskPremium")   return `<option value="standard" ${cur==="standard"?"selected":""}>Std +0%</option><option value="coastal" ${cur==="coastal"?"selected":""}>Coastal +15%</option><option value="hazmat" ${cur==="hazmat"?"selected":""}>Hazmat +25%</option>`;
  return "";
}

function schedRowHTML(li, c){
  const total = computeLineTotal(li, c);
  const chip = `<span class="type-chip tc-${li.type}">${li.type}</span>`;
  const label = `<span class="strong">${itemLabel(li)}</span>`;
  const qtyInput = `<input type="number" min="1" style="width:58px" data-li="${li.id}" data-field="qty" value="${li.qty}" title="${li.type === "labor" ? "Hours" : "Qty"}">`;
  let basis = "", controls = "";
  if (li.type === "labor") {
    const r = getResource(li);
    basis = `<span class="text-muted2">${fmtInt(li.qty)} hr × ${fmtMoney(r.hourlyBillable)}</span>`;
  } else if (li.type === "consumable") {
    const r = getResource(li);
    basis = `<span class="text-muted2">${fmtInt(li.qty)} × ${fmtMoney(r.retailPrice)}</span>`;
  } else {
    const rb = rateBasis(li, c);
    basis = `<span class="text-muted2">${rb.basis} ${fmtMoney(rb.rate)} × ${li.type === "serialized" ? 1 : li.qty}</span>`;
    controls = `
      <select data-li="${li.id}" data-field="pricingMatrix" title="Pricing Matrix">${selOpts("pricingMatrix", li.pricingMatrix)}</select>
      <select data-li="${li.id}" data-field="weekendPolicy" title="Weekend Policy">${selOpts("weekendPolicy", li.weekendPolicy)}</select>
      <select data-li="${li.id}" data-field="riskPremium" title="Risk Premium">${selOpts("riskPremium", li.riskPremium)}</select>
      ${li.pricingMatrix === "flat" ? `<input type="number" style="width:82px" data-li="${li.id}" data-field="flatTotal" value="${li.flatTotal || 0}" placeholder="Flat $">` : ""}`;
  }
  return `<div class="sched-row">
    <div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${chip}${label}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
        ${qtyInput}<span class="text-muted2" style="font-size:11.5px">${li.type === "labor" ? "hrs" : "qty"}</span>
        <span style="margin-left:6px">${basis}</span>
        <div class="li-controls">${controls}</div>
      </div>
    </div>
    <div style="text-align:right">
      <div class="strong" data-total="${li.id}">${fmtMoney(total)}</div>
      <button class="remove" data-remove="${li.id}" title="Remove line"><i class="bi bi-x-circle"></i></button>
    </div>
  </div>`;
}

function renderSchedGrid(){
  const c = getContract(App.contractId);
  if (!c) { $("#schedGrid").innerHTML = "<p class='text-muted2'>No contract selected.</p>"; return; }
  const groups = [
    { key:"serialized", title:"Serialized Equipment", icon:"bi-truck-front" },
    { key:"bulk", title:"Bulk Resources", icon:"bi-boxes" },
    { key:"consumable", title:"Consumables (Sales Stock)", icon:"bi-capsule" },
    { key:"labor", title:"Labor / Employees", icon:"bi-person-badge" }
  ];
  let html = "";
  groups.forEach(g => {
    const items = c.lineItems.filter(li => li.type === g.key);
    if (!items.length) return;
    html += `<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--slate-600);margin:10px 0 4px"><i class="bi ${g.icon} me-1"></i>${g.title}</div>`;
    items.forEach(li => html += schedRowHTML(li, c));
  });
  $("#schedGrid").innerHTML = html || `<p class="text-muted2 py-3 text-center">No resources staged yet. Add equipment, bulk, consumables or labor from the staging panel.</p>`;
}

function bindSchedGrid(){
  const g = $("#schedGrid");
  if (!g) return;
  g.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.li) return;
    const c = getContract(App.contractId);
    const li = (c.lineItems || []).find(x => x.id === t.dataset.li);
    if (!li) return;
    const f = t.dataset.field;
    if (f === "qty" || f === "flatTotal") li[f] = parseFloat(t.value) || 0;
    else li[f] = t.value;
    if (f === "pricingMatrix") renderSchedGrid();
    const td = $("[data-total=\"" + li.id + "\"]", g);
    if (td) td.textContent = fmtMoney(computeLineTotal(li, c));
    renderSchedProfit();
  });
  g.addEventListener("click", e => {
    const b = e.target.closest("[data-remove]");
    if (b) unstageLineItem(b.dataset.remove);
  });
}

function renderSchedProfit(){
  const c = getContract(App.contractId);
  const t = contractTotals(c);
  $("#schedProfit").innerHTML = `
    <table class="totals-table">
      <tr><td>Equipment Rental Gross</td><td>${fmtMoney(t.equipmentGross)}</td></tr>
      <tr><td>Overhead &amp; Service Billable</td><td>${fmtMoney(t.overheadRetail)}</td></tr>
      <tr class="grand"><td>Total Gross Revenue</td><td>${fmtMoney(t.gross)}</td></tr>
      <tr><td>− Direct Labor Costs</td><td>${fmtMoney(t.laborCost)}</td></tr>
      <tr><td>− Consumable Costs</td><td>${fmtMoney(t.consumableCost)}</td></tr>
      <tr><td>− Asset Depreciation Factor (10% ann.)</td><td>${fmtMoney(t.depreciation)}</td></tr>
      <tr><td>− Overhead Pass-Through Cost</td><td>${fmtMoney(t.overheadCost)}</td></tr>
      <tr class="grand"><td>Estimated Net Profit</td><td>${fmtMoney(t.net)}</td></tr>
    </table>
    <div class="divider"></div>
    <div class="profit-panel">
      <div class="label">Estimated Net Profit Margin</div>
      <div class="value">${fmtPct(t.margin)}</div>
      <div style="font-size:11px;color:#166534;margin-top:4px">Net ${fmtMoney(t.net)} over a ${t.days}-day contract · Operating Cost ${fmtMoney(t.operatingCost)}</div>
    </div>`;
}


/* =========================================================
   CONTRACTS — HEADER MANAGEMENT (split out of Scheduler)
   ========================================================= */
function renderCustomersContracts(){
  const tabs = [
    { key:"customers", label:"Customers", icon:"bi-people", count: IMS.customers.length },
    { key:"contracts", label:"Contracts", icon:"bi-folder2-open", count: IMS.contracts.length }
  ];
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-folder2-open"></i> Customers &amp; Contracts</span>
        <button class="btn btn-ims" id="ccAddBtn"><i class="bi bi-plus-lg"></i> ${App.ccTab === "customers" ? "New Customer" : "New Contract"}</button></div>
      <div class="card-body">
        <div class="subtabs" id="ccTabs">
        ${tabs.map(t => `<button class="subtab ${t.key === App.ccTab ? "active" : ""}" data-tab="${t.key}">
          <i class="bi ${t.icon}"></i>${t.label}<span class="count-pill">${t.count}</span></button>`).join("")}
      </div>
      <div id="ccPanel"></div>
    </div></div>`;
  $$("#ccTabs .subtab").forEach(b => b.addEventListener("click", () => { App.ccTab = b.dataset.tab; renderCustomersContracts(); }));
  $("#ccAddBtn").addEventListener("click", () => { App.ccTab === "customers" ? customerNewModal() : contractModal(); });
  renderCcPanel();
}

function renderCcPanel(){
  const p = $("#ccPanel");
  if (App.ccTab === "customers") {
    p.innerHTML = customersTable();
  } else {
    const filtered = IMS.contracts.filter(c => c.status === App.contractFilter);
    p.innerHTML = `
      <div class="d-flex align-items-center justify-content-between flex-wrap mb-3 gap-2">
        <span class="text-muted2">Showing <strong>${App.contractFilter}</strong> contracts (<strong>${filtered.length}</strong>)</span>
        <div class="btn-group" id="ccFilter">
          <button class="btn btn-sm2 ${App.contractFilter === "active" ? "btn-ims" : "btn-ims-outline"}" data-f="active">Active</button>
          <button class="btn btn-sm2 ${App.contractFilter === "closed" ? "btn-ims" : "btn-ims-outline"}" data-f="closed">Closed</button>
        </div>
      </div>` + contractsTable(filtered);
  }
  bindCcActions();
}

function customersTable(){
  const rows = IMS.customers.map(c => {
    const cons = IMS.contracts.filter(x => x.customerId === c.id);
    const active = cons.filter(x => x.status === "active").length;
    return `<tr data-edit="${c.id}">
      <td class="strong">${c.name} ${activeBadge(c)}<div class="text-muted2" style="font-size:11px">${c.email}</div></td>
      <td>${c.contact}</td>
      <td class="mono text-muted2">${c.phone}</td>
      <td class="num"><span class="badge-status st-active">${active} active</span></td>
      <td class="num">${cons.length}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ims-outline btn-sm2" data-cview="${c.id}"><i class="bi bi-eye"></i> View</button>
        <button class="btn btn-ims-outline btn-sm2" data-cedit="${c.id}"><i class="bi bi-pencil"></i> Edit</button>
      </td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Customer</th><th>Contact</th><th>Phone</th><th class="num">Active</th><th class="num">Contracts</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(6)}</tbody></table></div>`;
}

function contractsTable(filtered){
  const rows = filtered.map(c => {
    const t = contractTotals(c);
    const on = c.status === "active";
    return `<tr data-edit="${c.contractId}">
      <td class="strong mono">${c.contractId}</td>
      <td>${customerName(c.customerId)}</td>
      <td>${c.projectName}</td>
      <td class="mono text-muted2" style="font-size:11.5px">${fmtDate(c.startDate)}</td>
      <td class="mono text-muted2" style="font-size:11.5px">${fmtDate(c.endDate)}</td>
      <td class="num">${fmtMoney(t.gross)}</td>
      <td>${statusBadge(c.status)}</td>
      <td class="text-end text-nowrap">
        <label class="form-check form-switch mb-0 d-inline-block me-1" title="${on ? "Slide to close contract" : "Slide to activate contract"}">
          <input class="form-check-input" type="checkbox" data-cstatus="${c.contractId}" ${on ? "checked" : ""} style="cursor:pointer">
        </label>
        <button class="btn btn-ims-outline btn-sm2" data-cview="${c.contractId}" title="View"><i class="bi bi-eye"></i></button>
        <button class="btn btn-ims-outline btn-sm2" data-cedit="${c.contractId}" title="Edit"><i class="bi bi-pencil"></i></button>
      </td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Contract</th><th>Customer</th><th>Project</th><th>Start</th><th>End</th><th class="num">Gross</th><th>Status</th><th class="text-end">Active / Actions</th>
  </tr></thead><tbody>${rows || emptyRow(8)}</tbody></table></div>`;
}

function bindCcActions(){
  $$("[data-cview]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.cview;
    const cust = getCustomer(id), con = getContract(id);
    if (cust) customerModal(cust, false);
    else if (con) contractDetailModal(con);
  }));
  $$("[data-cedit]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.cedit;
    const cust = getCustomer(id), con = getContract(id);
    if (cust) customerModal(cust, true);
    else if (con) contractEditModal(con);
  }));
  $$("[data-cstatus]").forEach(b => b.addEventListener("change", () => {
    const c = getContract(b.dataset.cstatus);
    if (!c) return;
    c.status = b.checked ? "active" : "closed";
    renderCcPanel();
  }));
  $$("#ccFilter [data-f]").forEach(b => b.addEventListener("click", () => { App.contractFilter = b.dataset.f; renderCcPanel(); }));
  /* Clicking a row opens the edit modal (ignores the action buttons/controls). */
  $$("#ccPanel tr[data-edit]").forEach(tr => tr.addEventListener("click", e => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const id = tr.dataset.edit;
    const cust = getCustomer(id), con = getContract(id);
    if (cust) customerModal(cust, true);
    else if (con) contractEditModal(con);
  }));
}

function nextCustId(){
  let max = 0;
  IMS.customers.forEach(c => { const n = parseInt(c.id.split("-")[1], 10); if (n > max) max = n; });
  return "CUST-" + String(max + 1).padStart(3, "0");
}

function customerModal(cust, editable){
  const cons = IMS.contracts.filter(x => x.customerId === cust.id);
  const contractsList = cons.map(cc => {
    const t = contractTotals(cc);
    return `<div class="list-line" style="align-items:center">
      <span class="l"><span class="strong mono">${cc.contractId}</span> — ${cc.projectName} ${statusBadge(cc.status)}</span>
      <span class="r">${fmtMoney(t.gross)}</span>
    </div>`;
  }).join("") || `<p class="text-muted2 py-2">No contracts on file for this customer.</p>`;

  const fields = [["name","Company Name"],["phone","Phone"],["email","Email"],["billingAddress","Billing Address"],["notes","Notes"]];
  const cycleOpts = Object.keys(BILLING_CYCLES).map(k => `<option value="${k}" ${(cust.billingCycle || "monthly") === k ? "selected" : ""}>${BILLING_CYCLE_LABEL[k]} (${BILLING_CYCLES[k]} day${BILLING_CYCLES[k] === 1 ? "" : "s"})</option>`).join("");
  const body = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="cust-active" ${recActive(cust) ? "checked" : ""}><label class="form-check-label" for="cust-active"><strong>Active</strong></label></div>
      <span class="text-muted2" style="font-size:11.5px">Inactive customers are archived / not selectable</span>
    </div>
    <div class="row g-3">
      <div class="col-md-6 field-group">
        <label class="form-label">Billing Cycle</label>
        ${editable
          ? `<select class="form-select" id="cust-billingCycle">${cycleOpts}</select>`
          : `<div class="form-control-plaintext">${BILLING_CYCLE_LABEL[cust.billingCycle] || "Monthly"} (${BILLING_CYCLES[cust.billingCycle] || 28} days)</div>`}
      </div>
      <div class="col-md-6 field-group"><label class="form-label">Contact</label>
        ${editable ? `<input class="form-control" id="cust-contact" type="text" value="${(cust.contact || "").replace(/"/g, "&quot;")}">` : `<div class="form-control-plaintext">${cust.contact || "—"}</div>`}
      </div>
      ${fields.map(f => `<div class="col-md-6 field-group">
        <label class="form-label">${f[1]}</label>
        ${editable
          ? `<input class="form-control" id="cust-${f[0]}" type="text" value="${(cust[f[0]] || "").replace(/"/g, "&quot;")}">`
          : `<div class="form-control-plaintext">${cust[f[0]] || "—"}</div>`}
      </div>`).join("")}
    </div>
    <div class="divider"></div>
    <div class="d-flex justify-content-between align-items-center mb-2">
      <span class="strong"><i class="bi bi-folder2-open me-1"></i>Contracts (${cons.length})</span>
      <span class="text-muted2">Active ${cons.filter(x => x.status === "active").length} · Closed ${cons.filter(x => x.status === "closed").length}</span>
    </div>
    ${contractsList}`;

  const footer = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Close</button>`
    + (editable ? `<button type="button" class="btn btn-ims" id="custSave"><i class="bi bi-check2"></i> Save Customer</button>` : "");
  const root = openRawModal({
    id: "mdl-cust", size: "lg",
    title: (editable ? "Edit" : "View") + " Customer — " + cust.name,
    icon: editable ? "bi-pencil-square" : "bi-person-lines-fill",
    body, footer
  });
  if (editable) {
    root.querySelector("#custSave").addEventListener("click", () => {
      ["name","contact","phone","email","billingAddress","notes"].forEach(k => cust[k] = root.querySelector("#cust-" + k).value.trim());
      const bc = root.querySelector("#cust-billingCycle");
      if (bc) cust.billingCycle = bc.value;
      cust.active = root.querySelector("#cust-active").checked;
      renderCustomersContracts();
      dismissModal(root);
    });
  }
}

function customerNewModal(){
  const cust = { id: nextCustId(), name:"", contact:"", phone:"", email:"", billingAddress:"", notes:"", billingCycle:"monthly", active:true };
  IMS.customers.push(cust);
  customerModal(cust, true);
}

function contractDetailModal(con){
  const t = contractTotals(con);
  const lineItems = (con.lineItems || []).map(li => `<div class="list-line">
    <span class="l">${itemLabel(li)} <span class="badge-status tc-serialized" style="text-transform:uppercase">${li.type}</span></span>
    <span class="r">${fmtMoney(computeLineTotal(li, con))}</span>
  </div>`).join("") || `<p class="text-muted2 py-2">No line items staged.</p>`;
  const body = `
    <div class="row g-3">
      <div class="col-md-6 field-group"><label class="form-label">Customer</label><div class="form-control-plaintext strong">${customerName(con.customerId)}</div></div>
      <div class="col-md-6 field-group"><label class="form-label">Project</label><div class="form-control-plaintext">${con.projectName}</div></div>
      <div class="col-md-12 field-group"><label class="form-label">Job Site</label><div class="form-control-plaintext">${con.jobSite}</div></div>
      <div class="col-md-3 field-group"><label class="form-label">Start</label><div class="form-control-plaintext mono">${fmtDT(con.startDate)}</div></div>
      <div class="col-md-3 field-group"><label class="form-label">Expected Return</label><div class="form-control-plaintext mono">${fmtDT(con.endDate)}</div></div>
      <div class="col-md-3 field-group"><label class="form-label">Geofence</label><div class="form-control-plaintext">${fmtInt(con.geofenceRadius)} m</div></div>
      <div class="col-md-3 field-group"><label class="form-label">Status</label><div class="form-control-plaintext">${statusBadge(con.status)}</div></div>
    </div>
    <div class="divider"></div>
    <div class="d-flex justify-content-between align-items-center mb-2">
      <span class="strong"><i class="bi bi-diagram-3 me-1"></i>Line Items (${(con.lineItems || []).length})</span>
      <span class="strong">Gross ${fmtMoney(t.gross)}</span>
    </div>
    ${lineItems}`;
  const root = openRawModal({
    id: "mdl-cview", size: "lg", title: "Contract — " + con.contractId, icon: "bi-eye", body,
    footer: `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Close</button>
             <button type="button" class="btn btn-ims" id="cvSched"><i class="bi bi-calendar3"></i> Open Scheduler</button>`
  });
  root.querySelector("#cvSched").addEventListener("click", () => { App.contractId = con.contractId; showView("scheduler"); });
}



/* =========================================================
   STAGE 4 — GEOGRAPHICAL ASSET TRACKING
   ========================================================= */
const GEO_BOUNDS = { minLat: 33.700, maxLat: 33.770, minLng: -84.460, maxLng: -84.330 };
const pinHTML = (kind, x, y, label) => `<div class="map-pin ${kind}" style="left:${x}px;top:${y}px"><div class="pin-dot"></div><div class="pin-label">${label}</div></div>`;

function latLngToXY(map, lat, lng){
  const W = map.clientWidth || 520, H = map.clientHeight || 560;
  const x = (lng - GEO_BOUNDS.minLng) / (GEO_BOUNDS.maxLng - GEO_BOUNDS.minLng) * W;
  const y = (GEO_BOUNDS.maxLat - lat) / (GEO_BOUNDS.maxLat - GEO_BOUNDS.minLat) * H;
  return { x, y };
}

function metersToPx(map, meters){
  const W = map.clientWidth || 520, H = map.clientHeight || 560;
  const latPx = H / (GEO_BOUNDS.maxLat - GEO_BOUNDS.minLat) / 111320;
  const lngPx = W / (GEO_BOUNDS.maxLng - GEO_BOUNDS.minLng) / 111320;
  return meters * (latPx + lngPx) / 2;
}

function haversineMeters(lat1, lng1, lat2, lng2){
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function renderGeo(){
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="geo-layout">
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title"><i class="bi bi-list-ul"></i> Fleet Asset Status</span>
            <span class="text-muted2" style="font-weight:500">${IMS.serializedAssets.length} serialized units</span></div>
          <div class="card-body">
            <input class="filter-input mb-2" id="geoFilter" value="${App.geoFilter || ""}" placeholder="Search asset ID, make, model, serial...">
            <div class="table-wrap" style="max-height:280px;overflow-y:auto">
              <table class="table"><thead><tr><th>Asset</th><th>Status</th><th>Last Reported</th><th>Batt</th><th class="num">Meter Hrs</th></tr></thead>
              <tbody id="geoTbody"></tbody></table>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-broadcast"></i> Geofence Breach Alerts</span>
            <div><span class="badge-status st-out" id="geoAlertCount">0</span>
            <button class="btn btn-ims-outline btn-sm2 ms-2" id="geoClear"><i class="bi bi-trash"></i> Clear Alerts</button></div></div>
          <div class="card-body"><div class="alerts-log" id="geoAlerts"></div></div>
        </div>
      </div>
      <div class="geo-map-wrap" id="geoMapWrap">
        <div class="geo-map" id="geoMap"></div>
        <div class="map-legend">
          <div class="lg-item"><span style="width:12px;height:12px;border-radius:50%;background:#1f2937;display:inline-block"></span>Yard Hub</div>
          <div class="lg-item"><span style="width:12px;height:12px;border-radius:50%;background:#7c3aed;display:inline-block"></span>Active Job Site (geofence)</div>
          <div class="lg-item"><span style="width:12px;height:12px;border-radius:50%;background:#2563eb;display:inline-block"></span>Asset in geofence</div>
          <div class="lg-item"><span style="width:12px;height:12px;border-radius:50%;background:#dc2626;display:inline-block"></span>Asset breach</div>
        </div>
        <div class="map-scale"><i class="bi bi-rulers"></i> ~1.5 km grid</div>
      </div>
    </div>`;

  $("#geoFilter").addEventListener("input", e => { App.geoFilter = e.target.value; renderGeoTable(); });
  $("#geoClear").addEventListener("click", () => { App.breachAlerts = []; updateBadges(); renderGeoTable(); renderGeoAlerts(); renderGeoMap(); });
  renderGeoTable();
  renderGeoMap();
  renderGeoAlerts();
}

function renderGeoTable(){
  const q = (App.geoFilter || "").toLowerCase();
  const rows = IMS.serializedAssets.filter(a => !q || (a.id + " " + a.make + " " + a.model + " " + a.serial).toLowerCase().includes(q)).map(a => {
    const battCls = a.battery > 60 ? "var(--success)" : (a.battery > 30 ? "var(--warning)" : "var(--danger)");
    return `<tr>
      <td class="strong mono">${a.id}</td>
      <td>${statusBadge(a.status)}${a._breached ? " <span class=\"badge-status st-out\">Breach</span>" : ""}</td>
      <td class="mono text-muted2" style="font-size:11.5px">${fmtDT(a.lastReported)}</td>
      <td><div class="batt-bar"><div style="width:${a.battery}%;background:${battCls}"></div></div><span class="text-muted2" style="font-size:10.5px">${a.battery}%</span></td>
      <td class="num">${fmtInt(a.meterHours)}</td>
    </tr>`;
  }).join("");
  $("#geoTbody").innerHTML = rows || `<tr><td colspan="5" class="text-center text-muted2 py-3">No matching assets</td></tr>`;
}

function renderGeoMap(){
  const map = $("#geoMap");
  if (!map) return;
  const W = map.clientWidth || 520, H = map.clientHeight || 560;
  let grid = "";
  for (let gx = 40; gx < W; gx += 40) grid += `<div class="map-gridline" style="left:${gx}px;top:0;width:1px;height:100%"></div>`;
  for (let gy = 40; gy < H; gy += 40) grid += `<div class="map-gridline" style="top:${gy}px;left:0;height:1px;width:100%"></div>`;
  let html = grid;
  const y = latLngToXY(map, IMS.yard.lat, IMS.yard.lng);
  html += pinHTML("yard", y.x, y.y, "YARD");
  IMS.contracts.filter(c => c.status !== "closed").forEach(c => {
    const s = latLngToXY(map, c.siteLat, c.siteLng);
    const r = metersToPx(map, c.geofenceRadius);
    html += `<div class="geo-ring" style="left:${s.x}px;top:${s.y}px;width:${r * 2}px;height:${r * 2}px"><span class="ring-tag">${c.projectName} (${c.geofenceRadius}m)</span></div>`;
    html += pinHTML("site", s.x, s.y, c.contractId);
  });
  IMS.serializedAssets.forEach(a => {
    const p = latLngToXY(map, a.lat, a.lng);
    html += pinHTML("asset" + (a._breached ? " alerting" : ""), p.x, p.y, a.id);
  });
  map.innerHTML = html;
}

function renderGeoAlerts(){
  const log = $("#geoAlerts");
  if (!log) return;
  const items = App.breachAlerts.slice().reverse();
  $("#geoAlertCount").textContent = App.breachAlerts.filter(a => a.kind === "breach").length;
  log.innerHTML = items.length
    ? items.map(a => `<div class="alert-line ${a.kind}"><span class="ts">${a.ts}</span><span>${a.msg}</span></div>`).join("")
    : `<p class="text-muted2 py-2"><i class="bi bi-check-circle"></i> Monitoring… no geofence events yet.</p>`;
}

/* ---------- geofence movement simulator ---------- */
function initSim(){
  IMS.serializedAssets.forEach(a => {
    a._baseLat = a.lat; a._baseLng = a.lng; a._breached = false;
    if (a.contractId) {
      if (a.id === "BL-119") a._sim = { ampLat: 0.0015, ampLng: 0.0010, sp: 0.9 };
      else if (a.id === "GN-511") a._sim = { ampLat: 0.0005, ampLng: 0.0005, sp: 0.6 };
      else a._sim = { ampLat: 0.0004, ampLng: 0.0003, sp: 0.7 };
    } else {
      a._sim = { ampLat: 0.00006, ampLng: 0.00006, sp: 0.4 };
    }
  });
}

function geoSimTick(){
  App.tick++;
  const t = App.tick;
  IMS.serializedAssets.forEach(a => {
    const s = a._sim || { ampLat: 0.00006, ampLng: 0.00006, sp: 0.4 };
    a.lat = a._baseLat + s.ampLat * Math.sin(t * s.sp * 0.4);
    a.lng = a._baseLng + s.ampLng * Math.cos(t * s.sp * 0.33);
    a.lastReported = new Date().toISOString().slice(0, 19);
    if (a.contractId) {
      const c = getContract(a.contractId);
      if (!c) return;
      const d = haversineMeters(a.lat, a.lng, c.siteLat, c.siteLng);
      if (d > c.geofenceRadius && !a._breached) { a._breached = true; addBreach(a, c); }
      else if (d <= c.geofenceRadius && a._breached) { a._breached = false; addReentry(a, c); }
    }
  });
  if (App.view === "geo") { renderGeoTable(); renderGeoMap(); renderGeoAlerts(); }
  updateBadges();
}

function pushAlert(a){ App.breachAlerts.push(a); if (App.breachAlerts.length > 40) App.breachAlerts.shift(); }

function addBreach(asset, contract){
  const d = Math.round(haversineMeters(asset.lat, asset.lng, contract.siteLat, contract.siteLng));
  pushAlert({ kind:"breach", ts: timeNow(), msg:`ALERT: Asset ${asset.id} exited Geofence boundary at Job Site: ${contract.projectName} (${d}m out)` });
}

function addReentry(asset, contract){
  pushAlert({ kind:"info", ts: timeNow(), msg:`Asset ${asset.id} re-entered Geofence at ${contract.projectName}` });
}

/* ---------- global badges / notifications ---------- */
function reorderCount(){ return IMS.consumables.filter(c => c.qtyOnHand <= c.reorderPoint).length + IMS.parts.filter(p => p.qtyOnHand <= p.reorderPoint).length; }

function inProgressWO(){ return IMS.workOrders.filter(w => w.status !== "Completed").length; }

function updateBadges(){
  const n = App.breachAlerts.filter(a => a.kind === "breach").length;
  const bad = $("#navGeoBadge"), cnt = $("#notifCount");
  if (bad) { bad.textContent = n; bad.style.display = n ? "" : "none"; }
  App.notif = n + reorderCount() + inProgressWO();
  if (cnt) cnt.textContent = App.notif;
}

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
  const woRows = IMS.workOrders.map(w => ({ ...w, ...woComputed(w), asset: IMS.serializedAssets.find(a => a.id === w.assetId) }));
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-tools"></i> Work Order Grid</span>
        <button class="btn btn-ims btn-sm2" id="newWoBtn"><i class="bi bi-plus-lg"></i> New Work Order</button></div>
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
          </tr>`).join("")}
        </tbody></table>
      </div>
    </div>`;
  $("#newWoBtn").addEventListener("click", workOrderModal);
  /* Clicking a work order row opens the edit modal. */
  $$("#content tr[data-edit]").forEach(tr => tr.addEventListener("click", e => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const wo = IMS.workOrders.find(x => x.woId === tr.dataset.edit);
    if (wo) workOrderModal(wo);
  }));
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

/* =========================================================
   STAGE 5 — LABOR & TIME ALLOCATION
   ========================================================= */
function renderTimesheet(){
  const rows = IMS.timesheets.map(ts => {
    const e = IMS.labor.find(x => x.empId === ts.empId);
    const targetLabel = ts.targetType === "contract"
      ? (getContract(ts.targetId) || { projectName: ts.targetId }).projectName
      : ((IMS.workOrders.find(w => w.woId === ts.targetId) || {}).woId || ts.targetId);
    return { ...ts, emp: e, targetLabel, cost: (e ? e.hourlyCost : 0) * ts.hours, bill: (e ? e.hourlyBillable : 0) * ts.hours };
  });
  const totCost = rows.reduce((s, r) => s + r.cost, 0);
  const totBill = rows.reduce((s, r) => s + r.bill, 0);
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-clock-history"></i> Timesheet Grid</span>
        <button class="btn btn-ims btn-sm2" id="punchBtn"><i class="bi bi-stopwatch"></i> Punch Time</button></div>
      <div class="card-body table-wrap">
        <table class="table"><thead><tr>
          <th>Entry</th><th>Employee</th><th>Role</th><th>Date</th><th class="num">Hours</th><th>Target</th><th class="num">Cost</th><th class="num">Billable</th><th class="num">Spread</th>
        </tr></thead><tbody>
          ${rows.map(r => `<tr>
            <td class="strong mono">${r.tsId}</td>
            <td class="strong">${r.emp ? r.emp.name : r.empId}</td>
            <td>${r.emp ? r.emp.role : ""}</td>
            <td class="mono text-muted2">${fmtDate(r.date)}</td>
            <td class="num">${r.hours}</td>
            <td><span class="badge-status ${r.targetType === "contract" ? "st-onrent" : "st-inshop"}">${r.targetType === "contract" ? "<i class=\"bi bi-briefcase\"></i> Job" : "<i class=\"bi bi-wrench-adjustable\"></i> WO"}: ${r.targetLabel}</span></td>
            <td class="num">${fmtMoney(r.cost)}</td>
            <td class="num">${fmtMoney(r.bill)}</td>
            <td class="num">${fmtMoney(r.bill - r.cost)}</td>
          </tr>`).join("")}
        </tbody></table>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-header"><span class="card-title"><i class="bi bi-cash-stack"></i> Labor Cost Window</span></div>
      <div class="card-body">
        <div class="list-line"><span class="l">Total Direct Labor Cost</span><span class="r">${fmtMoney(totCost)}</span></div>
        <div class="list-line"><span class="l">Total Billable Labor Value</span><span class="r">${fmtMoney(totBill)}</span></div>
        <div class="list-line"><span class="l">Contribution to Contract Profit</span><span class="r text-success">${fmtMoney(totBill - totCost)}</span></div>
      </div>
    </div>`;
  $("#punchBtn").addEventListener("click", timesheetModal);
}

function nextTsNum(){
  let max = 0;
  IMS.timesheets.forEach(t => { const n = parseInt(t.tsId.split("-")[1], 10); if (n > max) max = n; });
  return max + 1;
}

function timesheetModal(){
  openFormModal({
    id: "mdl-ts", title: "Punch Time Entry", icon: "bi-stopwatch",
    fields: [
      { key:"empId", label:"Employee", type:"select", value: IMS.labor[0].empId, options: IMS.labor.map(e => ({ value:e.empId, label:`${e.empId} — ${e.name} (${e.role})` })) },
      { key:"date", label:"Work Date", type:"date", value:"2026-09-01" },
      { key:"hours", label:"Hours", type:"number", value:8 },
      { key:"target", label:"Target (Job / Work Order)", type:"select", value:"contract|CT-2024-001", options: [
        ...IMS.contracts.map(c => ({ value:"contract|" + c.contractId, label:"Job: " + c.contractId + " — " + c.projectName })),
        ...IMS.workOrders.map(w => ({ value:"workorder|" + w.woId, label:"WO: " + w.woId + " — " + w.assetId }))
      ] }
    ],
    onSave: v => {
      const [targetType, targetId] = v.target.split("|");
      IMS.timesheets.push({ tsId:"TS-" + pad2(nextTsNum()), empId:v.empId, date:v.date, hours:parseFloat(v.hours) || 0, targetType, targetId });
      renderTimesheet();
    }
  });
}

/* =========================================================
   STAGE 6 — EXECUTIVE DASHBOARD
   ========================================================= */
function fleetKPIs(){
  const fleet = IMS.serializedAssets.length;
  const onRent = IMS.serializedAssets.filter(a => a.status === "On Rent").length;
  const book = IMS.serializedAssets.reduce((s, a) => s + a.purchaseValue, 0);
  const alerts = App.breachAlerts.filter(a => a.kind === "breach").length;
  let run = 0;
  IMS.contracts.filter(c => c.status === "active").forEach(c => {
    const t = contractTotals(c);
    if (t.days) run += t.gross / t.days * 365;
  });
  return { fleet, onRent, util: fleet ? onRent / fleet * 100 : 0, book, alerts, run };
}

function renderDashboard(){
  const k = fleetKPIs();
  const active = IMS.contracts.filter(c => c.status === "active");
  const reorders = [
    ...IMS.consumables.filter(c => c.qtyOnHand <= c.reorderPoint).map(c => ({ type:"consumable", ref:c.sku, label:c.name, qtyOnHand:c.qtyOnHand, reorderPoint:c.reorderPoint })),
    ...IMS.parts.filter(p => p.qtyOnHand <= p.reorderPoint).map(p => ({ type:"part", ref:p.partId, label:p.description, qtyOnHand:p.qtyOnHand, reorderPoint:p.reorderPoint }))
  ];
  const recent = App.breachAlerts.slice().reverse().slice(0, 6);
  const byStatus = {};
  IMS.serializedAssets.forEach(a => byStatus[a.status] = (byStatus[a.status] || 0) + 1);
  const stKeys = ["Available", "On Rent", "In Shop", "Staged"];

  $("#content").innerHTML = `
    <div class="page-head">
      <button class="btn btn-ims" onclick="showView('scheduler')"><i class="bi bi-calendar3"></i> Open Scheduler</button>
    </div>

    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-icon kpi-blue"><i class="bi bi-safe"></i></div>
        <div><div class="kpi-label">Total Fleet Book Value</div><div class="kpi-value">${fmtMoney(k.book)}</div><div class="kpi-sub">${k.fleet} serialized units</div></div></div>
      <div class="kpi"><div class="kpi-icon kpi-green"><i class="bi bi-arrow-repeat"></i></div>
        <div><div class="kpi-label">Physical Utilization Rate</div><div class="kpi-value">${fmtPct(k.util)}</div><div class="kpi-sub">${k.onRent} of ${k.fleet} on rent</div></div></div>
      <div class="kpi"><div class="kpi-icon kpi-red"><i class="bi bi-sign-stop"></i></div>
        <div><div class="kpi-label">Out-of-Geofence Alerts</div><div class="kpi-value">${k.alerts}</div><div class="kpi-sub">live breach stream</div></div></div>
      <div class="kpi"><div class="kpi-icon kpi-purple"><i class="bi bi-graph-up-arrow"></i></div>
        <div><div class="kpi-label">Active Revenue Run-Rate</div><div class="kpi-value">${fmtMoney(k.run)}</div><div class="kpi-sub">annualized / yr</div></div></div>
    </div>

    <div class="dash-grid">
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-briefcase"></i> Active Contracts — Profitability</span></div>
          <div class="card-body table-wrap">
            <table class="table"><thead><tr><th>Contract</th><th>Project</th><th class="num">Days</th><th class="num">Gross Billing</th><th class="num">Net Profit</th><th class="num">Margin</th></tr></thead><tbody>
              ${active.map(c => { const t = contractTotals(c); return `<tr>
                <td class="strong mono">${c.contractId}</td>
                <td>${c.projectName}<div class="text-muted2" style="font-size:11px">${c.customer}</div></td>
                <td class="num">${t.days}</td>
                <td class="num">${fmtMoney(t.gross)}</td>
                <td class="num ${t.net < 0 ? "text-danger" : ""}">${fmtMoney(t.net)}</td>
                <td class="num"><span class="badge-status ${t.margin >= 30 ? "st-available" : t.margin >= 10 ? "st-reorder" : "st-out"}">${fmtPct(t.margin)}</span></td>
              </tr>`; }).join("") || `<tr><td colspan="6" class="text-center text-muted2 py-3">No active contracts</td></tr>`}
            </tbody></table>
          </div>
        </div>
        <div class="card" style="margin-top:18px">
          <div class="card-header"><span class="card-title"><i class="bi bi-exclamation-triangle"></i> Reorder Warnings — Consumables & Stock</span>
            <span class="badge-status st-reorder">${reorders.length}</span></div>
          <div class="card-body">
            ${reorders.map(c => `<div class="list-line">
              <span class="l">${c.ref} · ${c.label}</span>
              <span class="r d-flex align-items-center gap-2"><span class="text-danger">${fmtInt(c.qtyOnHand)} / @ ${fmtInt(c.reorderPoint)}</span>
                <button class="btn btn-ims btn-sm2" data-reorder="${c.type}:${c.ref}"><i class="bi bi-arrow-repeat"></i> Reorder</button></span>
            </div>`).join("") || `<p class="text-muted2 py-2">All stock above reorder point.</p>`}
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-broadcast"></i> Recent Geofence Alerts</span></div>
          <div class="card-body">
            ${recent.map(a => `<div class="mini-alert"><i class="bi bi-exclamation-triangle-fill"></i><span>${a.msg}</span></div>`).join("") || `<p class="text-muted2 py-2">No alerts yet.</p>`}
          </div>
        </div>
        <div class="card" style="margin-top:18px">
          <div class="card-header"><span class="card-title"><i class="bi bi-pie-chart"></i> Fleet Status Breakdown</span></div>
          <div class="card-body">
            ${stKeys.map(s => `<div class="list-line"><span class="l">${statusBadge(s)}</span><span class="r">${byStatus[s] || 0}</span></div>`).join("")}
          </div>
        </div>
        <div class="card" style="margin-top:18px">
          <div class="card-header"><span class="card-title"><i class="bi bi-boxes"></i> Bulk Resources Out</span></div>
          <div class="card-body">
            ${IMS.bulkResources.map(b => `<div class="list-line"><span class="l">${b.sku} · ${b.name}</span><span class="r">${fmtInt(b.qtyOut)} / ${fmtInt(b.totalOwned)} out</span></div>`).join("")}
          </div>
        </div>
      </div>
    </div>`;
  $$("[data-reorder]").forEach(b => b.addEventListener("click", () => {
    const [type, ref] = b.dataset.reorder.split(":");
    triggerReorder(type, ref);
  }));
}

/* Trigger a reorder for a low-stock consumable or stock part (restocks to 2x reorder point). */
function triggerReorder(type, ref){
  const r = type === "part"
    ? IMS.parts.find(p => p.partId === ref)
    : IMS.consumables.find(c => c.sku === ref);
  if (!r) return;
  const restock = Math.max((r.reorderPoint || 0) * 2, 1);
  r.qtyOnHand = restock;
  renderDashboard();
  updateBadges();
}

/* =========================================================
   PHASE 2 — PART 1: KITS & ATTACHMENTS
   ========================================================= */
function kitsList(){
  const cards = IMS.kits.map(k => {
    const comps = k.components.map(c => {
      const r = getResource({ type:c.refType, refId:c.refId });
      const rname = r ? (c.refType === "serialized" ? r.make + " " + r.model : r.name) : c.refId;
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
  const rows = IMS.attachments.map(a => {
    const links = IMS.assetAttachments.filter(x => x.accId === a.accId).map(x => x.assetId).join(", ") || "—";
    return `<tr data-edit="${a.accId}">
      <td class="strong mono">${a.accId}</td>
      <td>${a.name}</td>
      <td>${a.category}</td>
      <td class="num">${a.qtyOwned}</td>
      <td class="num">${fmtMoney(a.daily)}</td>
      <td class="mono">${(a.fits || []).join(", ")}</td>
      <td class="mono">${links}</td>
      <td>${activeCell(a)}</td>
      <td class="text-end"><button class="btn btn-ims-outline btn-sm2" data-aedit="${a.accId}"><i class="bi bi-pencil"></i></button></td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Acc ID</th><th>Name</th><th>Category</th><th class="num">Qty Owned</th><th class="num">Daily</th><th>Fits</th><th>Linked Assets</th><th>Status</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(9)}</tbody></table></div>`;
}

function resOptions(){
  let o = `<option value="">— select component —</option>`;
  IMS.serializedAssets.forEach(a => o += `<option value="serialized|${a.id}">[Serialized] ${a.id} · ${a.make} ${a.model}</option>`);
  IMS.bulkResources.forEach(b => o += `<option value="bulk|${b.sku}">[Bulk] ${b.sku} · ${b.name}</option>`);
  IMS.consumables.forEach(c => o += `<option value="consumable|${c.sku}">[Consumable] ${c.sku} · ${c.name}</option>`);
  return o;
}

function nextKitId(){
  let max = 0;
  IMS.kits.forEach(k => { const n = parseInt(k.kitId.split("-")[1], 10); if (n > max) max = n; });
  return "KT-" + String(max + 1).padStart(3, "0");
}

function compRow(c, i){
  const r = getResource({ type:c.refType, refId:c.refId });
  const rname = r ? (c.refType === "serialized" ? r.make + " " + r.model : r.name) : c.refId;
  return `<div class="list-line"><span class="l"><span class="type-chip tc-${c.refType}">${c.refType}</span> ${c.qty} × ${rname} <span class="mono">${c.refId}</span></span>
    <span class="r"><button class="remove" data-rem="${i}"><i class="bi bi-x-circle"></i></button></span></div>`;
}

function renderKitComps(root, kit){
  const box = root.querySelector("#k-comps");
  box.innerHTML = kit.components.map((c, i) => compRow(c, i)).join("") || `<p class="text-muted2 py-2">No components bound yet.</p>`;
}

function kitModal(existing){
  const isEdit = !!existing;
  const kit = existing || { kitId: nextKitId(), name:"", baseRate:0, qtyOwned:1, components:[], active:true };
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
    kit.active = root.querySelector("#k-active").checked;
    if (!isEdit) IMS.kits.push(kit);
    renderInventory();
    dismissModal(root);
  });
}

function assetIdChecks(cats, selected){
  const list = cats && cats.length ? IMS.serializedAssets.filter(a => cats.includes(a.category)) : [];
  return list.map(a => `<label class="check-line ${(selected || []).includes(a.id) ? "checked" : ""}"><input type="checkbox" value="${a.id}" ${(selected || []).includes(a.id) ? "checked" : ""}>${a.id} — ${a.make} ${a.model}</label>`).join("") || `<div class="text-muted2 py-2">Select a category above to see matching assets.</div>`;
}

function catChecks(cats, selected){
  return cats.map(c => `<label class="check-line ${selected.includes(c) ? "checked" : ""}"><input type="checkbox" value="${c}" ${selected.includes(c) ? "checked" : ""}>${c}</label>`).join("");
}

function attachmentModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  const cats = [...new Set(IMS.serializedAssets.map(a => a.category))].sort();
  const fits = e.fits || [];
  const selCats = cats.filter(c => fits.some(id => { const a = getAsset(id); return a && a.category === c; }));
  const body = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="a-active" ${recActive(e) ? "checked" : ""}><label class="form-check-label" for="a-active"><strong>Active</strong></label></div>
      <span class="text-muted2" style="font-size:11.5px">Inactive attachments are not selectable</span>
    </div>
    <div class="row g-3">
      <div class="col-md-4 field-group"><label class="form-label">Attachment ID</label><input class="form-control" id="a-accid" value="${e.accId || "ACC-" + String(IMS.attachments.length + 1).padStart(3, "0")}"></div>
      <div class="col-md-4 field-group"><label class="form-label">Name</label><input class="form-control" id="a-name" value="${e.name || ""}"></div>
      <div class="col-md-4 field-group"><label class="form-label">Category</label><select class="form-select" id="a-cat">${["Bucket","Carriage","Platform","Hydraulic","Lifting"].map(c => `<option ${c === (e.category || "Bucket") ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="col-md-3 field-group"><label class="form-label">Qty Owned</label><input class="form-control" id="a-qty" type="number" value="${e.qtyOwned || 0}"></div>
      <div class="col-md-3 field-group"><label class="form-label">Daily Rate ($)</label><input class="form-control" id="a-daily" type="number" value="${e.daily || 0}"></div>
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
      accId: root.querySelector("#a-accid").value || ("ACC-" + String(IMS.attachments.length + 1).padStart(3, "0")),
      name: root.querySelector("#a-name").value,
      category: root.querySelector("#a-cat").value,
      qtyOwned: parseFloat(root.querySelector("#a-qty").value) || 0,
      daily: parseFloat(root.querySelector("#a-daily").value) || 0,
      active: root.querySelector("#a-active").checked,
      fits: Array.from(root.querySelectorAll("#a-ids input:checked")).map(i => i.value)
    };
    if (isEdit) Object.assign(existing, rec);
    else IMS.attachments.push(rec);
    renderInventory();
    dismissModal(root);
  });
}

function meterOverage(insp){
  if (insp.direction !== "Check-In" || insp.meterIn == null || insp.meterOut == null) return null;
  const contract = getContract(insp.contractId);
  const days = contract ? daysBetween(contract.startDate, contract.endDate) : 1;
  const P = IMS.settings.pricing;
  const allowed = days >= 7 ? P.weeklyHours : P.dailyMinHours * days;
  const used = insp.meterIn - insp.meterOut;
  const overage = used - allowed;
  return overage > 0 ? { used, allowed, overage } : null;
}

function getLastMeter(assetId){
  const last = IMS.inspections.filter(x => x.assetId === assetId && x.direction === "Check-Out").slice(-1)[0];
  return last ? last.meterOut : 0;
}

function renderYard(){
  const checks = ["tires","fluids","guards","lights","engine"];
  const checkLabels = { tires:"Tires / Tracks", fluids:"Fluids", guards:"Safety Guards", lights:"Lights", engine:"Engine" };
  const assetOpts = IMS.serializedAssets.map(a => `<option value="${a.id}">${a.id} — ${a.make} ${a.model}</option>`).join("");
  const contractOpts = IMS.contracts.map(c => `<option value="${c.contractId}">${c.contractId} — ${c.projectName}</option>`).join("");
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="split-layout">
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-clipboard-check"></i> Asset In / Out Inspection</span>
            <button class="btn btn-ims btn-sm2" id="inspSave"><i class="bi bi-check2-square"></i> Log Inspection</button></div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-6 field-group"><label class="form-label">Asset</label><select class="form-select" id="i-asset">${assetOpts}</select></div>
              <div class="col-md-6 field-group"><label class="form-label">Contract</label><select class="form-select" id="i-contract"><option value="">— none —</option>${contractOpts}</select></div>
              <div class="col-md-6 field-group"><label class="form-label">Direction</label><select class="form-select" id="i-dir"><option>Check-Out</option><option>Check-In</option></select></div>
              <div class="col-md-6 field-group"><label class="form-label">Date</label><input class="form-control" id="i-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
            </div>
            <div class="strong mb-2">Telemetry Verification</div>
            <div class="row g-2 mb-2">
              ${checks.map(k => `<div class="col-md-6"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="i-${k}" checked><label class="form-check-label" for="i-${k}">${checkLabels[k]}</label></div></div>`).join("")}
            </div>
            <div class="row g-2">
              <div class="col-md-6 field-group"><label class="form-label">Current Meter Hours</label><input class="form-control" id="i-meter" type="number" value="0"></div>
              <div class="col-md-6 field-group"><label class="form-label">Fuel Level %</label><input class="form-control" id="i-fuel" type="number" min="0" max="100" value="100"></div>
            </div>
            <div id="i-overage"></div>
            <div class="divider"></div>
            <div class="strong mb-2">Damage / Scratches</div>
            <div class="photo-drop">
              <i class="bi bi-camera"></i>
              <div>Upload site photos<br><span class="text-muted2">Tap to capture scratch / damage evidence</span></div>
              <button class="btn btn-ims-outline btn-sm2" type="button" data-filebtn>Choose File</button>
              <input type="file" multiple accept="image/*" hidden>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-list-check"></i> Inspection Log</span>
            <span class="text-muted2" style="font-weight:500">${IMS.inspections.length} records</span></div>
          <div class="card-body table-wrap">
            <table class="table"><thead><tr><th>Insp #</th><th>Asset</th><th>Dir</th><th class="num">Meter Out</th><th class="num">Meter In</th><th class="num">Fuel</th><th class="num">Checks</th><th>Status</th><th>Overage</th></tr></thead>
            <tbody id="inspTbody"></tbody></table>
          </div>
        </div>
      </div>
    </div>`;
  $$("[data-filebtn]").forEach(b => b.addEventListener("click", () => b.parentElement.querySelector("input[type=file]").click()));
  $("#i-meter").addEventListener("input", updateOveragePreview);
  $("#i-dir").addEventListener("change", updateOveragePreview);
  $("#i-contract").addEventListener("change", updateOveragePreview);
  $("#inspSave").addEventListener("click", () => {
    const dir = $("#i-dir").value;
    const meter = parseFloat($("#i-meter").value) || 0;
    const assetId = $("#i-asset").value;
    IMS.inspections.push({
      inspId:"INSP-" + String(IMS.inspections.length + 1).padStart(3, "0"),
      assetId, contractId: $("#i-contract").value || null, direction: dir, date: $("#i-date").value,
      meterOut: dir === "Check-Out" ? meter : getLastMeter(assetId),
      meterIn: dir === "Check-In" ? meter : null,
      fuelOut: parseFloat($("#i-fuel").value) || 0, fuelIn: null,
      checks: { tires:$("#i-tires").checked, fluids:$("#i-fluids").checked, guards:$("#i-guards").checked, lights:$("#i-lights").checked, engine:$("#i-engine").checked },
      photos: 1, status: dir === "Check-In" ? "Closed" : "Open"
    });
    renderYard();
  });
  renderInspLog();
  updateOveragePreview();
}

function renderInspLog(){
  const tbody = $("#inspTbody");
  if (!tbody) return;
  tbody.innerHTML = IMS.inspections.map(insp => {
    const a = getAsset(insp.assetId);
    const ov = meterOverage(insp);
    const checksDone = Object.values(insp.checks || {}).filter(Boolean).length;
    return `<tr data-edit="${insp.inspId}">
      <td class="strong mono">${insp.inspId}</td>
      <td class="strong">${insp.assetId} <span class="text-muted2">${a ? a.model : ""}</span></td>
      <td>${insp.direction}</td>
      <td class="num">${insp.meterOut ?? "—"}</td>
      <td class="num">${insp.meterIn ?? "—"}</td>
      <td class="num">${insp.fuelOut}%${insp.fuelIn != null ? " → " + insp.fuelIn + "%" : ""}</td>
      <td class="num">${checksDone}/5</td>
      <td>${statusBadge(insp.status)}</td>
      <td>${ov ? `<span class="badge-status st-reorder"><i class="bi bi-exclamation-triangle"></i>${fmtInt(ov.overage)} hr</span>` : `<span class="text-muted2">—</span>`}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="9" class="text-center text-muted2 py-3">No inspections logged.</td></tr>`;
  /* Clicking an inspection row opens the edit modal. */
  $$("#inspTbody tr[data-edit]").forEach(tr => tr.addEventListener("click", e => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const insp = IMS.inspections.find(x => x.inspId === tr.dataset.edit);
    if (insp) inspectionModal(insp);
  }));
}

/* Edit an inspection log record. */
function inspectionModal(existing){
  const e = existing || {};
  const checks = ["tires","fluids","guards","lights","engine"];
  const checkLabels = { tires:"Tires / Tracks", fluids:"Fluids", guards:"Safety Guards", lights:"Lights", engine:"Engine" };
  const assetOpts = IMS.serializedAssets.map(a => ({ value:a.id, label:`${a.id} — ${a.make} ${a.model}` }));
  const fields = [
    { key:"assetId", label:"Asset", type:"select", value:e.assetId, options:assetOpts },
    { key:"direction", label:"Direction", type:"select", value:e.direction || "Check-Out", options:opt(["Check-Out","Check-In"]) },
    { key:"status", label:"Status", type:"select", value:e.status || "Open", options:opt(["Open","Closed"]) },
    { key:"meterOut", label:"Meter Out", type:"number", value:e.meterOut ?? "" },
    { key:"meterIn", label:"Meter In", type:"number", value:e.meterIn ?? "" },
    { key:"fuelOut", label:"Fuel Out %", type:"number", value:e.fuelOut || 0 },
    { key:"fuelIn", label:"Fuel In %", type:"number", value:e.fuelIn ?? "" }
  ];
  checks.forEach(k => fields.push({ key:"chk_" + k, label:checkLabels[k], type:"checkbox", value: !!(e.checks || {})[k] }));
  openFormModal({
    id: "mdl-insp", title: "Edit Inspection " + (e.inspId || ""), icon: "bi-clipboard-check",
    fields,
    onSave: v => {
      const rec = {
        assetId:v.assetId, direction:v.direction, status:v.status,
        fuelOut:v.fuelOut, fuelIn:v.fuelIn,
        checks: Object.fromEntries(checks.map(k => [k, !!v["chk_" + k]]))
      };
      if (v.meterOut !== 0 || e.meterOut != null) rec.meterOut = v.meterOut;
      if (v.meterIn !== 0 || e.meterIn != null) rec.meterIn = v.meterIn;
      Object.assign(existing, rec);
      renderYard();
    }
  });
}

function updateOveragePreview(){
  const box = $("#i-overage");
  if (!box) return;
  const dir = $("#i-dir").value;
  const assetId = $("#i-asset").value;
  if (dir !== "Check-In") { box.innerHTML = ""; return; }
  const meterIn = parseFloat($("#i-meter").value) || 0;
  const meterOut = getLastMeter(assetId);
  const contract = getContract($("#i-contract").value) || null;
  const days = contract ? daysBetween(contract.startDate, contract.endDate) : 1;
  const P = IMS.settings.pricing;
  const allowed = days >= 7 ? P.weeklyHours : P.dailyMinHours * days;
  const used = meterIn - meterOut;
  const overage = used - allowed;
  box.innerHTML = overage > 0
    ? `<div class="alert-line breach" style="margin-top:8px"><span class="ts">LIVE</span><span><strong>Overage Fees Apply:</strong> ${fmtInt(overage)} Hours Overage Detected (${fmtInt(used)} used vs ${fmtInt(allowed)} allowed)</span></div>`
    : `<div class="alert-line info" style="margin-top:8px"><span class="ts">LIVE</span><span>Within limit — ${fmtInt(Math.max(0, allowed - used))} hrs remaining (${fmtInt(used)} of ${fmtInt(allowed)} allowed)</span></div>`;
}

function renderLogistics(){
  const cdls = IMS.labor.filter(e => (e.certs || []).includes("CDL"));
  const driverOpts = cdls.map(e => `<option value="${e.empId}">${e.empId} — ${e.name}</option>`).join("");
  const truckOpts = IMS.vehicles.map(v => `<option value="${v.truckId}">${v.truckId} — ${v.name}</option>`).join("");
  const statuses = ["Staged","En Route","Delivered","Pending Return"];
  const statusOpts = s => statuses.map(x => `<option ${x === s ? "selected" : ""}>${x}</option>`).join("");
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="split-layout">
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-inbox"></i> Pending Dispatches</span>
            <span class="badge-status st-reorder">${IMS.dispatches.filter(d => d.status === "Staged").length} staged</span></div>
          <div class="card-body">
            ${IMS.dispatches.filter(d => d.status === "Staged").map(d => {
              const con = getContract(d.contractId);
              return `<div class="staged-item"><div>
                <span class="tag">${d.dispatchId}</span> <span class="strong">${d.assetId}</span><br>
                <span class="text-muted2" style="font-size:11.5px">${con ? con.jobSite : ""}</span><br>
                <span class="mono text-muted2" style="font-size:11px">${con ? con.siteLat.toFixed(4) + ", " + con.siteLng.toFixed(4) : ""}</span>
              </div><div class="text-end">
                <div class="text-muted2" style="font-size:11px">${con ? con.contractId : ""}</div>
                <button class="btn btn-ims btn-sm2" data-dispatch="${d.dispatchId}">Assign</button>
              </div></div>`;
            }).join("") || `<p class="text-muted2 py-3 text-center">No pending staged dispatches.</p>`}
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-truck"></i> Driver Assignment Grid</span>
            <button class="btn btn-ims btn-sm2" id="dspSave"><i class="bi bi-check2-all"></i> Apply Assignments</button></div>
          <div class="card-body table-wrap">
            <table class="table"><thead><tr><th class="num">Route</th><th>Dispatch</th><th>Asset</th><th>Site</th><th>Driver (CDL)</th><th>Truck</th><th>Status</th></tr></thead>
            <tbody>${IMS.dispatches.map(d => {
              const con = getContract(d.contractId);
              return `<tr>
                <td class="num">${d.routeSeq}</td>
                <td class="strong mono">${d.dispatchId}</td>
                <td class="strong">${d.assetId}</td>
                <td class="text-muted2" style="font-size:11.5px">${con ? con.projectName : ""}</td>
                <td><select class="form-select" data-ddrv="${d.dispatchId}"><option value="">— none —</option>${driverOpts}</select></td>
                <td><select class="form-select" data-dtrk="${d.dispatchId}"><option value="">— none —</option>${truckOpts}</select></td>
                <td><select class="form-select" data-dsta="${d.dispatchId}">${statusOpts(d.status)}</select></td>
              </tr>`;
            }).join("")}</tbody></table>
          </div>
        </div>
      </div>
    </div>`;
  IMS.dispatches.forEach(d => {
    if (d.driverId) { const s = $(`[data-ddrv="${d.dispatchId}"]`); if (s) s.value = d.driverId; }
    if (d.truckId) { const s = $(`[data-dtrk="${d.dispatchId}"]`); if (s) s.value = d.truckId; }
  });
  $("#dspSave").addEventListener("click", () => {
    IMS.dispatches.forEach(d => {
      const drv = $(`[data-ddrv="${d.dispatchId}"]`); if (drv) d.driverId = drv.value || null;
      const trk = $(`[data-dtrk="${d.dispatchId}"]`); if (trk) d.truckId = trk.value || null;
      const sta = $(`[data-dsta="${d.dispatchId}"]`); if (sta) d.status = sta.value;
      if (trk && trk.value) { const v = IMS.vehicles.find(x => x.truckId === trk.value); if (v) v.status = (sta && sta.value === "En Route") ? "En Route" : "Available"; }
    });
    renderLogistics();
  });
  $$("[data-dispatch]").forEach(b => b.addEventListener("click", () => {
    const d = IMS.dispatches.find(x => x.dispatchId === b.dataset.dispatch);
    if (!d) return;
    const drv = $(`[data-ddrv="${d.dispatchId}"]`), sta = $(`[data-dsta="${d.dispatchId}"]`);
    if (drv && !d.driverId && cdls[0]) drv.value = cdls[0].empId;
    if (sta && d.status === "Staged") sta.value = "En Route";
  }));
}

function addDays(dateStr, days){
  const d = parseDT(dateStr);
  d.setDate(d.getDate() + days);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function invStatus(inv){ return inv.status || (inv.paid ? "invoiced" : "pending"); }
function invStatusLabel(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
function invStatusBadge(inv){
  const s = invStatus(inv);
  const cls = s === "paid" ? "st-active" : s === "invoiced" ? "st-onrent" : "st-out";
  return `<span class="badge-status ${cls}">${invStatusLabel(s)}</span>`;
}

/* Billable day count over [s, e], honoring the line item's weekend policy. */
function billableDays(li, c, s, e){
  const days = Math.max(1, Math.round((e - s) / 86400000));
  if (li.weekendPolicy === "skip")            return countWeekdays(toISO(s), toISO(e));
  if (li.weekendPolicy === "overtime")        return days * 1.5;
  return days;
}

/* Calendar-day offset between two dates (local midnight, DST-safe). */
function dayOffset(from, to){
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

/* Whole billing units (anchored at the rental start, unitDays long) to bill in the
   cycle whose first day is sDay and last day is eDay (day-indices within the rental).

   Each unit is billed in the cycle that contains the MAJORITY of its booked days,
   using the unit's upper-median day to break ties toward the LATER cycle. This is what
   "advance weekly time to the next cycle" means: if more of a week falls in the next
   cycle (or it splits evenly), the whole week is billed in the later cycle instead of
   the current one. Every unit lands in exactly one cycle, so summing cycles never
   double-bills and always equals the full-contract total. */
function wholeUnitsBilled(anchor, sDay, eDay, unitDays, totalDays){
  if (eDay < sDay) return 0;
  const n = Math.ceil(totalDays / unitDays);
  let count = 0;
  for (let k = 0; k < n; k++){
    const us = k * unitDays;                              /* first day of unit */
    const ue = Math.min((k + 1) * unitDays - 1, totalDays - 1); /* last day of unit */
    if (ue < sDay) continue;
    const billDay = us + Math.ceil((ue - us) / 2);        /* upper-median day (tie -> later) */
    if (billDay >= sDay && billDay <= eDay) count++;
  }
  return count;
}

/* Accurate amount billed for a line item within [pStartISO, pEndISO], honoring the
   daily / weekly / monthly billing rules (weekly & monthly bill in WHOLE units — never
   prorated by the day) and the weekend policy. One-time charges (labor, consumable,
   part, flat) are billed in full only in the period that contains the rental start so
   they are never double-billed across cycles. */
function liAmountForPeriod(li, c, pStartISO, pEndISO){
  const r = getResource(li);
  if (!r) return 0;
  const liS = parseDT(liStart(li, c)), liE = parseDT(liEnd(li, c));
  const pS = parseDT(pStartISO), pE = parseDT(pEndISO);
  const s = liS.getTime() > pS.getTime() ? liS : pS;
  const e = liE.getTime() < pE.getTime() ? liE : pE;
  if (s > e) return 0; /* no overlap with the period */
  const qty = li.qty || 1;
  const premium = RISK_PREMIUM[li.riskPremium || "standard"] || 0;
  const startsHere = liS.getTime() >= pS.getTime() && liS.getTime() < pE.getTime();

  /* one-time charges: billed once, in the period that contains the rental start */
  if (li.type === "labor")       return startsHere ? Math.round(qty * (r.hourlyBillable || 0) * 100) / 100 : 0;
  if (li.type === "consumable")  return startsHere ? Math.round(qty * (r.retailPrice || 0) * 100) / 100 : 0;
  if (li.type === "part")        return startsHere ? Math.round(qty * (r.costPrice || 0) * 100) / 100 : 0;
  if (li.pricingMatrix === "flat") return startsHere ? Math.round((Number(li.flatTotal) || 0) * qty * (1 + premium) * 100) / 100 : 0;

  /* kits + attachments (daily rate billing) */
  if (li.type === "kit" || li.type === "attachment"){
    const rate = li.type === "kit" ? (r.baseRate || 0) : (r.daily || 0);
    let days = billableDays(li, c, s, e);
    if (li.pricingMatrix === "min") days = Math.max(days, 3);
    return Math.round(rate * days * qty * (1 + premium) * 100) / 100;
  }

  /* equipment (serialized + bulk) */
  const totalDays = daysBetween(liStart(li, c), liEnd(li, c));
  const sDay = Math.max(0, dayOffset(liS, s));
  /* Date-only cycle ends ("2026-08-27") are EXCLUSIVE boundaries (last billed day is the
     day before), while datetime ends ("2026-09-30T17:00", contract/rental end) are
     INCLUSIVE. Compute the last billed day honoring both plus the rental's own end. */
  const rawEnd = String(pEndISO);
  const endHasTime = rawEnd.includes(":") || rawEnd.includes("T");
  const pELast = dayOffset(liS, pE) - (endHasTime ? 0 : 1);
  const liELast = dayOffset(liS, liE); /* contract end is inclusive */
  const eDay = Math.max(sDay, Math.min(pELast, liELast, totalDays - 1));
  if (totalDays >= 28) return Math.round(wholeUnitsBilled(liS, sDay, eDay, 28, totalDays) * (r.baseMonthly || 0) * qty * (1 + premium) * 100) / 100;
  if (totalDays >= 7)  return Math.round(wholeUnitsBilled(liS, sDay, eDay, 7, totalDays)  * (r.baseWeekly || 0) * qty * (1 + premium) * 100) / 100;
  let days = billableDays(li, c, s, e);
  if (li.pricingMatrix === "min") days = Math.max(days, 3);
  return Math.round((r.baseDaily || 0) * days * qty * (1 + premium) * 100) / 100;
}

/* Equipment rental gross actually billed during a period (whole units + one-time items). */
function contractRentalForPeriod(c, startISO, endISO){
  return Math.round(((c.lineItems || []).reduce((sum, li) => sum + liAmountForPeriod(li, c, startISO, endISO), 0)) * 100) / 100;
}

function invTaxRate(inv){ return inv.taxRate != null ? inv.taxRate : (IMS.settings.taxSchedules[0] ? IMS.settings.taxSchedules[0].rate : 0); }

function invoiceCompute(inv){
  const con = getContract(inv.contractId);
  const base = inv.baseAmount != null ? inv.baseAmount : (con ? contractTotals(con).equipmentGross : 0);
  const envFee = Math.round(base * (inv.envFeePct || IMS.settings.pricing.envFeePct) / 100 * 100) / 100;
  const waiver = inv.damageWaiver ? Math.round(base * 0.03 * 100) / 100 : 0;
  const fuel = inv.fuelCharge || 0;
  const tax = Math.round((base + envFee + fuel + waiver) * invTaxRate(inv) * 100) / 100;
  const total = Math.round((base + envFee + fuel + waiver + tax) * 100) / 100;
  return { base, envFee, waiver, fuel, tax, total };
}

function renderInvoicing(){
  const filtered = App.invFilter === "pending" ? IMS.invoices.filter(i => invStatus(i) === "pending") : App.invFilter === "invoiced" ? IMS.invoices.filter(i => invStatus(i) === "invoiced") : App.invFilter === "paid" ? IMS.invoices.filter(i => invStatus(i) === "paid") : IMS.invoices;
  const rows = filtered.map(inv => {
    const t = invoiceCompute(inv);
    return `<tr data-edit="${inv.invId}">
      <td class="strong mono">${inv.invId}</td>
      <td class="strong mono">${inv.contractId}</td>
      <td>Cycle ${inv.cycle}<div class="text-muted2" style="font-size:11px">${fmtDate(inv.cycleStart)} — ${fmtDate(inv.cycleEnd)}</div></td>
      <td class="num">${fmtMoney(t.base)}</td>
      <td class="num">${fmtMoney(t.envFee)}</td>
      <td class="num">${fmtMoney(t.fuel)}</td>
      <td class="num">${t.waiver ? fmtMoney(t.waiver) : "—"}</td>
      <td class="num strong">${fmtMoney(t.total)}</td>
      <td>${invStatusBadge(inv)}</td>
    </tr>`;
  }).join("");
  const totInvoiced = IMS.invoices.reduce((s, inv) => s + invoiceCompute(inv).total, 0);
  const totCollected = IMS.invoices.filter(i => invStatus(i) !== "pending").reduce((s, inv) => s + invoiceCompute(inv).total, 0);
  const pending = IMS.invoices.filter(i => invStatus(i) === "pending").reduce((s, inv) => s + invoiceCompute(inv).total, 0);
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><div class="kpi-icon kpi-blue"><i class="bi bi-receipt"></i></div><div><div class="kpi-label">Total Invoiced to Date</div><div class="kpi-value">${fmtMoney(totInvoiced)}</div><div class="kpi-sub">${IMS.invoices.length} cycles</div></div></div>
      <div class="kpi"><div class="kpi-icon kpi-green"><i class="bi bi-check2-circle"></i></div><div><div class="kpi-label">Collected</div><div class="kpi-value">${fmtMoney(totCollected)}</div></div></div>
      <div class="kpi"><div class="kpi-icon kpi-red"><i class="bi bi-hourglass-split"></i></div><div><div class="kpi-label">Current Pending Balance</div><div class="kpi-value">${fmtMoney(pending)}</div></div></div>
    </div>
      <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-journal-text"></i> Cycle Invoicing Ledger</span>
        <div class="d-flex align-items-center gap-2">
          <span class="text-muted2" style="font-size:11.5px;font-weight:500">Cadence set per customer</span>
        <select class="form-select form-select-sm" id="invFilter" style="width:auto">
          <option value="all" ${App.invFilter === "all" ? "selected" : ""}>All</option>
          <option value="pending" ${App.invFilter === "pending" ? "selected" : ""}>Pending</option>
          <option value="invoiced" ${App.invFilter === "invoiced" ? "selected" : ""}>Invoiced</option>
          <option value="paid" ${App.invFilter === "paid" ? "selected" : ""}>Paid</option>
        </select>
        <button class="btn btn-ims-outline btn-sm2" id="invExport" title="Download invoice details (CSV)"><i class="bi bi-download"></i></button>
        <button class="btn btn-ims btn-sm2" id="invCycle"><i class="bi bi-plus-lg"></i> Run Next Cycle</button>
      </div></div>
      <div class="card-body table-wrap">
        <table class="table"><thead><tr><th>Invoice</th><th>Contract</th><th>Cycle</th><th class="num">Base Hire</th><th class="num">Env Fee</th><th class="num">Fuel</th><th class="num">Waiver</th><th class="num">Total</th><th>Status</th></tr></thead>
        <tbody>${rows || emptyRow(9)}</tbody></table>
      </div></div>`;
  $("#invFilter").addEventListener("change", e => { App.invFilter = e.target.value; renderInvoicing(); });
  $("#invExport").addEventListener("click", () => downloadCSV("invoice-details.csv", invoiceDetailCSV(filtered)));
  $("#invCycle").addEventListener("click", () => {
    const maxCycle = IMS.invoices.reduce((m, i) => Math.max(m, i.cycle), 0);
    IMS.invoices.filter(i => invStatus(i) !== "paid").forEach(i => {
      const nextStart = i.cycleEnd;
      const con = getContract(i.contractId);
      const cycleDays = con ? customerCycleDays(con) : IMS.settings.pricing.cycleDays;
      const nextEnd = addDays(i.cycleEnd, cycleDays);
      const baseAmount = con ? contractRentalForPeriod(con, nextStart, nextEnd) : 0;
      IMS.invoices.push({ invId:"INV-" + String(IMS.invoices.length + 1).padStart(3, "0"), contractId:i.contractId, cycle:maxCycle + 1, cycleStart:nextStart, cycleEnd:nextEnd, envFeePct:i.envFeePct, damageWaiver:i.damageWaiver, fuelCharge:i.fuelCharge || 0, baseAmount, taxRate: invTaxRate(i), status:"pending" });
    });
    renderInvoicing();
  });
  /* Clicking an invoice row opens the detail breakdown. */
  $$("#content tr[data-edit]").forEach(tr => tr.addEventListener("click", e => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const inv = IMS.invoices.find(x => x.invId === tr.dataset.edit);
    if (inv) invoiceDetailModal(inv);
  }));
}

/* Build a CSV string of detailed invoice items (line items + fees/fuel/waiver/tax). */
function invoiceDetailCSV(filtered){
  const esc = v => `"${String(v == null ? "" : v).replace(/"/g, "\"\"")}"`;
  const header = ["Invoice","Contract","Customer","Project","Cycle","Period","Status","Item Type","Item","Qty","Rate","Amount"].map(esc).join(",");
  const body = filtered.map(inv => {
    const con = getContract(inv.contractId);
    const cust = con ? (customerName(con.customerId) || con.customer || "") : "";
    const t = invoiceCompute(inv);
    const items = (con && con.lineItems && con.lineItems.length) ? con.lineItems : [];
    const period = `${fmtDate(inv.cycleStart)} to ${fmtDate(inv.cycleEnd)}`;
    const status = invStatusLabel(invStatus(inv));
    const b = [inv.invId, con ? con.contractId : inv.contractId, cust, con ? con.projectName : "", inv.cycle, period, status];
    const rows = [];
    if (items.length){
      items.forEach(li => {
        const rb = rateBasis(li, con);
        rows.push(b.concat([TYPE_LABEL[li.type] || li.type, itemLabel(li), li.qty, `${rb.basis} @ ${rb.rate}`, liAmountForPeriod(li, con, inv.cycleStart, inv.cycleEnd)]));
      });
    } else {
      rows.push(b.concat(["","","","",""]));
    }
    rows.push(b.concat(["Adjustment","Environmental Fee","","",t.envFee]));
    rows.push(b.concat(["Adjustment","Fuel Charge","","",t.fuel]));
    rows.push(b.concat(["Adjustment","Damage Waiver","","",t.waiver]));
    rows.push(b.concat(["Adjustment","Tax","","",t.tax]));
    return rows.map(r => r.map(esc).join(",")).join("\n");
  }).join("\n");
  return [header, body].join("\n");
}

/* Trigger a browser download of a CSV string. */
function downloadCSV(filename, csv){
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* Detailed invoice breakdown: who was invoiced and for what. */
function invoiceDetailModal(inv){
  const con = getContract(inv.contractId);
  const t = invoiceCompute(inv);
  const cust = con ? (customerName(con.customerId) || con.customer || "—") : "—";
  const lineRows = (con && con.lineItems && con.lineItems.length)
    ? con.lineItems.map(li => {
        const rb = rateBasis(li, con);
        const amt = liAmountForPeriod(li, con, inv.cycleStart, inv.cycleEnd);
        const unit = li.type === "labor" ? "/hr" : "";
        return `<tr>
          <td><span class="type-chip tc-${li.type}">${TYPE_LABEL[li.type] || li.type}</span> ${itemLabel(li)}</td>
          <td class="num">${fmtInt(li.qty)}</td>
          <td>${rb.basis} @ ${fmtMoney(rb.rate)}${unit}</td>
          <td class="num">${fmtMoney(amt)}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="4" class="text-center text-muted2 py-3">No line items on this contract.</td></tr>`;
  const body = `
    <div class="mb-3">
      <div class="strong">${con ? con.contractId : inv.contractId} — ${con ? con.projectName : "Unknown project"}</div>
      <div class="text-muted2" style="font-size:12px">${cust}</div>
      <div class="text-muted2" style="font-size:12px">Cycle ${inv.cycle} · ${fmtDate(inv.cycleStart)} — ${fmtDate(inv.cycleEnd)}</div>
      <div class="row g-3 mt-1">
        <div class="col-md-6"><div class="strong mb-1">Status</div>${invStatusBadge(inv)}</div>
        <div class="col-md-6 field-group mb-0"><label class="form-label">Change Status</label>
          <select class="form-select" id="invStatusSel">
            <option value="pending" ${invStatus(inv) === "pending" ? "selected" : ""}>Pending</option>
            <option value="invoiced" ${invStatus(inv) === "invoiced" ? "selected" : ""}>Invoiced</option>
            <option value="paid" ${invStatus(inv) === "paid" ? "selected" : ""}>Paid</option>
          </select></div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="strong mb-2"><i class="bi bi-box-seam me-1"></i>Invoiced Items</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th class="num">Qty</th><th>Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${lineRows}</tbody></table></div>
    <div class="divider"></div>
    <div class="list-line"><span class="l">Equipment Rental Gross</span><span class="r">${fmtMoney(t.base)}</span></div>
    <div class="list-line"><span class="l">Environmental Fee (${inv.envFeePct || IMS.settings.pricing.envFeePct}%)</span><span class="r">${fmtMoney(t.envFee)}</span></div>
    <div class="list-line"><span class="l">Fuel Charge</span><span class="r">${t.fuel ? fmtMoney(t.fuel) : "—"}</span></div>
    <div class="list-line"><span class="l">Damage Waiver</span><span class="r">${t.waiver ? fmtMoney(t.waiver) : "—"}</span></div>
    <div class="list-line"><span class="l">Tax</span><span class="r">${fmtMoney(t.tax)}</span></div>
    <div class="list-line"><span class="l strong">Invoice Total</span><span class="r strong">${fmtMoney(t.total)}</span></div>`;
  const footer = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Close</button>
    <button type="button" class="btn btn-ims-outline" id="invDL"><i class="bi bi-download"></i> Download CSV</button>
    <button type="button" class="btn btn-ims" id="invSave"><i class="bi bi-check2"></i> Save Status</button>`;
  const root = openRawModal({
    id: "mdl-inv", size: "lg", title: "Invoice " + inv.invId, icon: "bi-receipt",
    body, footer
  });
  root.querySelector("#invDL").addEventListener("click", () => downloadCSV("invoice-" + inv.invId + ".csv", invoiceDetailCSV([inv])));
  root.querySelector("#invSave").addEventListener("click", () => {
    inv.status = root.querySelector("#invStatusSel").value;
    dismissModal(root);
    renderInvoicing();
  });
}

function renderRerents(){
  const rows = IMS.rentals.map(r => {
    const spread = (r.retailRate - r.vendorCost) * r.qty;
    return `<tr>
      <td class="strong">${r.assetName}${r.assetId ? ` <span class="mono text-muted2">${r.assetId}</span>` : ""}</td>
      <td class="strong mono">${r.contractId}</td>
      <td>${r.vendor}</td>
      <td class="num">${fmtMoney(r.vendorCost)}</td>
      <td class="num">${fmtMoney(r.retailRate)}</td>
      <td class="num">${r.qty}</td>
      <td class="num strong">${fmtMoney(spread)}</td>
    </tr>`;
  }).join("");
  const totalSpread = IMS.rentals.reduce((s, r) => s + (r.retailRate - r.vendorCost) * r.qty, 0);
  const totalCost = IMS.rentals.reduce((s, r) => s + r.vendorCost * r.qty, 0);
  const totalRetail = IMS.rentals.reduce((s, r) => s + r.retailRate * r.qty, 0);
  const margin = totalRetail ? totalSpread / totalRetail * 100 : 0;
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><div class="kpi-icon kpi-blue"><i class="bi bi-cart"></i></div><div><div class="kpi-label">Vendor Wholesale Cost</div><div class="kpi-value">${fmtMoney(totalCost)}</div></div></div>
      <div class="kpi"><div class="kpi-icon kpi-green"><i class="bi bi-currency-dollar"></i></div><div><div class="kpi-label">Retail Rental Revenue</div><div class="kpi-value">${fmtMoney(totalRetail)}</div></div></div>
      <div class="kpi"><div class="kpi-icon kpi-purple"><i class="bi bi-graph-up"></i></div><div><div class="kpi-label">Net Profit Spread</div><div class="kpi-value">${fmtMoney(totalSpread)}</div><div class="kpi-sub">${fmtPct(margin)} margin</div></div></div>
    </div>
    <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-arrow-left-right"></i> Sub-Rentals</span>
      <button class="btn btn-ims btn-sm2" id="rrAdd"><i class="bi bi-plus-lg"></i> New Sub-Rental</button></div>
      <div class="card-body table-wrap">
        <table class="table"><thead><tr><th>Asset</th><th>Contract</th><th>Vendor Source</th><th class="num">Vendor Cost</th><th class="num">Retail Rate</th><th class="num">Qty</th><th class="num">Net Spread</th></tr></thead>
        <tbody>${rows || emptyRow(7)}</tbody></table>
      </div></div>`;
  $("#rrAdd").addEventListener("click", rerentModal);
}

function rerentModal(){
  openFormModal({
    id: "mdl-rr", title: "New Sub-Rental", icon: "bi-arrow-left-right",
    fields: [
      { key:"assetName", label:"Asset Name", type:"text", value:"" },
      { key:"contractId", label:"Customer Contract", type:"select", value: IMS.contracts[0].contractId, options: IMS.contracts.map(c => ({ value:c.contractId, label:c.contractId + " — " + c.projectName })) },
      { key:"vendor", label:"Vendor Source Name", type:"text", value:"" },
      { key:"vendorCost", label:"Wholesale Vendor Cost ($)", type:"number", value:0 },
      { key:"retailRate", label:"Retail Rental Rate ($)", type:"number", value:0 },
      { key:"qty", label:"Qty", type:"number", value:1 }
    ],
    onSave: v => {
      IMS.rentals.push({ rrId:"RR-" + String(IMS.rentals.length + 1).padStart(3, "0"), assetId:null, assetName:v.assetName, contractId:v.contractId, vendor:v.vendor, vendorCost:v.vendorCost, retailRate:v.retailRate, qty:v.qty });
      renderRerents();
    }
  });
}

function renderBranches(){
  const cards = IMS.settings.branches.map((b, i) => `<div class="card mb-3"><div class="card-body">
    <div class="d-flex justify-content-between align-items-start">
      <div><div class="strong"><i class="bi bi-buildings me-1"></i>${b.branchId} — ${b.name}</div>
        <div class="text-muted2" style="font-size:12px">${b.address}</div>
        <div class="text-muted2" style="font-size:12px">${b.phone} · ${b.tz}</div></div>
      <div class="d-flex gap-1">
        <button class="btn btn-ims-outline btn-sm2" data-bed="${i}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-ims-outline btn-sm2" data-bdel="${i}"><i class="bi bi-x-lg"></i></button>
      </div>
    </div>
  </div></div>`).join("") || `<p class="text-muted2 py-3">No branches configured.</p>`;
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-buildings"></i> Branch / Yard Profiles</span>
      <button class="btn btn-ims btn-sm2" id="brAdd"><i class="bi bi-plus-lg"></i> New Branch</button></div>
      <div class="card-body">${cards}</div></div>`;
  $("#brAdd").addEventListener("click", () => branchConfigModal(null));
  $$("[data-bed]").forEach(b => b.addEventListener("click", () => branchConfigModal(IMS.settings.branches[parseInt(b.dataset.bed, 10)])));
  $$("[data-bdel]").forEach(b => b.addEventListener("click", () => { IMS.settings.branches.splice(parseInt(b.dataset.bdel, 10), 1); renderBranches(); }));
}

function branchConfigModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  openFormModal({
    id: "mdl-br", title: (isEdit ? "Edit" : "New") + " Branch / Yard Profile", icon: "bi-buildings",
    fields: [
      { key:"branchId", label:"Branch ID", type:"text", value: e.branchId || "BR-" + (IMS.settings.branches.length + 1), required:true },
      { key:"name", label:"Name", type:"text", value: e.name || "" },
      { key:"address", label:"Address", type:"text", value: e.address || "" },
      { key:"phone", label:"Phone", type:"text", value: e.phone || "" },
      { key:"tz", label:"Time Zone", type:"text", value: e.tz || "America/New_York" }
    ],
    onSave: v => {
      const rec = { branchId:v.branchId, name:v.name, address:v.address, phone:v.phone, tz:v.tz };
      if (isEdit) Object.assign(existing, rec);
      else IMS.settings.branches.push(rec);
      renderBranches();
    }
  });
}

function renderPricing(){
  const P = IMS.settings.pricing;
  const riskRows = Object.entries(P.riskPremiums).map(([k, v]) => `<div class="list-line"><span class="l">${k.charAt(0).toUpperCase() + k.slice(1)}</span><span class="r">+${Math.round(v * 100)}%</span></div>`).join("");
  const taxRows = IMS.settings.taxSchedules.map((t, i) => `<tr>
    <td class="strong mono">${t.code || "—"}</td><td>${t.state || "—"}</td><td>${t.county || "—"}</td><td>${t.city || "—"}</td><td class="num">${(t.rate * 100).toFixed(3)}%</td><td class="text-muted2">${t.note || ""}</td>
    <td class="text-end text-nowrap"><button class="btn btn-ims-outline btn-sm2" data-tedit="${i}"><i class="bi bi-pencil"></i></button><button class="btn btn-ims-outline btn-sm2" data-tdel="${i}"><i class="bi bi-x-lg"></i></button></td>
  </tr>`).join("");
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="dash-grid">
      <div>
        <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-sliders"></i> Advanced Pricing Rules Engine</span>
          <button class="btn btn-ims" id="setSave"><i class="bi bi-check2"></i> Save Pricing</button></div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-6 field-group"><label class="form-label">Daily Minimum Hours</label><input class="form-control" type="number" id="set-daily" value="${P.dailyMinHours}"></div>
              <div class="col-md-6 field-group"><label class="form-label">Weekly Limit (hrs)</label><input class="form-control" type="number" id="set-weekly" value="${P.weeklyHours}"></div>
              <div class="col-md-6 field-group"><label class="form-label">Billing Cycle (days)</label><input class="form-control" type="number" id="set-cycle" value="${P.cycleDays}"></div>
              <div class="col-md-6 field-group"><label class="form-label">Default Environmental Fee (%)</label><input class="form-control" type="number" step="0.1" id="set-env" value="${P.envFeePct}"></div>
              <div class="col-md-6 field-group"><label class="form-label">Annual Depreciation Factor</label><input class="form-control" type="number" step="0.01" id="set-dep" value="${P.depreciationAnnual}"></div>
              <div class="col-md-6 field-group"><label class="form-label">Default Weekend Policy</label><select class="form-select" id="set-weekend">${["bill","skip","overtime"].map(w => `<option ${w === P.weekendPolicyDefault ? "selected" : ""}>${w}</option>`).join("")}</select></div>
            </div>
            <div class="divider"></div>
            <div class="strong mb-2">Risk / Environment Premiums</div>
            ${riskRows}
          </div></div>
        <div class="card" style="margin-top:16px">
          <div class="card-header"><span class="card-title"><i class="bi bi-layers"></i> Global Overhead &amp; Service Fee Configurations</span>
            <button class="btn btn-ims" id="ohCfgAdd"><i class="bi bi-plus-lg"></i> Add Overhead</button></div>
          <div class="card-body">${overheadConfigsHTML()}</div></div>
      </div>
      <div>
        <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-percent"></i> Localized Tax Schedule</span>
          <button class="btn btn-ims" id="taxAdd"><i class="bi bi-plus-lg"></i> Add Tax</button></div>
          <div class="card-body table-wrap"><table class="table"><thead><tr><th>Code</th><th>State</th><th>County</th><th>City</th><th class="num">Rate</th><th>Note</th><th class="text-end">Actions</th></tr></thead>
            <tbody>${taxRows || emptyRow(7)}</tbody></table></div></div>
      </div>
    </div>`;
  bindOverheadManager();
  $("#setSave").addEventListener("click", () => {
    const P2 = IMS.settings.pricing;
    P2.dailyMinHours = parseInt($("#set-daily").value, 10) || 8;
    P2.weeklyHours = parseInt($("#set-weekly").value, 10) || 40;
    P2.cycleDays = parseInt($("#set-cycle").value, 10) || 28;
    P2.envFeePct = parseFloat($("#set-env").value) || 5;
    P2.depreciationAnnual = parseFloat($("#set-dep").value) || 0.10;
    P2.weekendPolicyDefault = $("#set-weekend").value;
    renderPricing();
  });
  $("#taxAdd").addEventListener("click", () => taxConfigModal(null));
  $$("[data-tedit]").forEach(b => b.addEventListener("click", () => taxConfigModal(IMS.settings.taxSchedules[parseInt(b.dataset.tedit, 10)])));
  $$("[data-tdel]").forEach(b => b.addEventListener("click", () => { IMS.settings.taxSchedules.splice(parseInt(b.dataset.tdel, 10), 1); renderPricing(); }));
}

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"]
].map(s => ({ code:s[0], name:s[1] }));

/* US Census geography via OpenDataSoft (keyless + CORS), with local fallback. */
const ODS_COUNTY = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-united-states-of-america-county/records";
const ODS_PLACE  = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-united-states-of-america-place/records";
const US_FALLBACK = {
  "Georgia": { counties:["Fulton","Cobb","DeKalb","Gwinnett"], cities:{ "Fulton":["Atlanta","Alpharetta","Roswell"], "Cobb":["Marietta","Smyrna"], "DeKalb":["Decatur"], "Gwinnett":["Lawrenceville"] } },
  "Tennessee": { counties:["Davidson","Shelby","Knox"], cities:{ "Davidson":["Nashville"], "Shelby":["Memphis"], "Knox":["Knoxville"] } },
  "Florida": { counties:["Miami-Dade","Broward","Orange"], cities:{ "Miami-Dade":["Miami","Hialeah"], "Broward":["Fort Lauderdale"], "Orange":["Orlando"] } },
  "Alabama": { counties:["Jefferson","Mobile"], cities:{ "Jefferson":["Birmingham"], "Mobile":["Mobile"] } }
};
const escQ = s => String(s).replace(/'/g, "''");

/* Fetch all pages (OpenDataSoft total_count drives pagination), in parallel. */
async function fetchAll(url){
  const LIMIT = 100;
  const first = await (await fetch(url + "&limit=" + LIMIT + "&offset=0")).json();
  const rows0 = first.results || [];
  const total = Number(first.total_count) || rows0.length;
  const pages = Math.ceil(total / LIMIT);
  const tasks = [];
  for (let i = 1; i < pages; i++) {
    tasks.push(fetch(url + "&limit=" + LIMIT + "&offset=" + (i * LIMIT)).then(r => r.json()).then(j => j.results || []));
  }
  const rest = await Promise.all(tasks);
  return rows0.concat(rest.flat());
}

const COUNTY_CACHE = {};
async function getCounties(stateName){
  if (COUNTY_CACHE[stateName]) return COUNTY_CACHE[stateName];
  let arr = [];
  try {
    const url = ODS_COUNTY + "?where=" + encodeURIComponent("ste_name='" + escQ(stateName) + "'") + "&select=ste_name,coty_name";
    const rows = await fetchAll(url);
    arr = rows.map(r => (Array.isArray(r.coty_name) ? r.coty_name[0] : r.coty_name)).filter(Boolean);
  } catch (_) {}
  if (!arr.length) arr = (US_FALLBACK[stateName] && US_FALLBACK[stateName].counties) || [];
  const uniq = [...new Set(arr)].sort();
  COUNTY_CACHE[stateName] = uniq;
  return uniq;
}

const CITY_CACHE = {};
async function getStatePlaces(stateName){
  if (CITY_CACHE[stateName]) return CITY_CACHE[stateName];
  const url = ODS_PLACE + "?where=" + encodeURIComponent("ste_name='" + escQ(stateName) + "'") + "&select=ste_name,coty_name,pla_name";
  const rows = await fetchAll(url);
  const places = rows.map(r => ({
    name: (Array.isArray(r.pla_name) ? r.pla_name[0] : r.pla_name),
    counties: (Array.isArray(r.coty_name) ? r.coty_name : [r.coty_name]).filter(Boolean)
  })).filter(p => p.name);
  CITY_CACHE[stateName] = places;
  return places;
}

async function getCities(stateName, countyName){
  let places = [];
  try { places = await getStatePlaces(stateName); } catch (_) {}
  if (places && places.length) {
    const names = places.filter(p => !countyName || p.counties.includes(countyName)).map(p => p.name);
    if (names.length) return [...new Set(names)].sort();
  }
  const fb = US_FALLBACK[stateName];
  if (fb) {
    if (countyName) return (fb.cities && fb.cities[countyName]) || [];
    return [...new Set(Object.values(fb.cities || {}).reduce((a, c) => a.concat(c), []))].sort();
  }
  return [];
}

function taxConfigModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  const stateVal = e.state || "";
  const countyVal = e.county || "";
  const cityVal = e.city || "";
  const codeVal = e.code || (US_STATES.find(s => s.name === stateVal) || {}).code || "";
  const body = `
    <div class="row g-3">
      <div class="col-md-4 field-group"><label class="form-label">Code</label><input class="form-control" id="t-code" value="${codeVal}" placeholder="e.g. GA"></div>
      <div class="col-md-8 field-group"><label class="form-label">State</label><select class="form-select" id="t-state"><option value="">— select state —</option>${US_STATES.map(s => `<option value="${s.name}" ${s.name === stateVal ? "selected" : ""}>${s.name}</option>`).join("")}</select></div>
      <div class="col-md-6 field-group"><label class="form-label">County (optional)</label><select class="form-select" id="t-county"><option value="">— all counties —</option></select></div>
      <div class="col-md-6 field-group"><label class="form-label">City (optional)</label><select class="form-select" id="t-city"><option value="">— all cities —</option></select></div>
      <div class="col-md-6 field-group"><label class="form-label">Rate (%)</label><input class="form-control" id="t-rate" type="number" step="0.001" value="${(e.rate || 0) * 100}"></div>
      <div class="col-md-6 field-group"><label class="form-label">Note</label><input class="form-control" id="t-note" value="${e.note || ""}"></div>
    </div>
    <div id="tax-load" class="form-hint"></div>`;
  const footer = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
    <button type="button" class="btn btn-ims" id="t-save"><i class="bi bi-check2"></i> Save Tax Schedule</button>`;
  const root = openRawModal({ id:"mdl-tax", size:"lg", title:(isEdit ? "Edit" : "New") + " Tax Schedule", icon:"bi-percent", body, footer });
  const stateSel = root.querySelector("#t-state"), countySel = root.querySelector("#t-county"), citySel = root.querySelector("#t-city"), loadHint = root.querySelector("#tax-load");

  const loadCities = async (st, cy) => {
    citySel.innerHTML = `<option value="">— all cities —</option>`;
    if (!st) return;
    loadHint.textContent = "Loading cities…";
    const cities = await getCities(st, cy);
    cities.forEach(c => citySel.add(new Option(c, c)));
    if (cityVal) citySel.value = cityVal;
    loadHint.textContent = cities.length ? "" : (cy ? "No city data for this county." : "No city data available.");
  };
  const loadCounties = async (st) => {
    countySel.innerHTML = `<option value="">— all counties —</option>`;
    citySel.innerHTML = `<option value="">— all cities —</option>`;
    if (!st) return;
    loadHint.textContent = "Loading counties…";
    const counties = await getCounties(st);
    counties.forEach(c => countySel.add(new Option(c, c)));
    if (countyVal) countySel.value = countyVal;
    loadHint.textContent = counties.length ? "" : "No county data available.";
    loadCities(st, countySel.value);
  };
  stateSel.addEventListener("change", e => {
    const s = US_STATES.find(x => x.name === e.target.value);
    if (s) root.querySelector("#t-code").value = s.code;
    loadCounties(e.target.value);
  });
  countySel.addEventListener("change", e => loadCities(stateSel.value, e.target.value));
  if (stateVal) loadCounties(stateVal);

  root.querySelector("#t-save").addEventListener("click", () => {
    const rec = {
      code: root.querySelector("#t-code").value.trim(),
      state: stateSel.value,
      county: countySel.value,
      city: citySel.value,
      rate: (parseFloat(root.querySelector("#t-rate").value) || 0) / 100,
      note: root.querySelector("#t-note").value
    };
    if (isEdit) Object.assign(existing, rec);
    else IMS.settings.taxSchedules.push(rec);
    renderPricing();
    dismissModal(root);
  });
}

function renderCategories(){
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-tags"></i> Resource Categories</span>
      <button class="btn btn-ims btn-sm2" id="catAddBtn"><i class="bi bi-plus-lg"></i> Add Category</button></div>
      <div class="card-body">${categoriesManagerHTML()}</div></div>`;
  bindCategoryManager();
}

function categoriesManagerHTML(){
  return `
    <div class="subtabs" id="catTabs">
      ${CAT_TYPES.map(t => `<button class="subtab ${t.key === App.catType ? "active" : ""}" data-type="${t.key}">
        <i class="bi ${t.icon}"></i>${t.label}<span class="count-pill">${IMS.settings.categories[t.key].length}</span></button>`).join("")}
    </div>
    <div id="catPanel">${categoryTable()}</div>`;
}

const CAT_TYPES = [
  { key:"serialized", label:"Serialized Equipment", icon:"bi-truck-front" },
  { key:"bulk", label:"Bulk Resources", icon:"bi-boxes" },
  { key:"consumable", label:"Consumables", icon:"bi-capsule" },
  { key:"labor", label:"Labor / Employees", icon:"bi-person-badge" },
  { key:"parts", label:"Stock Inventory", icon:"bi-wrench-adjustable" }
];
const typeLabel = t => (CAT_TYPES.find(x => x.key === t) || {}).label || t;
const activeCats = type => (IMS.settings.categories[type] || []).filter(c => c.active !== false).map(c => c.name);
const catOptions = (type, current) => {
  const names = activeCats(type);
  if (current && !names.includes(current)) names.push(current);
  return opt(names);
};

function categoryTable(){
  const type = App.catType;
  const cats = IMS.settings.categories[type] || [];
  const countOf = cat => {
    if (type === "serialized") return IMS.serializedAssets.filter(a => a.category === cat).length;
    if (type === "bulk") return IMS.bulkResources.filter(b => b.category === cat).length;
    if (type === "consumable") return IMS.consumables.filter(c => c.category === cat).length;
    if (type === "labor") return IMS.labor.filter(e => e.category === cat).length;
    if (type === "parts") return IMS.parts.filter(p => p.category === cat).length;
    return 0;
  };
  const rows = cats.map(c => `<tr>
    <td class="strong">${c.name}</td>
    <td>${c.active !== false ? `<span class="badge-status st-active"><i class="bi bi-circle-fill"></i>Active</span>` : `<span class="badge-status st-out"><i class="bi bi-circle-fill"></i>Inactive</span>`}</td>
    <td class="num">${countOf(c.name)}</td>
    <td class="text-end text-nowrap">
      <button class="btn btn-ims-outline btn-sm2" data-cate="rename" data-name="${c.name}" title="Rename"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-ims-outline btn-sm2" data-cate="del" data-name="${c.name}" title="Remove"><i class="bi bi-x-lg"></i></button>
    </td>
  </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Category</th><th>Active</th><th class="num">Items</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(4)}</tbody></table></div>`;
}

function bindCategoryManager(){
  $$("#catTabs .subtab").forEach(b => b.addEventListener("click", () => { App.catType = b.dataset.type; renderCategories(); }));
  const addBtn = $("#catAddBtn");
  if (addBtn) addBtn.addEventListener("click", addCategoryModal);
  const panel = $("#catPanel");
  if (!panel) return;
  panel.addEventListener("click", e => {
    const r = e.target.closest("[data-cate]");
    if (!r) return;
    const type = App.catType, name = r.dataset.name;
    if (r.dataset.cate === "del") { IMS.settings.categories[type] = IMS.settings.categories[type].filter(c => c.name !== name); renderCategories(); }
    else if (r.dataset.cate === "rename") renameCategoryModal(type, name);
  });
}

function addCategoryModal(){
  const type = App.catType;
  openFormModal({
    id: "mdl-cat-add", title: "Add Category — " + typeLabel(type), icon: "bi-plus-circle",
    fields: [
      { key:"name", label:"Category Name", type:"text", value:"", required:true },
      { key:"active", label:"Active", type:"checkbox", value:true, hint:"Inactive categories won't appear in Inventory & Assets" }
    ],
    onSave: v => {
      const name = v.name.trim();
      if (name && !IMS.settings.categories[type].some(c => c.name === name)) IMS.settings.categories[type].push({ name, active: v.active !== false });
      renderCategories();
    }
  });
}

function renameRecords(type, oldName, newName){
  if (type === "serialized") IMS.serializedAssets.forEach(a => { if (a.category === oldName) a.category = newName; });
  else if (type === "bulk") IMS.bulkResources.forEach(b => { if (b.category === oldName) b.category = newName; });
  else if (type === "consumable") IMS.consumables.forEach(c => { if (c.category === oldName) c.category = newName; });
  else if (type === "labor") IMS.labor.forEach(e => { if (e.category === oldName) e.category = newName; });
}

function renameCategoryModal(type, oldName){
  const cat = IMS.settings.categories[type].find(c => c.name === oldName);
  openFormModal({
    id: "mdl-cat-rename", title: "Rename Category — " + oldName, icon: "bi-pencil-square",
    fields: [
      { key:"name", label:"New Category Name", type:"text", value: oldName, required:true },
      { key:"active", label:"Active", type:"checkbox", value: cat ? cat.active : true, hint:"Inactive categories won't appear in Inventory & Assets" }
    ],
    onSave: v => {
      const arr = IMS.settings.categories[type];
      const idx = arr.findIndex(c => c.name === oldName);
      if (idx >= 0) { arr[idx].name = v.name; arr[idx].active = v.active !== false; renameRecords(type, oldName, v.name); }
      renderCategories();
    }
  });
}

function overheadConfigsHTML(){
  const rows = IMS.settings.overheads.map((o, i) => `<tr>
    <td class="strong">${o.name}</td>
    <td>${o.category}</td>
    <td>${o.chargeType}${o.chargeType === "Percent of Equipment Total" ? ` <span class="text-muted2">${o.pct}%</span>` : ""}</td>
    <td class="num">${fmtMoney(o.cost)}</td>
    <td class="num">${fmtMoney(o.retail)}</td>
    <td>${o.locked ? `<span class="badge-status st-active"><i class="bi bi-bolt"></i>Auto-inject</span>` : `<span class="badge-status st-closed"><i class="bi bi-slash-circle"></i>Optional</span>`}</td>
    <td class="text-end text-nowrap">
      <button class="btn btn-ims-outline btn-sm2" data-ohcfg="edit" data-i="${i}"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-ims-outline btn-sm2" data-ohcfg="del" data-i="${i}"><i class="bi bi-x-lg"></i></button>
    </td>
  </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Fee / Asset Name</th><th>Category</th><th>Charge Type</th><th class="num">Default Cost</th><th class="num">Default Retail</th><th>Auto-Inject</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(7)}</tbody></table></div>`;
}

function bindOverheadManager(){
  const addBtn = $("#ohCfgAdd");
  if (addBtn) addBtn.addEventListener("click", () => overheadConfigModal(null));
  $$("[data-ohcfg]").forEach(b => b.addEventListener("click", () => {
    const i = parseInt(b.dataset.i, 10);
    const cfg = IMS.settings.overheads[i];
    if (!cfg) return;
    if (b.dataset.ohcfg === "del") { IMS.settings.overheads.splice(i, 1); renderPricing(); }
    else if (b.dataset.ohcfg === "edit") overheadConfigModal(cfg);
  }));
}

function overheadConfigModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  openFormModal({
    id: "mdl-ohcfg", title: (isEdit ? "Edit" : "New") + " Overhead / Service Fee", icon: "bi-layers",
    fields: [
      { key:"name", label:"Fee / Asset Name", type:"text", value: e.name || "", required:true },
      { key:"category", label:"Category", type:"select", value: e.category || "Freight/Logistics", options: opt(["Facility","Freight/Logistics","Compliance"]) },
      { key:"chargeType", label:"Charge Type", type:"select", value: e.chargeType || "Flat Fee", options: opt(["Flat Fee","Percent of Equipment Total","Per Mile","Per Day"]) },
      { key:"pct", label:"Percentage of Equipment Total (%)", type:"number", value: e.pct || 0, step:"0.1", hint:"Used when Charge Type = Percentage" },
      { key:"cost", label:"Default Cost Price ($)", type:"number", value: e.cost || 0 },
      { key:"retail", label:"Default Billable Retail ($)", type:"number", value: e.retail || 0 },
      { key:"locked", label:"Auto-inject into new contracts", type:"checkbox", value: e.locked === true }
    ],
    onSave: v => {
      const rec = { ohId: e.ohId || "OH-" + String(IMS.settings.overheads.length + 1).padStart(3, "0"),
        name:v.name, category:v.category, chargeType:v.chargeType, pct:v.pct, cost:v.cost, retail:v.retail, locked: !!v.locked };
      if (isEdit) Object.assign(existing, rec);
      else IMS.settings.overheads.push(rec);
      renderPricing();
    }
  });
}

/* =========================================================
   GLOBAL SEARCH / NOTIFICATIONS / BOOTSTRAP
   ========================================================= */
function init(){
  const d = new Date();
  $("#topbarDate").textContent = d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" });

  $$(".nav-item").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  $("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#notifBtn").addEventListener("click", () => showView("geo"));

  $("#globalSearch").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const q = e.target.value.trim();
      if (!q) return;
      App.geoFilter = q;
      showView("geo");
      e.target.value = "";
    }
  });

  /* Seed one breach event matching the spec example so the
     dashboard / geo log show activity immediately. */
  App.breachAlerts.push({ kind:"breach", ts:"08:11:47", msg:"ALERT: Asset BL-119 exited Geofence boundary at Job Site: Downtown Plaza Renovation (120m out)" });

  /* Scope seed invoices to their current cycle: give any invoice lacking an explicit
     base amount the amount actually booked for its cycleStart..cycleEnd period. */
  IMS.invoices.forEach(inv => {
    if (inv.baseAmount == null){
      const con = getContract(inv.contractId);
      if (con) inv.baseAmount = contractRentalForPeriod(con, inv.cycleStart, inv.cycleEnd);
    }
  });

  initSim();
  updateBadges();
  App.simTimer = setInterval(geoSimTick, 2500);  /* live GPS telemetry loop */

  showView("dashboard");
}

document.addEventListener("DOMContentLoaded", init);
