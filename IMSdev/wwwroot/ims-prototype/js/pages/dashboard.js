/* =========================================================
   IMS — dashboard.js (split out of app.js)
   Executive dashboard view (KPIs, active contracts, alerts).
   ========================================================= */
"use strict";

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

