/* =========================================================
   IMS — common.js
   Shared foundation: DOM/format helpers, app state, date math,
   pricing rules engine, status badges, modal builder, event
   delegation, and shared data accessors used by every page.
   ========================================================= */
"use strict";

/* ---------- tiny DOM helpers ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/* Attach ONE listener to a stable parent and dispatch to any matching descendant.
   Delegation avoids binding a listener per element (fewer listeners, and the listener
   dies with the parent when a view re-renders — no leaks). */
const delegate = (parent, eventType, selector, handler) =>
  parent.addEventListener(eventType, e => {
    const target = e.target && e.target.closest ? e.target.closest(selector) : null;
    if (target) handler(target, e);
  });

const fmtMoney = n => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = n => Number(n || 0).toLocaleString("en-US");
const fmtPct = n => (Number(n) || 0).toFixed(1) + "%";
const pad2 = n => String(n).padStart(2, "0");
/* Round to 2 decimal places (money). @param {number} n @returns {number} */
const round2 = n => Math.round(n * 100) / 100;

/* ---------- app state ---------- */
const App = {
  view: "dashboard",
  invTab: "serialized",
  ccTab: "customers",
  contractFilter: "active",
  invFilter: "all",
  woFilter: "all",
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
/* Parse a date/ISO string into a Date. Date-only strings ("YYYY-MM-DD") are treated as
   LOCAL midnight (not UTC) so cycle arithmetic and display are timezone-correct.
   @param {string|Date} s - date string (optionally "YYYY-MM-DD HH:mm") or Date
   @returns {Date} */
const parseDT = s => {
  s = String(s).replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)){
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(s);
};

/* Whole calendar days spanned by [a, b] (rounded, minimum 1).
   @param {string} a - start date
   @param {string} b - end date
   @returns {number} */
function daysBetween(a, b){
  const diff = (parseDT(b) - parseDT(a)) / 86400000;
  return Math.max(1, Math.round(diff));
}

/* Number of Mon–Fri weekdays between a and b (inclusive, minimum 1).
   @param {string} a - start date
   @param {string} b - end date
   @returns {number} */
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

