/* =========================================================
   IMS — orders.js (split out of app.js)
   Customers & orders view (party records, order header management).
   ========================================================= */
"use strict";

/* =========================================================
   CONTRACTS — HEADER MANAGEMENT (split out of Scheduler)
   ========================================================= */
function renderOrdersParties(){
  const tabs = [
    { key:"customers", label:"Customers", icon:"bi-people", count: IMS.parties.length },
    { key:"orders", label:"Contracts", icon:"bi-folder2-open", count: IMS.orders.length }
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
  delegate($("#content"), "click", "#ccTabs .subtab", b => { App.ccTab = b.dataset.tab; renderOrdersParties(); });
  $("#ccAddBtn").addEventListener("click", () => { App.ccTab === "customers" ? customerNewModal() : orderModal(); });
  renderCcPanel();
}

function renderCcPanel(){
  const p = $("#ccPanel");
  if (App.ccTab === "customers") {
    p.innerHTML = customersTable();
    IMSGrid.ensure("cc-customers", renderCcPanel);
  } else {
    const filtered = IMS.orders.filter(c => c.status === App.contractFilter);
    p.innerHTML = `
      <div class="d-flex align-items-center justify-content-between flex-wrap mb-3 gap-2">
        <span class="text-muted2">Showing <strong>${App.contractFilter}</strong> orders (<strong>${filtered.length}</strong>)</span>
        <div class="btn-group" id="ccFilter">
          <button class="btn btn-sm2 ${App.contractFilter === "active" ? "btn-ims" : "btn-ims-outline"}" data-f="active">Active</button>
          <button class="btn btn-sm2 ${App.contractFilter === "closed" ? "btn-ims" : "btn-ims-outline"}" data-f="closed">Closed</button>
        </div>
      </div>` + contractsTable(filtered);
    IMSGrid.ensure("cc-contracts", renderCcPanel);
  }
  bindCcActions();
}

function customersTable(){
  const cols = [
    { key:"name", header:"Customer", always:true, render: c => {
        const cons = IMS.orders.filter(x => x.partyId === c.id);
        const active = cons.filter(x => x.status === "active").length;
        return `<span class="strong">${c.name}</span> ${activeBadge(c)}<div class="text-muted2 text-xs">${c.email}</div>`;
      } },
    { key:"contact", header:"Contact", render: c => c.contact },
    { key:"phone", header:"Phone", td:"mono text-muted2", render: c => c.phone },
    { key:"active", header:"Active", td:"num", render: c => {
        const active = IMS.orders.filter(x => x.partyId === c.id && x.status === "active").length;
        return `<span class="badge-status st-active">${active} active</span>`;
      } },
    { key:"contracts", header:"Contracts", td:"num", render: c => IMS.orders.filter(x => x.partyId === c.id).length },
    { key:"actions", header:"Actions", th:"text-end", td:"text-end text-nowrap", always:true, render: c => `<button class="btn btn-ims-outline btn-sm2" data-cview="${c.id}"><i class="bi bi-eye"></i> View</button><button class="btn btn-ims-outline btn-sm2" data-cedit="${c.id}"><i class="bi bi-pencil"></i> Edit</button>` }
  ];
  return IMSGrid.render("cc-customers", cols, IMS.parties,
    { empty:"No customers.", trAttrs: c => `data-edit="${c.id}"` });
}

function contractsTable(filtered){
  const onOf = c => c.status === "active";
  const cols = [
    { key:"orderId", header:"Contract", td:"strong mono", always:true, render: c => c.orderId },
    { key:"customer", header:"Customer", render: c => partyName(c.partyId) },
    { key:"project", header:"Project", render: c => c.projectName },
    { key:"start", header:"Start", td:"mono text-muted2 text-xs2", render: c => fmtDate(c.startDate) },
    { key:"end", header:"End", td:"mono text-muted2 text-xs2", render: c => fmtDate(c.endDate) },
    { key:"gross", header:"Gross", td:"num", render: c => fmtMoney(orderTotals(c).gross) },
    { key:"status", header:"Status", render: c => statusBadge(c.status) },
    { key:"actions", header:"Active / Actions", th:"text-end", td:"text-end text-nowrap", always:true, render: c => {
        const on = onOf(c);
        return `<label class="form-check form-switch mb-0 d-inline-block me-1" title="${on ? "Slide to close order" : "Slide to activate order"}">
          <input class="form-check-input" type="checkbox" data-cstatus="${c.orderId}" ${on ? "checked" : ""} style="cursor:pointer">
        </label>
        <button class="btn btn-ims-outline btn-sm2" data-cview="${c.orderId}" title="View"><i class="bi bi-eye"></i></button>
        <button class="btn btn-ims-outline btn-sm2" data-cedit="${c.orderId}" title="Edit"><i class="bi bi-pencil"></i></button>`;
      } }
  ];
  return IMSGrid.render("cc-contracts", cols, filtered,
    { empty:"No orders in this filter.", trAttrs: c => `data-edit="${c.orderId}"` });
}

function bindCcActions(){
  delegate($("#ccPanel"), "click", "[data-cview]", b => {
    const id = b.dataset.cview;
    const cust = getParty(id), con = getOrder(id);
    if (cust) customerModal(cust, false);
    else if (con) orderDetailModal(con);
  });
  delegate($("#ccPanel"), "click", "[data-cedit]", b => {
    const id = b.dataset.cedit;
    const cust = getParty(id), con = getOrder(id);
    if (cust) customerModal(cust, true);
    else if (con) orderEditModal(con);
  });
  delegate($("#ccPanel"), "change", "[data-cstatus]", b => {
    const c = getOrder(b.dataset.cstatus);
    if (!c) return;
    const status = b.checked ? "active" : "closed";
    if (IMS.store) IMS.store.repo("orders").update("orderId", c.orderId, { status });
    else c.status = status;
    renderCcPanel();
  });
  delegate($("#ccPanel"), "click", "#ccFilter [data-f]", b => { App.contractFilter = b.dataset.f; renderCcPanel(); });
  /* Clicking a row opens the edit modal (ignores the action buttons/controls). */
  delegate($("#ccPanel"), "click", "tr[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const id = el.dataset.edit;
    const cust = getParty(id), con = getOrder(id);
    if (cust) customerModal(cust, true);
    else if (con) orderEditModal(con);
  });
}

