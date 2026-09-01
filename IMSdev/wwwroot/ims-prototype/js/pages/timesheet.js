/* =========================================================
   IMS — timesheet.js (split out of app.js)
   Labor & timesheets.
   ========================================================= */
"use strict";

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