/* Format a date as MM/DD/YYYY HH:mm. @param {string|Date} s @returns {string} */
function fmtDT(s){
  const d = parseDT(s);
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* Format a date as MM/DD/YYYY. @param {string|Date} s @returns {string} */
function fmtDate(s){
  const d = parseDT(s);
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
}

/* Format a date's time as HH:mm. @param {string|Date} s @returns {string} */
function fmtTime(s){
  const d = parseDT(s);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* Current time as HH:mm:ss. @returns {string} */
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
   global pricing.cycleDays (28) for customers without an explicit cadence.
   @param {Object|string} contractOrId - a contract object (uses .customerId) or a customer id
   @returns {number} days in the customer's billing cycle */
const customerCycleDays = contractOrId => {
  const cust = contractOrId && contractOrId.contractId
    ? getCustomer(contractOrId.customerId)
    : getCustomer(contractOrId);
  if (cust && BILLING_CYCLES[cust.billingCycle] != null) return BILLING_CYCLES[cust.billingCycle];
  return IMS.settings.pricing.cycleDays || 28;
};

/* Resolve the underlying resource record for a line item or {type, refId}.
   @param {Object} item - line item or { type, refId }
   @returns {Object|null} the matched resource (asset, bulk, consumable, labor, part, kit, attachment) */
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

/* Human-readable label for a line item (code + name, e.g. "BL-119 · JLG 600S").
   @param {Object} item - line item
   @returns {string} */
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
/* Grand total for a contract line item (gross billable revenue), honoring the daily /
   weekly / monthly rate basis, weekend policy, risk premium, and pricing matrix.
   @param {Object} item - line item
   @param {Object} contract - owning contract
   @returns {number} rounded total revenue */
function computeLineTotal(item, contract){
  const days = liDays(item, contract);
  const premium = RISK_PREMIUM[item.riskPremium || "standard"] || 0;
  const r = getResource(item);
  if (!r) return 0;

  if (item.type === "labor")      return round2(r.hourlyBillable * item.qty);
  if (item.type === "consumable") return round2(r.retailPrice * item.qty);
  if (item.type === "part")       return round2(r.costPrice * item.qty);

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
    return round2(perUnit * item.qty * (1 + premium));
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
  return round2(perUnit * item.qty * (1 + premium));
}

/* Direct cost for a contract line item. */
function computeLineCost(item){
  const r = getResource(item);
  if (!r) return 0;
  if (item.type === "labor")      return round2(r.hourlyCost * item.qty);
  if (item.type === "consumable") return round2(r.costPrice * item.qty);
  if (item.type === "part")       return round2(r.costPrice * item.qty);
  return 0;
}

/* Asset depreciation factor on a contract (10% annual on serialized fleet). */
function computeDepreciation(item, contract){
  const r = getResource(item);
  if (!r || item.type !== "serialized") return 0;
  const days = liDays(item, contract);
  return round2(r.purchaseValue * (days / 365) * 0.10 * item.qty);
}

/* Equipment (serialized + bulk) rental gross, used as % overhead base. */
/* Equipment (serialized + bulk) rental gross, used as the % overhead base.
   @param {Object} contract @returns {number} */
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
/* Compute billable retail + pass-through cost for one overhead line item.
   @param {Object} oh - overhead line item
   @param {Object} contract - owning contract
   @returns {{retail:number, cost:number}} */
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
  return { retail: round2(retail), cost: round2(cost) };
}

/* Full financial roll-up for a contract (resources + overheads). */
/* Full financial roll-up for a contract (resources + overheads).
   @param {Object} contract
   @returns {Object} equipmentGross, equipBase, overheadRetail, overheadCost, operatingCost,
                     gross, laborCost, consumableCost, depreciation, net, margin, days */
function contractTotals(contract){
  let gross = 0, laborCost = 0, consumableCost = 0, depreciation = 0;
  (contract.lineItems || []).forEach(li => {
    gross          += computeLineTotal(li, contract);
    laborCost      += (li.type === "labor") ? computeLineCost(li) : 0;
    consumableCost += (li.type === "consumable") ? computeLineCost(li) : 0;
    depreciation   += computeDepreciation(li, contract);
  });
  gross = round2(gross);
  laborCost = round2(laborCost);
  consumableCost = round2(consumableCost);
  depreciation = round2(depreciation);

  const overheads = (contract.overheads !== undefined) ? contract.overheads : defaultOverheads();
  let overheadRetail = 0, overheadCost = 0;
  overheads.forEach(oh => { const c = overheadCalc(oh, contract); overheadRetail += c.retail; overheadCost += c.cost; });
  overheadRetail = round2(overheadRetail);
  overheadCost = round2(overheadCost);

  const grossTotal = round2((gross + overheadRetail));
  const operatingCost = round2((laborCost + consumableCost + depreciation + overheadCost));
  const net = round2((grossTotal - operatingCost));
  const margin = grossTotal > 0 ? (net / grossTotal) * 100 : 0;
  return {
    equipmentGross: gross, equipBase: round2(contractEquipBase(contract)),
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
/* Render a colored status badge by status name.
   @param {string} status @returns {string} badge HTML */
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

/* Build and open a Bootstrap form modal from a field config, calling onSave with values.
   @param {Object} opts - { id, title, icon, large, fields:[{key,label,type,value,options,required,hint}], onSave }
   @returns {Element} the modal root element */
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
/* Build and open a raw Bootstrap modal from HTML body/footer strings.
   @param {Object} o - { id, title, icon, body, footer, size }
   @returns {Element} the modal root element */
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


/* Empty-table placeholder row. @param {number} cols @returns {string} */
const emptyRow = cols => `<tr><td colspan="${cols}" class="text-center text-muted2 py-4">No records — add one with “Add Record”.</td></tr>`;
/* Find a contract by id. @param {string} id @returns {Object|undefined} */
const getContract = id => IMS.contracts.find(c => c.contractId === id);
/* Find a customer by id. @param {string} id @returns {Object|undefined} */
const getCustomer = id => IMS.customers.find(c => c.id === id);
/* Customer display name for a customer id (falls back to contract.customer). @param {string} id @returns {string} */
const customerName = id => { const c = getCustomer(id); return c ? c.name : (getContract(id) || {}).customer || id; };
/* Line-item start date string (overrides contract start if set). @param {Object} li @param {Object} c @returns {string} */
function liStart(li, c){ return li.startDate || c.startDate; }

/* Line-item end date string. @param {Object} li @param {Object} c @returns {string} */
function liEnd(li, c){ return li.endDate || c.endDate; }

/* Line-item duration in whole days. @param {Object} li @param {Object} c @returns {number} */
function liDays(li, c){ return daysBetween(liStart(li, c), liEnd(li, c)); }

/* Format a Date as "YYYY-MM-DDTHH:mm". @param {Date} d @returns {string} */
function toISO(d){ return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
const TYPE_LABEL = { serialized:"Serialized", bulk:"Bulk", consumable:"Consumable", labor:"Labor", part:"Part", kit:"Kit", attachment:"Attachment" };
/* True for multi-unit (quantity) resource types that may be split across contracts. @param {string} type @returns {boolean} */
function isQuantityType(type){
  return type === "bulk" || type === "consumable" || type === "part" || type === "kit" || type === "attachment";
}
/* Owned/stock capacity for a resource type. @param {string} type @param {Object} r @returns {number} */
function resourceCapacity(type, r){
  if (type === "bulk") return r.totalOwned || 0;
  if (type === "consumable" || type === "part") return r.qtyOnHand || 0;
  if (type === "attachment" || type === "kit") return r.qtyOwned || 1;
  return 1;
}

/* Update inventory/stock when a resource is staged (add=true) or unstaged (add=false).
   @param {string} type @param {string} ref @param {number} qty @param {boolean} add @param {Object} contract */
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
/* Count consumables/parts at or below their reorder point. @returns {number} */
function reorderCount(){ return IMS.consumables.filter(c => c.qtyOnHand <= c.reorderPoint).length + IMS.parts.filter(p => p.qtyOnHand <= p.reorderPoint).length; }

function inProgressWO(){ return IMS.workOrders.filter(w => w.status !== "Completed").length; }

function updateBadges(){
  const n = App.breachAlerts.filter(a => a.kind === "breach").length;
  const bad = $("#navGeoBadge"), cnt = $("#notifCount");
  if (bad) { bad.textContent = n; bad.style.display = n ? "" : "none"; }
  App.notif = n + reorderCount() + inProgressWO();
  if (cnt) cnt.textContent = App.notif;
}

function addDays(dateStr, days){
  const d = parseDT(dateStr);
  d.setDate(d.getDate() + days);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function invStatus(inv){ return inv.status || (inv.paid ? "invoiced" : "pending"); }
function invStatusLabel(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
