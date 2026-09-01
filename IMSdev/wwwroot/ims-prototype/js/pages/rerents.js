/* =========================================================
   IMS — rerents.js (split out of app.js)
   Sub-rentals view.
   ========================================================= */
"use strict";

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