function nextCustId(){
  let max = 0;
  IMS.parties.forEach(c => { const n = parseInt(c.id.split("-")[1], 10); if (n > max) max = n; });
  return "PTY-" + String(max + 1).padStart(3, "0");
}

function customerModal(cust, editable){
  const cons = IMS.orders.filter(x => x.partyId === cust.id);
  const contractsList = cons.map(cc => {
    const t = orderTotals(cc);
    return `<div class="list-line" style="align-items:center">
      <span class="l"><span class="strong mono">${cc.orderId}</span> — ${cc.projectName} ${statusBadge(cc.status)}</span>
      <span class="r">${fmtMoney(t.gross)}</span>
    </div>`;
  }).join("") || `<p class="text-muted2 py-2">No orders on file for this party.</p>`;

  const fields = [["name","Company Name"],["phone","Phone"],["email","Email"],["billingAddress","Billing Address"],["notes","Notes"]];
  const cycleOpts = Object.keys(BILLING_CYCLES).map(k => `<option value="${k}" ${(cust.billingCycle || "monthly") === k ? "selected" : ""}>${BILLING_CYCLE_LABEL[k]} (${BILLING_CYCLES[k]} day${BILLING_CYCLES[k] === 1 ? "" : "s"})</option>`).join("");
  const body = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="cust-active" ${recActive(cust) ? "checked" : ""}><label class="form-check-label" for="cust-active"><strong>Active</strong></label></div>
      <span class="text-muted2 text-xs2">Inactive customers are archived / not selectable</span>
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
      if (IMS.store) IMS.store.repo("parties").update("id", cust.id, {});   // notify store of change
      renderOrdersParties();
      dismissModal(root);
    });
  }
}

function customerNewModal(){
  const cust = { id: nextCustId(), name:"", contact:"", phone:"", email:"", billingAddress:"", notes:"", billingCycle:"monthly", active:true };
  if (IMS.store) IMS.store.repo("parties").create(cust); else IMS.parties.push(cust);
  customerModal(cust, true);
}

function orderDetailModal(con){
  const t = orderTotals(con);
  const lineItems = (con.lineItems || []).map(li => `<div class="list-line">
    <span class="l">${itemLabel(li)} <span class="badge-status tc-serialized text-uppercase">${li.type}</span></span>
    <span class="r">${fmtMoney(computeLineTotal(li, con))}</span>
  </div>`).join("") || `<p class="text-muted2 py-2">No line items staged.</p>`;
  const body = `
    <div class="row g-3">
      <div class="col-md-6 field-group"><label class="form-label">Customer</label><div class="form-control-plaintext strong">${partyName(con.partyId)}</div></div>
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
    id: "mdl-cview", size: "lg", title: "Contract — " + con.orderId, icon: "bi-eye", body,
    footer: `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Close</button>
             <button type="button" class="btn btn-ims" id="cvSched"><i class="bi bi-calendar3"></i> Open Scheduler</button>`
  });
  root.querySelector("#cvSched").addEventListener("click", () => { App.orderId = con.orderId; showView("scheduler"); });
}



