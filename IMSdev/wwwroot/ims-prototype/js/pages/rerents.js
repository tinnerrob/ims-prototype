/* =========================================================
   IMS — rerents.js (split out of app.js)
   Sub-rentals view.
   ========================================================= */
"use strict";

function rerentsGrid(){
  const cols = [
    { key:"asset", header:"Asset", td:"strong", always:true, render: r => `${r.assetName}${r.assetId ? ` <span class="mono text-muted2">${r.assetId}</span>` : ""}` },
    { key:"orderId", header:"Contract", td:"strong mono", render: r => r.orderId },
    { key:"vendor", header:"Vendor Source", render: r => r.vendor },
    { key:"vcost", header:"Vendor Cost", td:"num", render: r => fmtMoney(r.vendorCost) },
    { key:"retail", header:"Retail Rate", td:"num", render: r => fmtMoney(r.retailRate) },
    { key:"qty", header:"Qty", td:"num", render: r => r.qty },
    { key:"spread", header:"Net Spread", td:"num strong", render: r => fmtMoney((r.retailRate - r.vendorCost) * r.qty) }
  ];
  return IMSGrid.render("rr-list", cols, IMS.rentals, { empty:"No sub-rentals." });
}

function renderRerents(){
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
      <div class="card-body">${rerentsGrid()}</div>
      </div>`;
  IMSGrid.ensure("rr-list", renderRerents);
  $("#rrAdd").addEventListener("click", rerentModal);
}

function rerentModal(){
  openFormModal({
    id: "mdl-rr", title: "New Sub-Rental", icon: "bi-arrow-left-right",
    fields: [
      { key:"assetName", label:"Asset Name", type:"text", value:"" },
      { key:"orderId", label:"Customer Contract", type:"select", value: IMS.orders[0].orderId, options: IMS.orders.map(c => ({ value:c.orderId, label:c.orderId + " — " + c.projectName })) },
      { key:"vendor", label:"Vendor Source Name", type:"text", value:"" },
      { key:"vendorCost", label:"Wholesale Vendor Cost ($)", type:"number", value:0 },
      { key:"retailRate", label:"Retail Rental Rate ($)", type:"number", value:0 },
      { key:"qty", label:"Qty", type:"number", value:1 }
    ],
    onSave: v => {
      const rec = { rrId:"RR-" + String(IMS.rentals.length + 1).padStart(3, "0"), assetId:null, assetName:v.assetName, orderId:v.orderId, vendor:v.vendor, vendorCost:v.vendorCost, retailRate:v.retailRate, qty:v.qty };
      if (IMS.store) IMS.store.repo("rentals").create(rec); else IMS.rentals.push(rec);
      renderRerents();
    }
  });
}

