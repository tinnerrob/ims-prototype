/* =========================================================
   IMS — contracts.js (split out of app.js)
   Customers & contracts view (customer records, contract header management).
   ========================================================= */
"use strict";

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
  delegate($("#content"), "click", "#ccTabs .subtab", b => { App.ccTab = b.dataset.tab; renderCustomersContracts(); });
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
  delegate($("#ccPanel"), "click", "[data-cview]", b => {
    const id = b.dataset.cview;
    const cust = getCustomer(id), con = getContract(id);
    if (cust) customerModal(cust, false);
    else if (con) contractDetailModal(con);
  });
  delegate($("#ccPanel"), "click", "[data-cedit]", b => {
    const id = b.dataset.cedit;
    const cust = getCustomer(id), con = getContract(id);
    if (cust) customerModal(cust, true);
    else if (con) contractEditModal(con);
  });
  delegate($("#ccPanel"), "change", "[data-cstatus]", b => {
    const c = getContract(b.dataset.cstatus);
    if (!c) return;
    c.status = b.checked ? "active" : "closed";
    renderCcPanel();
  });
  delegate($("#ccPanel"), "click", "#ccFilter [data-f]", b => { App.contractFilter = b.dataset.f; renderCcPanel(); });
  /* Clicking a row opens the edit modal (ignores the action buttons/controls). */
  delegate($("#ccPanel"), "click", "tr[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const id = el.dataset.edit;
    const cust = getCustomer(id), con = getContract(id);
    if (cust) customerModal(cust, true);
    else if (con) contractEditModal(con);
  });
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



