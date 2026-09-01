/* =========================================================
   IMS — invoicing.js (split out of app.js)
   Cycle invoicing (billing engine, ledger, CSV export, detail modal).
   ========================================================= */
"use strict";

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

