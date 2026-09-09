/* IMS jsdom gate.
   Loads index.html, inlines every local JS file in order as real <script> nodes
   (classic-script semantics, shared global scope), stubs bootstrap/timers,
   dispatches DOMContentLoaded, renders every TITLES view, then opens/closes/saves
   every modal and exercises the store repository/persistence seam.
   Run with: npm install && npm test */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const { window } = dom;
const doc = window.document;

/* --- stubs BEFORE any app script runs --- */
window.alert = window.confirm = window.prompt = () => {};
window.scrollTo = () => {};
window.setInterval = window.setTimeout = () => 1;   // never actually schedule (GPS/live loops)
window.clearInterval = window.clearTimeout = () => {};
window.requestAnimationFrame = window.cancelAnimationFrame = () => 1;

class FakeModal {
  constructor(el){ this.el = el; FakeModal.inst = this; }
  static getInstance(el){ return FakeModal.inst && FakeModal.inst.el === el ? FakeModal.inst : null; }
  show(){ this.el.classList.add("show"); this.el.dispatchEvent(new window.Event("shown.bs.modal")); }
  hide(){ this.el.classList.remove("show"); this.el.dispatchEvent(new window.Event("hidden.bs.modal")); }
}
window.bootstrap = { Modal: FakeModal };

const addScript = src => {
  const s = doc.createElement("script");
  s.textContent = src;
  doc.body.appendChild(s);   // runScripts: dangerously -> executes synchronously
};

/* --- inline every local script in index.html order, as ONE classic script --- */
const order = [];
const re = /<script[^>]+src="(js\/[^"]+)"/g;
let m;
while ((m = re.exec(html))) order.push(m[1]);
const bundle = order.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
addScript(bundle);

/* --- bootstrap the app --- */
doc.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

/* --- assertions run inside a page script so const globals (TITLES/RENDER) are in scope --- */
addScript(`(() => {
  const doc = document;
  const out = []; const fail = msg => { out.push("  FAIL: " + msg); };
  const ok = msg => { out.push("  ok: " + msg); };
  let failures = 0;
  const assert = (cond, msg) => { if (cond) ok(msg); else { failures++; fail(msg); } };

  /* 1. render every view must not throw */
  out.push("Rendering every TITLES view...");
  for (const id of Object.keys(TITLES)) {
    try { showView(id); assert(true, "view '" + id + "' rendered"); }
    catch (e) { failures++; out.push("  FAIL: view '" + id + "' threw: " + (e && e.message)); }
  }

  /* 1.5 MODULE DISCONNECT PROOFS (T2.3): with each module OFF the core must
       still render; the off module's nav must hide and its route must fall back
       to the dashboard. This locks the "modules never break core" guarantee. */
  out.push("Module disconnect proofs (T2.3)...");
  const modViews = Object.keys(MODULE_VIEW || {});
  const coreIds = Object.keys(TITLES).filter(id => !(id in (MODULE_VIEW || {})));
  const flagsBefore = Object.assign({}, (IMS.settings.featureModules || {}));
  modViews.forEach(mv => {
    const mk = MODULE_VIEW[mv];
    IMS.settings.featureModules = Object.assign({}, flagsBefore);
    IMS.settings.featureModules[mk] = false;                 // turn this module off
    if (typeof applyModuleNav === "function") applyModuleNav();
    const navEl = doc.querySelector('.nav-item[data-view="' + mv + '"]');
    assert(navEl && navEl.classList.contains("hidden"), "nav '" + mv + "' hidden when module '" + mk + "' off");
    showView(mv);                                            // must fall back to core
    assert(App.view === "dashboard", "routing to disabled module '" + mv + "' falls back to dashboard");
    coreIds.forEach(cid => {
      try { showView(cid); assert(true, "core view '" + cid + "' renders with '" + mk + "' off"); }
      catch (e) { failures++; out.push("  FAIL: core view '" + cid + "' threw with module '" + mk + "' off: " + (e && e.message)); }
    });
  });
  IMS.settings.featureModules = flagsBefore;                 // restore all on
  if (typeof applyModuleNav === "function") applyModuleNav();

  /* 1.6 MODAL CONSISTENCY CONTRACT (T3.4): every modal (form + raw, via the
       shared builders) must carry dialog semantics, a labelled title, and the
       standard footer (Cancel/Close + a .btn-ims primary), with no inline
       style on the dialog chrome. */
  out.push("Modal contract sweep (T3.4)...");
  const dialogRoot = () => doc.querySelector(".modal");
  const modalContract = (label) => {
    const d = dialogRoot();
    if (!d){ assert(false, "modal-contract '" + label + "' did not open a dialog"); return; }
    assert(d.getAttribute("role") === "dialog" && d.getAttribute("aria-modal") === "true",
      "modal-contract '" + label + "' has role=dialog + aria-modal");
    const lid = d.getAttribute("aria-labelledby");
    assert(!!lid && !!d.querySelector("#" + lid),
      "modal-contract '" + label + "' aria-labelledby points at a title");
    const foot = d.querySelector(".modal-footer");
    assert(!!foot && !!foot.querySelector('[data-bs-dismiss="modal"]'),
      "modal-contract '" + label + "' footer has Cancel/Close");
    assert(!!foot && !!foot.querySelector(".btn-ims"),
      "modal-contract '" + label + "' footer has a .btn-ims primary");
    const chromeInline = [d].concat(Array.from(d.querySelectorAll(".modal-dialog,.modal-content,.modal-header,.modal-body,.modal-footer") || []))
      .some(el => el && el.hasAttribute("style"));
    assert(!chromeInline, "modal-contract '" + label + "' dialog chrome has no inline style");
  };
  const sweepModal = (label, fn) => {
    try { fn(); modalContract(label); const d = dialogRoot(); if (d) dismissModal(d); }
    catch (e) { failures++; out.push("  FAIL: modal-contract '" + label + "' threw: " + (e && e.message)); }
  };
  sweepModal("inventory serialized", () => { showView("inventory"); serializedModal(); });
  if (IMS.parties[0]) sweepModal("customer edit", () => { showView("orders"); customerModal(IMS.parties[0], true); });
  if ((IMS.inspections || [])[0]) sweepModal("yard inspection", () => { showView("yard"); inspectionModal(IMS.inspections[0]); });

  /* 2. openFormModal structure + focus + save/close */
  showView("inventory");
  let saved = null;
  const fields = [
    { key: "name", label: "Name", type: "text", value: "Alpha" },
    { key: "qty", label: "Qty", type: "number", value: 3 },
    { key: "enabled", label: "Enabled", type: "checkbox", value: true },
    { key: "kind", label: "Kind", type: "select", value: "a", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }
  ];
  openFormModal({ id: "tform", title: "Test Form", fields, onSave: vals => { saved = vals; } });
  const fRoot = doc.querySelector('[role="dialog"][aria-modal="true"]');
  assert(!!fRoot, "openFormModal emits a role=dialog aria-modal=true container");
  assert(fRoot && fRoot.getAttribute("aria-labelledby") === "tform-title", "aria-labelledby points at title id");
  assert(!!doc.getElementById("tform-title"), "form modal has h5#tform-title");
  assert(!!doc.querySelector(".modal-body .field-group input#tform-name"), "form field input rendered in .field-group");
  assert(doc.querySelectorAll(".modal-body .field-group").length === 4, "each field renders as its own .field-group (no stray commas)");
  assert(doc.querySelector(".modal-body").textContent.indexOf(",") === -1, "form modal body has no comma-join artifacts");
  assert(!!doc.getElementById("tform-save"), "form modal has primary Save button");
  assert(doc.activeElement && doc.activeElement.id === "tform-name", "first field focused on open (activeElement=" + (doc.activeElement && doc.activeElement.id) + ")");
  assert(!!doc.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "form modal footer has Cancel (dismiss) button");
  doc.getElementById("tform-save").click();
  assert(saved && saved.name === "Alpha" && saved.qty === 3 && saved.enabled === true && saved.kind === "a", "form onSave receives field values on save");
  assert(!doc.getElementById("tform-title"), "form modal removed after save (dismissModal -> hidden)");

  /* 3. openRawModal structure + dismiss/close */
  const raw = openRawModal({ id: "traw", title: "Raw Detail", body: "<p>hello</p>", footer: '<button class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button><button class="btn btn-ims">OK</button>' });
  assert(doc.querySelector("#traw[role=dialog][aria-modal=true]") === raw, "openRawModal returns root with dialog semantics");
  assert(!!doc.getElementById("traw-title") && doc.getElementById("traw-title").textContent.indexOf("Raw Detail") !== -1, "raw modal h5 title id present");
  assert(doc.querySelector("#traw .modal-body p").textContent === "hello", "raw modal body injected");
  assert(doc.querySelectorAll("#traw .modal-footer .btn").length === 2, "raw modal footer buttons preserved");
  dismissModal(raw);
  assert(!doc.getElementById("traw"), "raw modal removed after dismissModal");

  /* 4. reuse: opening a second modal removes any prior (single instance) */
  openRawModal({ id: "one", title: "One", body: "", footer: "" });
  openRawModal({ id: "two", title: "Two", body: "", footer: "" });
  assert(!doc.getElementById("one") && !!doc.getElementById("two"), "opening a second modal removes the first");

  /* 5. Orders/Parties modals: open / close / save */
  showView("orders");
  const party = IMS.parties[0];
  customerModal(party, true);
  let custModal = doc.getElementById("mdl-cust");
  assert(!!custModal, "customerModal opens edit modal (mdl-cust)");
  assert(custModal.querySelectorAll(".divider").length >= 1, "customer modal groups content with .divider");
  assert(!!custModal.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "customer modal has Close/Cancel");
  const custSave = doc.getElementById("custSave");
  assert(!!custSave, "customer edit modal has primary Save");
  custSave.click();
  assert(!doc.getElementById("mdl-cust"), "customer modal closes on Save");

  orderEditModal(IMS.orders[0]);
  const om = doc.getElementById("mdl-order");
  assert(!!om, "order editor modal opens (mdl-order)");
  const oBody = om.querySelector(".modal-body").textContent;
  assert(oBody.indexOf("Order / Job Details") !== -1, "order editor has 'Order / Job Details' section head");
  assert(oBody.indexOf("Rental Window") !== -1, "order editor has 'Rental Window' section head");
  assert(oBody.indexOf("Fixed Overhead") !== -1, "order editor keeps Overhead section head");
  assert(!!om.querySelector("#c-save") && !!om.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "order editor footer has Save + Cancel");
  om.querySelector("#c-save").click();
  assert(!doc.getElementById("mdl-order"), "order editor closes on Save");

  orderDetailModal(IMS.orders[0]);
  const od = doc.getElementById("mdl-cview");
  assert(!!od, "order detail modal opens (mdl-cview)");
  assert(od.querySelectorAll(".modal-footer .btn").length === 2, "order detail footer has Close + Open Scheduler");
  dismissModal(od);
  assert(!doc.getElementById("mdl-cview"), "order detail closes via dismissModal");

  /* 6. Items & Stock: grouped long form modal (serialized) */
  showView("inventory");
  let smErr = null;
  try { serializedModal(); }
  catch (e) { smErr = e; }
  const sm = doc.getElementById("mdl-serial");
  assert(!!sm, "serialized form modal opens (mdl-serial)" + (smErr ? " [err=" + (smErr && smErr.message) + "]" : ""));
  if (sm) {
    const sBody = sm.querySelector(".modal-body").textContent;
    ["Identity", "Usage & Availability", "Rates & Pricing", "GPS Home"].forEach(s =>
      assert(sBody.indexOf(s) !== -1, "serialized form section '" + s + "' present"));
    assert(sm.querySelectorAll(".modal-body .divider").length >= 3, "serialized form groups fields with dividers");
    assert(!!sm.querySelector("#mdl-serial-save") && !!sm.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "serialized form footer has Save + Cancel");
    sm.querySelector("#mdl-serial-save").click();
    assert(!doc.getElementById("mdl-serial"), "serialized form closes on Save");
  }

  /* 7. Item Hand-Off: check-in prompt + multi-step rental wizard */
  showView("handoff");
  const outAsset = (IMS.orders.filter(o => o.status === "active")
    .flatMap(o => o.lineItems || []).filter(li => li.type === "serialized").map(li => li.refId) || [])[0];
  if (outAsset) {
    hoCheckInModal(outAsset);
    const ci = doc.getElementById("mdl-checkin");
    assert(!!ci, "check-in prompt opens (mdl-checkin)");
    assert(!!ci.querySelector("#ci-confirm") && !!ci.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "check-in footer has Cancel + Confirm Return");
    dismissModal(ci);
    assert(!doc.getElementById("mdl-checkin"), "check-in prompt closes via dismissModal");
  } else {
    assert(true, "no active serialized rental seeded — check-in prompt test skipped");
  }
  let wzErr = null;
  try { openNewRentalModal(); } catch (e) { wzErr = e; }
  const wz = doc.getElementById("mdl-rental");
  assert(!!wz, "rental wizard opens (mdl-rental)" + (wzErr ? " [err=" + (wzErr && wzErr.message) + "]" : ""));
  if (wz) {
    assert(!!wz.querySelector("#rn-next") && !!wz.querySelector("#rn-create"), "wizard nav has Next + Create Rental buttons");
    wz.querySelector("#rn-next").click();   // step 2 — items
    wz.querySelector("#rn-next").click();   // step 3 — review
    assert(!!wz.querySelector("#rn-invoice"), "wizard review pane renders invoice");
    dismissModal(wz);
    assert(!doc.getElementById("mdl-rental"), "wizard closes via dismissModal");
  }

  /* 8. Allocations modals (scheduler) */
  showView("scheduler");
  const allocOrder = (IMS.orders.filter(o => o.status === "active") || [])[0];
  if (allocOrder) {
    try {
      scheduleTimeModal(allocOrder.orderId);
      const tm = doc.getElementById("timeModal");
      assert(!!tm, "schedule-time modal opens (timeModal)");
      assert(!!tm.querySelector("#tt-save") && !!tm.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "schedule-time footer has Save + Cancel");
      dismissModal(tm);
      assert(!doc.getElementById("timeModal"), "schedule-time closes via dismissModal");
    } catch (e) { failures++; out.push("  FAIL: scheduleTimeModal: " + (e && e.message)); }

    const bulk = (IMS.itemRegistry.getByType("bulk").filter(recActive) || [])[0];
    if (bulk) {
      try {
        bookQtyModal("bulk", bulk.sku, allocOrder, null);
        const bq = doc.getElementById("mdl-bookqty");
        assert(!!bq, "book-qty modal opens (mdl-bookqty)");
        assert(!!bq.querySelector("#bq-qty") && !!bq.querySelector("#bq-save"), "book-qty has quantity field + Book action");
        dismissModal(bq);
      } catch (e2) { failures++; out.push("  FAIL: bookQtyModal: " + (e2 && e2.message)); }
      try {
        overbookModal("bulk", bulk.sku, allocOrder, 5, { ok: false, overbook: true, reason: "", total: 10, booked: 8, available: 2 }, null);
        const ob = doc.getElementById("mdl-overbook");
        assert(!!ob, "overbook warning modal opens (mdl-overbook)");
        assert(!!ob.querySelector("#ob-yes") && !!ob.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "overbook footer has Accept + Cancel");
        dismissModal(ob);
      } catch (e3) { failures++; out.push("  FAIL: overbookModal: " + (e3 && e3.message)); }
    }
  } else {
    assert(true, "no active order seeded — allocations modal test skipped");
  }

  /* 9. Receiving (yard) inspection modal */
  showView("yard");
  const insp = (IMS.inspections || [])[0];
  if (insp) {
    try {
      inspectionModal(insp);
      const im = doc.getElementById("mdl-insp");
      assert(!!im, "inspection modal opens (mdl-insp)");
      const iBody = im.querySelector(".modal-body").textContent;
      ["Routing", "Meters & Fuel", "Condition Checks"].forEach(s =>
        assert(iBody.indexOf(s) !== -1, "inspection form section '" + s + "' present"));
      assert(!!im.querySelector("#mdl-insp-save") && !!im.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "inspection footer has Save + Cancel");
      im.querySelector("#mdl-insp-save").click();
      assert(!doc.getElementById("mdl-insp"), "inspection modal closes on Save");
    } catch (e) { failures++; out.push("  FAIL: inspectionModal: " + (e && e.message)); }
  } else {
    assert(true, "no inspections seeded — inspection modal test skipped");
  }

  /* 10. Timesheets: punch clock + edit segment */
  showView("timesheet");
  const labEmp = (IMS.labor || [])[0];
  if (labEmp) {
    try {
      openPunch(labEmp.empId);
      const pm = doc.getElementById("mdl-punch");
      assert(!!pm, "punch-clock modal opens (mdl-punch)");
      assert(!!pm.querySelector("#punch-time") && !!pm.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "punch modal has time input + Cancel");
      dismissModal(pm);
      assert(!doc.getElementById("mdl-punch"), "punch-clock closes via dismissModal");
    } catch (e) { failures++; out.push("  FAIL: openPunch: " + (e && e.message)); }
  }
  const ts0 = (IMS.timesheets || [])[0];
  if (ts0) {
    try {
      segEdit(ts0.tsId);
      const sm2 = doc.getElementById("mdl-seg");
      assert(!!sm2, "edit-time modal opens (mdl-seg)");
      assert(!!sm2.querySelector("#seg-save") && !!sm2.querySelector("#seg-del") && !!sm2.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "segment modal footer has Save + Delete + Cancel");
      dismissModal(sm2);
      assert(!doc.getElementById("mdl-seg"), "edit-time modal closes via dismissModal");
    } catch (e) { failures++; out.push("  FAIL: segEdit: " + (e && e.message)); }
  }

  /* 11. Field service work order modal */
  showView("maintenance");
  try {
    workOrderModal();
    const wo = doc.getElementById("mdl-wo");
    assert(!!wo, "work order modal opens (mdl-wo)");
    const wb = wo.querySelector(".modal-body").textContent;
    ["Work Order Details", "Parts & Technician"].forEach(s =>
      assert(wb.indexOf(s) !== -1, "work order section '" + s + "' present"));
    assert(!!wo.querySelector("#mdl-wo-save") && !!wo.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "work order footer has Save + Cancel");
    wo.querySelector("#mdl-wo-save").click();
    assert(!doc.getElementById("mdl-wo"), "work order modal closes on Save");
  } catch (e) { failures++; out.push("  FAIL: workOrderModal: " + (e && e.message)); }

  /* 12. Billing invoice detail modal */
  showView("invoicing");
  const inv0 = (IMS.invoices || [])[0];
  if (inv0) {
    try {
      invoiceDetailModal(inv0);
      const iv = doc.getElementById("mdl-inv");
      assert(!!iv, "invoice detail modal opens (mdl-inv)");
      assert(iv.querySelector(".modal-body").textContent.indexOf("Invoiced Items") !== -1, "invoice modal shows 'Invoiced Items' section");
      assert(!!iv.querySelector("#invDL") && !!iv.querySelector("#invSave") && !!iv.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "invoice footer has Close + Download + Save Status");
      doc.getElementById("invStatusSel").value = "paid";
      doc.getElementById("invSave").click();
      assert(!doc.getElementById("mdl-inv"), "invoice modal closes on Save Status");
    } catch (e) { failures++; out.push("  FAIL: invoiceDetailModal: " + (e && e.message)); }
  } else {
    assert(true, "no invoices seeded — invoice modal test skipped");
  }

  /* 13. Remaining config modals (rentals + admin): open / save / close */
  const formSaveClose = (view, opener, id, saveId) => {
    showView(view);
    try {
      opener();
      const m = doc.getElementById(id);
      if (!m) { failures++; out.push("  FAIL: " + id + " did not open"); return; }
      assert(!!m.querySelector(saveId) && !!m.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), id + " has Save + Cancel");
      m.querySelector(saveId).click();
      assert(!doc.getElementById(id), id + " closes on Save");
    } catch (e) { failures++; out.push("  FAIL: " + id + ": " + (e && e.message)); }
  };
  formSaveClose("rerents", () => rerentModal(), "mdl-rr", "#mdl-rr-save");
  formSaveClose("branches", () => branchConfigModal(null), "mdl-br", "#mdl-br-save");
  showView("categories");
  App.catType = App.catType || "serialized";
  try {
    addCategoryModal();
    const catM = doc.getElementById("mdl-cat-add");
    assert(!!catM, "add-category modal opens (mdl-cat-add)");
    assert(!!catM.querySelector("#mdl-cat-add-save") && !!catM.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "add-category modal has Save + Cancel");
    catM.querySelector("#mdl-cat-add-save").click();
    assert(!doc.getElementById("mdl-cat-add"), "add-category modal closes on Save");
  } catch (e) { failures++; out.push("  FAIL: addCategoryModal: " + (e && e.message)); }
  formSaveClose("pricing", () => overheadConfigModal(null), "mdl-ohcfg", "#mdl-ohcfg-save");
  try {
    taxConfigModal(null);
    const tx = doc.getElementById("mdl-tax");
    assert(!!tx, "tax-config modal opens (mdl-tax)");
    assert(!!tx.querySelector("#t-save") && !!tx.querySelector('.modal-footer .btn[data-bs-dismiss="modal"]'), "tax-config modal has Save + Cancel");
    tx.querySelector("#t-save").click();
    assert(!doc.getElementById("mdl-tax"), "tax-config modal closes on Save");
  } catch (e) { failures++; out.push("  FAIL: taxConfigModal: " + (e && e.message)); }

  /* 14. Phase A-3/A-4: item catalog + settings/rental writers through store; JSON round-trip */
  assert(!!IMS.store && typeof IMS.store.repo === "function", "store repository seam present");
  const serBefore = IMS.itemRegistry.getByType("serialized").length;
  IMS.store.repo("serialized").create({ id:"TT-GATE-1", active:true, serial:"GATE", make:"Test", model:"T", category:"Boom Lift", meterHours:0, fuelType:"Diesel", purchaseValue:1, baseDaily:10, baseWeekly:50, baseMonthly:150, depositPct:25, lat:0, lng:0, status:"Available", battery:100, lastReported:"2026-09-09T00:00:00", orderId:null });
  assert(IMS.itemRegistry.getByType("serialized").length === serBefore + 1, "serialized create routed through store repo");
  IMS.store.repo("serialized").update("id", "TT-GATE-1", { model: "T2" });
  assert(IMS.itemRegistry.getByType("serialized").some(a => a.id === "TT-GATE-1" && a.model === "T2"), "serialized update routed through store repo");
  const brBefore = IMS.settings.branches.length;
  IMS.store.repo("branches").create({ branchId:"BR-GATE", name:"Gate", address:"", phone:"", tz:"UTC" });
  IMS.store.repo("branches").remove("branchId", "BR-GATE");
  assert(IMS.settings.branches.length === brBefore, "branches create+remove routed through store repo");
  IMS.store.repo("categories.serialized").create({ name:"GateCat", active:true });
  assert(IMS.settings.categories.serialized.some(c => c.name === "GateCat"), "namespaced category create routed through store repo");
  IMS.store.repo("categories.serialized").remove("name", "GateCat");
  const rlBefore = IMS.rentals.length;
  IMS.store.repo("rentals").create({ rrId:"RR-GATE", assetName:"gate" });
  assert(IMS.rentals.length === rlBefore + 1, "rental create routed through store repo");

  IMS.store.save();
  const snapRaw = window.localStorage.getItem("ims.store");
  assert(!!snapRaw, "store snapshot written to localStorage on save");
  if (snapRaw) {
    const parsed = JSON.parse(snapRaw);
    assert(parsed._v === 2, "snapshot uses current schema version");
    assert(parsed.itemInstances.some(a => a.id === "TT-GATE-1"), "snapshot includes the new item record");
    assert(Array.isArray(parsed.settings.branches) && Array.isArray(parsed.settings.categories.serialized) && Array.isArray(parsed.rentals), "snapshot covers item catalog + settings + rentals");
    assert(Array.isArray(parsed.orders) && Array.isArray(parsed.movements) && Array.isArray(parsed.labor), "snapshot still covers orders/movements/labor");
  }

  /* 15. Column-profile grids (Inventory) */
  showView("inventory");
  App.invTab = "serialized";
  renderInvPanel();
  let invHeads = () => Array.from(doc.querySelectorAll("#invPanel .table thead th")).map(t => t.textContent.trim());
  let heads0 = invHeads();
  assert(heads0.length === 10 && heads0[0] === "Asset ID" && heads0.includes("Meter Hrs") && heads0[heads0.length - 1] === "Actions", "inventory serialized grid renders default columns");
  const gridRows = doc.querySelectorAll("#invPanel tbody tr");
  assert(gridRows.length > 0 && gridRows[0].querySelectorAll("td").length === 10, "grid rows align with visible columns");
  localStorage.setItem("ims.cols.inv-serialized", JSON.stringify({ meter: false }));
  renderInvPanel();
  const heads1 = invHeads();
  assert(!heads1.includes("Meter Hrs") && heads1.length === 9, "hiding a column removes it and re-renders");
  assert(doc.querySelectorAll("#invPanel tbody tr")[0].querySelectorAll("td").length === 9, "row cells follow hidden column");
  localStorage.removeItem("ims.cols.inv-serialized");
  renderInvPanel();
  assert(invHeads().length === 10, "reset restores default columns");

  ["bulk", "consumable", "parts", "labor", "attachments"].forEach(tb => {
    App.invTab = tb;
    try {
      renderInvPanel();
      const hasBody = !!doc.querySelector("#invPanel .table tbody tr");
      assert(hasBody, "inventory '" + tb + "' grid renders rows");
    } catch (e) { failures++; out.push("  FAIL: inv tab '" + tb + "': " + (e && e.message)); }
  });
  App.invTab = "serialized"; renderInvPanel();

  /* 16. Column-profile grids (Parties & Orders) */
  showView("orders");
  App.ccTab = "customers"; renderCcPanel();
  const custHeads = Array.from(doc.querySelectorAll("#ccPanel .table thead th")).map(t => t.textContent.trim());
  assert(custHeads.length === 6 && custHeads[0] === "Customer" && custHeads[custHeads.length - 1] === "Actions", "customers grid renders default columns");
  assert(doc.querySelectorAll("#ccPanel tbody tr").length > 0, "customers grid has rows");
  localStorage.setItem("ims.cols.cc-contracts", JSON.stringify({ project: false }));
  App.ccTab = "orders"; App.contractFilter = "active"; renderCcPanel();
  const oHeads = Array.from(doc.querySelectorAll("#ccPanel .table thead th")).map(t => t.textContent.trim());
  assert(oHeads.length === 7 && !oHeads.includes("Project") && oHeads[0] === "Contract", "contracts grid honors hidden column");
  assert(doc.querySelectorAll("#ccPanel tbody tr")[0].querySelectorAll("td").length === 7, "contracts rows follow visible columns");
  localStorage.removeItem("ims.cols.cc-contracts");
  App.ccTab = "customers"; renderCcPanel();

  /* 17. Column-profile grid (Yard inspections) */
  showView("yard");
  renderInspLog();
  const yHeads = () => Array.from(doc.querySelectorAll("#inspGridWrap .table thead th")).map(t => t.textContent.trim());
  let yh = yHeads();
  assert(yh.length === 9 && yh[0] === "Insp #" && yh[yh.length - 1] === "Overage", "yard inspection grid renders default columns");
  assert(doc.querySelectorAll("#inspGridWrap tbody tr").length > 0, "yard inspection grid has rows");
  localStorage.setItem("ims.cols.yard-insp", JSON.stringify({ overage: false }));
  renderInspLog();
  yh = yHeads();
  assert(yh.length === 8 && !yh.includes("Overage"), "yard grid honors hidden column");
  localStorage.removeItem("ims.cols.yard-insp");
  renderInspLog();

  /* 18. Column-profile grid (Invoicing ledger) */
  showView("invoicing");
  App.invFilter = "all"; renderInvoicing();
  const ilHeads = () => Array.from(doc.querySelectorAll("#invLedgerWrap .table thead th")).map(t => t.textContent.trim());
  let ilh = ilHeads();
  assert(ilh.length === 9 && ilh[0] === "Invoice" && ilh[7] === "Total" && ilh[8] === "Status", "invoicing ledger renders default columns");
  assert(doc.querySelectorAll("#invLedgerWrap tbody tr").length > 0, "invoicing ledger has rows");
  localStorage.setItem("ims.cols.inv-ledger", JSON.stringify({ waiver: false }));
  renderInvoicing();
  ilh = ilHeads();
  assert(ilh.length === 8 && !ilh.includes("Waiver"), "invoicing ledger honors hidden column");
  localStorage.removeItem("ims.cols.inv-ledger");
  renderInvoicing();

  /* 19. Column-profile grids (categories + rerents) */
  showView("categories");
  App.catType = "serialized"; renderCategories();
  const catHeads = () => Array.from(doc.querySelectorAll("#catPanel .table thead th")).map(t => t.textContent.trim());
  let cath = catHeads();
  assert(cath.length === 4 && cath[0] === "Category" && cath[3] === "Actions", "categories grid renders default columns");
  assert(doc.querySelectorAll("#catPanel tbody tr").length > 0, "categories grid has rows");
  localStorage.setItem("ims.cols.cat-cats", JSON.stringify({ items: false }));
  renderCategories();
  cath = catHeads();
  assert(cath.length === 3 && !cath.includes("Items"), "categories grid honors hidden column");
  localStorage.removeItem("ims.cols.cat-cats");
  renderCategories();

  showView("rerents");
  renderRerents();
  const rrHeads = Array.from(doc.querySelectorAll("#content .card-body .table thead th")).map(t => t.textContent.trim());
  assert(rrHeads.length === 7 && rrHeads[0] === "Asset" && rrHeads[6] === "Net Spread", "rerents grid renders default columns");
  assert(doc.querySelectorAll("#content .card-body .table tbody tr").length > 0, "rerents grid has rows");

  /* 20. Column-profile grids (Geo fleet + Pricing tax/overhead) */
  showView("geo");
  renderGeoTable();
  const geofHeads = () => Array.from(doc.querySelectorAll("#geoGridWrap .table thead th")).map(t => t.textContent.trim());
  let geofh = geofHeads();
  assert(geofh.length === 5 && geofh[0] === "Asset" && geofh[4] === "Meter Hrs", "geo fleet grid renders default columns");
  assert(doc.querySelectorAll("#geoGridWrap tbody tr").length > 0, "geo fleet grid has rows");
  localStorage.setItem("ims.cols.geo-fleet", JSON.stringify({ reported: false }));
  renderGeoTable();
  geofh = geofHeads();
  assert(geofh.length === 4 && !geofh.includes("Last Reported"), "geo fleet grid honors hidden column");
  localStorage.removeItem("ims.cols.geo-fleet");
  renderGeoTable();

  showView("pricing");
  renderPricing();
  const taxHeads = () => Array.from(doc.querySelectorAll("#taxGridWrap .table thead th")).map(t => t.textContent.trim());
  let taxh = taxHeads();
  assert(taxh.length === 7 && taxh[0] === "Code" && taxh[6] === "Actions", "pricing tax grid renders default columns");
  assert(doc.querySelectorAll("#taxGridWrap tbody tr").length > 0, "pricing tax grid has rows");
  localStorage.setItem("ims.cols.tax-grid", JSON.stringify({ note: false }));
  renderPricing();
  taxh = taxHeads();
  assert(taxh.length === 6 && !taxh.includes("Note"), "pricing tax grid honors hidden column");
  localStorage.removeItem("ims.cols.tax-grid");
  renderPricing();
  const ohHeads = Array.from(doc.querySelectorAll("#ohGridWrap .table thead th")).map(t => t.textContent.trim());
  assert(ohHeads.length === 7 && ohHeads[0] === "Fee / Asset Name" && ohHeads[6] === "Actions", "pricing overhead grid renders default columns");
  assert(doc.querySelectorAll("#ohGridWrap tbody tr").length > 0, "pricing overhead grid has rows");

  /* 21. Column-profile grid (Logistics driver assignment) */
  showView("logistics");
  renderLogistics();
  const logiHeads = () => Array.from(doc.querySelectorAll("#dspGridWrap .table thead th")).map(t => t.textContent.trim());
  let logih = logiHeads();
  assert(logih.length === 7 && logih[0] === "Route" && logih[1] === "Dispatch" && logih[6] === "Status", "logistics grid renders default columns");
  assert(doc.querySelectorAll("#dspGridWrap tbody tr").length > 0, "logistics grid has rows");
  localStorage.setItem("ims.cols.log-dispatch", JSON.stringify({ site: false }));
  renderLogistics();
  logih = logiHeads();
  assert(logih.length === 6 && !logih.includes("Site"), "logistics grid honors hidden column");
  localStorage.removeItem("ims.cols.log-dispatch");
  renderLogistics();

  /* 22. Track B: metadata registry + ext accessor (additive) */
  assert(!!IMS.metadata && IMS.metadata.version === 1, "IMS.metadata registry module present");
  assert(IMS.metadata.registry.length >= 10, "metadata registry has core vertical entries");
  assert(IMS.metadata.verticals.HeavyEquipment && IMS.metadata.verticals.Healthcare, "metadata defines HeavyEquipment + Healthcare verticals");
  assert(IMS.metadata.vertical() === "HeavyEquipment", "default active vertical is HeavyEquipment");
  assert(IMS.metadata.registryFor("Healthcare").length > 0, "Healthcare vertical exposes extended attributes");
  ["Rental", "Lumberyard", "Warehouse"].forEach(v =>
    assert(!!IMS.metadata.verticals[v] && IMS.metadata.registryFor(v).length > 0, v + " vertical registered with extended attributes"));
  const metA = getAsset("BL-118");
  assert(IMS.metadata.ext(getAsset("TT-GATE-1"), "make") === "Test", "ext() reads flat field via registry path (no extended_attributes on a legacy record)");
  assert(IMS.metadata.ext({ extended_attributes: { meter_hours: 999 } }, "meter_hours") === 999, "ext() prefers extended_attributes over flat path");
  assert(IMS.metadata.getPath({ extended_attributes: { expiration_date: "2029-04-12" } }, "extended_attributes.expiration_date") === "2029-04-12", "getPath reads nested JSONB-style path");

  let extSaved = null;
  openFormModal({ id: "tfext", title: "X", fields: [
    { key: "a", label: "A", type: "text", value: "x" },
    { key: "lot", label: "Lot Number", type: "text", value: "L1", bucket: "extended_attributes" }
  ], onSave: v => { extSaved = v; } });
  doc.getElementById("tfext-save").click();
  assert(extSaved && extSaved.a === "x" && extSaved.extended_attributes && extSaved.extended_attributes.lot === "L1", "openFormModal bucket field saves into extended_attributes");

  /* 23. B3-lite: canonical core fields + extended_attributes bucket on items */
  const coreA = getAsset("BL-118");
  assert(coreA && coreA.id && coreA.sku && coreA.status && coreA.createdAt, "serialized item has canonical core id/sku/status/createdAt");
  assert(typeof coreA.name === "string" && coreA.name.length > 0, "serialized item has a core name (make + model)");
  assert(coreA.hasOwnProperty("purchaseValue") && coreA.hasOwnProperty("locationId"), "serialized item has core purchaseValue + locationId");
  assert(coreA.extended_attributes && typeof coreA.extended_attributes === "object", "serialized item has an extended_attributes JSONB bucket");
  const coreP = IMS.itemRegistry.getByType("consumable")[0];
  assert(coreP && coreP.name && coreP.id && coreP.extended_attributes && typeof coreP.extended_attributes === "object", "consumable item also has core + extended_attributes bucket");
  assert(coreA.extended_attributes.fuel_type === "Diesel" && coreA.fuelType === undefined, "B3 field relocation: fuel_type lives in extended_attributes, flat removed");
  const ser2 = IMS.itemRegistry.getByType("serialized")[1];
  assert(ser2 && IMS.metadata.ext(ser2, "fuel_type") && ser2.fuelType === undefined, "fuel_type relocation applied across serialized seed");
  assert(typeof coreA.extended_attributes.meter_hours === "number" && coreA.meterHours === undefined, "meter_hours relocated into extended_attributes");
  assert(ser2 && IMS.metadata.ext(ser2, "meter_hours") > 0 && ser2.meterHours === undefined, "meter_hours relocation applied across serialized seed");
  assert(coreA.extended_attributes.make === "JLG" && coreA.extended_attributes.model === "450AJ" && coreA.make === undefined && coreA.model === undefined, "make/model relocated into extended_attributes");
  assert(IMS.metadata.mkName(coreA) === "JLG 450AJ" && IMS.metadata.mk(coreA) === "JLG" && IMS.metadata.mdl(coreA) === "450AJ", "mkName/mk/mdl read relocated make/model");
  assert(!!coreA.extended_attributes.serial_vin && coreA.serial === undefined, "serial_vin relocated into extended_attributes");
  assert(IMS.metadata.ext(coreA, "serial_vin") === coreA.extended_attributes.serial_vin, "ext() reads relocated serial_vin");

  /* 24. Vertical drives Items & Stock tabs (chosen on Feature Modules) */
  IMS.metadata.setVertical("HeavyEquipment");
  showView("inventory");
  const heavyTabs = Array.from(doc.querySelectorAll("#invTabs .subtab")).map(b => b.dataset.tab);
  assert(heavyTabs.includes("serialized") && !heavyTabs.includes("medical"), "HeavyEquipment Items & Stock shows serialized, no medical");
  assert(["consumable", "parts", "bulk"].every(t => heavyTabs.includes(t)), "shared base tabs (consumable/parts/bulk) always present");

  IMS.metadata.setVertical("Healthcare");
  renderInventory();
  const medTabs = Array.from(doc.querySelectorAll("#invTabs .subtab")).map(b => b.dataset.tab);
  assert(medTabs.includes("medical") && !medTabs.includes("serialized"), "Healthcare Items & Stock swaps serialized for a medical tab");
  assert(["consumable", "parts", "bulk"].every(t => medTabs.includes(t)), "Healthcare keeps shared base tabs");

  App.invTab = "medical"; renderInvPanel();
  const medHeads = Array.from(doc.querySelectorAll("#invPanel .table thead th")).map(t => t.textContent.trim());
  assert(medHeads.includes("Lot Number") && medHeads.includes("Expiration Date") && medHeads.includes("FDA Class"), "medical tab grid columns come from the Healthcare registry");
  const hcBefore = IMS.healthcare.length;
  try {
    healthcareModal(null);
    doc.getElementById("mdl-health-expiration_date").value = "2032-05-05";
    doc.getElementById("mdl-health-save").click();
    const added = IMS.healthcare[IMS.healthcare.length - 1];
    assert(IMS.healthcare.length === hcBefore + 1 && added.extended_attributes.expiration_date === "2032-05-05", "medical tab item round-trips extended_attributes via bucket save");
  } catch (e) { failures++; out.push("  FAIL: healthcareModal: " + (e && e.message)); }

  /* config page exposes the vertical selector incl. new verticals */
  showView("config");
  const vertSel = doc.getElementById("modVertical");
  const vertVals = vertSel ? Array.from(vertSel.options).map(o => o.value) : [];
  assert(!!vertSel && ["HeavyEquipment", "Rental", "Healthcare", "Lumberyard", "Warehouse"].every(v => vertVals.includes(v)), "Feature Modules vertical selector lists all verticals");

  IMS.metadata.setVertical("Rental"); renderInventory();
  const rentalTabs = Array.from(doc.querySelectorAll("#invTabs .subtab")).map(b => b.dataset.tab);
  assert(rentalTabs.includes("serialized") && rentalTabs.includes("kits"), "Rental vertical shows serialized + kits");
  IMS.metadata.setVertical("Lumberyard"); renderInventory();
  const lumTabs = Array.from(doc.querySelectorAll("#invTabs .subtab")).map(b => b.dataset.tab);
  assert(lumTabs.includes("bulk") && lumTabs.includes("parts") && !lumTabs.includes("serialized") && !lumTabs.includes("medical"), "Lumberyard vertical is a base stock catalog (bulk/parts, no serialized/medical)");

  IMS.metadata.setVertical("HeavyEquipment");   // restore default for downstream/UI
  renderInventory();

  /* 25. Vertical-aware extended attributes on shared base catalogs */
  const bulkRec = IMS.itemRegistry.getByType("bulk")[0];
  IMS.metadata.setVertical("Lumberyard");
  try {
    openVerticalExtras("bulk", bulkRec);
    const spEl = doc.getElementById("mdl-vext-species");
    assert(!!spEl, "extended-attributes editor opens with the active vertical's fields");
    spEl.value = "Southern Yellow Pine";
    doc.getElementById("mdl-vext-grade").value = "Select Structural";
    doc.getElementById("mdl-vext-save").click();
    assert(bulkRec.extended_attributes && bulkRec.extended_attributes.species === "Southern Yellow Pine" && bulkRec.extended_attributes.grade === "Select Structural", "Lumberyard extended attributes saved onto a bulk item");
  } catch (e) { failures++; out.push("  FAIL: openVerticalExtras: " + (e && e.message)); }
  IMS.metadata.setVertical("HeavyEquipment");

  /* 26. Base grids show the active vertical's extended columns (Lumberyard) */
  IMS.metadata.setVertical("Lumberyard");
  App.invTab = "bulk"; renderInventory();
  const bHeads = Array.from(doc.querySelectorAll("#invPanel .table thead th")).map(t => t.textContent.trim());
  assert(bHeads.includes("Species") && bHeads.includes("Grade") && bHeads.includes("Moisture (%)"), "bulk grid shows Lumberyard extended columns when vertical = Lumberyard");
  const bRow = doc.querySelector('#invPanel tr[data-edit="' + bulkRec.sku + '"]');
  const bCells = bRow ? Array.from(bRow.querySelectorAll("td")).map(t => t.textContent.trim()) : [];
  assert(bCells[bHeads.indexOf("Species")] === "Southern Yellow Pine", "saved Lumberyard species value renders in the bulk grid");
  IMS.metadata.setVertical("HeavyEquipment");
  renderInventory();

  /* 27. Base-catalog add/edit forms include the active vertical's extended fields */
  IMS.metadata.setVertical("Warehouse");
  try {
    const pBefore = IMS.itemRegistry.getByType("part").length;
    partsModal(null);
    const stEl = doc.getElementById("mdl-part-storage_class");
    assert(!!stEl, "parts (Stock Inventory) form includes Warehouse extended field");
    stEl.value = "Ambient";
    doc.getElementById("mdl-part-save").click();
    const lastPart = IMS.itemRegistry.getByType("part")[IMS.itemRegistry.getByType("part").length - 1];
    assert(IMS.itemRegistry.getByType("part").length === pBefore + 1 && lastPart.extended_attributes && lastPart.extended_attributes.storage_class === "Ambient", "new part persists Warehouse extended_attributes from the form");
  } catch (e) { failures++; out.push("  FAIL: partsModal vertical ext: " + (e && e.message)); }
  IMS.metadata.setVertical("HeavyEquipment");
  renderInventory();

  /* 28. #1 Rental equipment label + #2 search over is_searchable fields */
  IMS.metadata.setVertical("Rental");
  App.invTab = "serialized"; App.invSearch = "";
  renderInventory();
  const tabTexts = Array.from(doc.querySelectorAll("#invTabs .subtab")).map(b => b.textContent);
  assert(tabTexts.some(t => t.includes("Rental Equipment")), "Rental vertical labels the equipment tab 'Rental Equipment'");
  const allRows = doc.querySelectorAll("#invPanel tbody tr").length;
  App.invSearch = "diesel";             // fuel_type is searchable for Rental
  renderInvPanel();
  const filRows = doc.querySelectorAll("#invPanel tbody tr").length;
  assert(allRows > 0 && filRows > 0 && filRows < allRows, "search narrows equipment rows via a searchable vertical attribute (fuel)");
  App.invSearch = "jlg";                // matches core name (JLG …)
  renderInvPanel();
  assert(doc.querySelectorAll("#invPanel tbody tr").length >= 1, "search finds equipment by core text (make in name)");
  App.invSearch = "";
  IMS.metadata.setVertical("HeavyEquipment");
  renderInventory();

  /* 29. Receive goods: adds quantity and logs the receipt */
  showView("inventory"); App.invTab = "consumable"; App.invSearch = ""; renderInventory();
  const consRec = IMS.itemRegistry.getByType("consumable")[0];
  const cBefore = consRec.qtyOnHand || 0;
  const rcBefore = (IMS.receivings || []).length;
  try {
    receiveGoods("consumable", consRec.sku);
    const qEl = doc.getElementById("mdl-recv-qty");
    assert(!!qEl, "receive-goods form opens");
    qEl.value = 5;
    doc.getElementById("mdl-recv-source").value = "PO-2026-01";
    doc.getElementById("mdl-recv-save").click();
    assert(consRec.qtyOnHand === cBefore + 5, "consumable qtyOnHand increased by received quantity");
    const rcLast = (IMS.receivings || [])[IMS.receivings.length - 1];
    assert((IMS.receivings || []).length === rcBefore + 1 && rcLast.qtyAdded === 5 && rcLast.refId === consRec.sku, "receiving log records the added quantity");
    IMS.store.save();
    const rSnap = JSON.parse(window.localStorage.getItem("ims.store"));
    assert(rSnap && Array.isArray(rSnap.receivings) && rSnap.receivings.length >= 1, "receivings persisted in the store snapshot");
  } catch (e) { failures++; out.push("  FAIL: receiveGoods: " + (e && e.message)); }

  /* 30. Receiving Log view makes recorded receipts visible */
  try {
    const rlogBtn = doc.getElementById("invRecvLogBtn");
    assert(!!rlogBtn, "Receiving Log button present on Items & Stock");
    rlogBtn.click();
    const tbody = doc.querySelector("#mdl-recvlog tbody");
    assert(!!tbody, "receiving log modal opens");
    const rtxt = tbody.textContent;
    assert(rtxt.indexOf(consRec.sku) !== -1 && rtxt.indexOf("+5") !== -1, "receiving log shows the item and the quantity added");
  } catch (e) { failures++; out.push("  FAIL: receiving log view: " + (e && e.message)); }

  /* 31. Per-item receiving history inside the stock item View */
  try {
    consumableView(consRec);
    const mv = doc.querySelector("#mdl-coview");
    const mvText = mv ? mv.textContent : "";
    assert(!!mv && mvText.indexOf("Receiving History") !== -1 && mvText.indexOf("+5") !== -1, "item view shows per-item receiving history");
  } catch (e) { failures++; out.push("  FAIL: per-item receiving history: " + (e && e.message)); }

  /* 32. Bulk receive: several line items from one PO */
  try {
    App.invTab = "consumable"; renderInventory();
    bulkReceiveModal();
    const bm = doc.getElementById("mdl-brecv");
    assert(!!bm && bm.textContent.indexOf("Consumables") !== -1, "bulk receive modal opens with the current catalog");
    const tgt = Array.from(bm.querySelectorAll(".br-qty")).find(i => i.dataset.ref === consRec.sku);
    assert(!!tgt, "bulk receive lists the consumable for qty entry");
    const brBefore = consRec.qtyOnHand, rcb = (IMS.receivings || []).length;
    tgt.value = 3;
    bm.querySelector("#br-source").value = "PO-2026-02";
    bm.querySelector("#br-save").click();
    assert(consRec.qtyOnHand === brBefore + 3 && (IMS.receivings || []).length === rcb + 1, "bulk receive adds each qty and logs a receipt per line");
  } catch (e) { failures++; out.push("  FAIL: bulk receive: " + (e && e.message)); }

  /* 33. Last-received tooltip + per-line delete (undo the newest receipt) */
  try {
    renderInventory();
    const tipEl = doc.querySelector("#invPanel span[data-lastrecv]");
    assert(!!tipEl && (tipEl.getAttribute("title") || "").indexOf("Last received") === 0, "on-hand cell exposes a last-received tooltip");
    receivingLogModal();
    const rmBtn = doc.querySelector("#mdl-recvlog [data-delrcv]");
    assert(!!rmBtn, "newest receipt has a Remove action in the log");
    const last = (IMS.receivings || [])[(IMS.receivings || []).length - 1];
    const beforeDel = consRec.qtyOnHand, rcBeforeDel = (IMS.receivings || []).length;
    assert(!!last && last.refId === consRec.sku, "newest receipt targets the tested consumable");
    rmBtn.click();
    assert(!(IMS.receivings || []).some(r => r.id === last.id) && (IMS.receivings || []).length === rcBeforeDel - 1, "receipt removed from the log");
    assert(consRec.qtyOnHand === beforeDel - last.qtyAdded, "removing a receipt reverts its added quantity");
  } catch (e) { failures++; out.push("  FAIL: tooltip + receipt delete: " + (e && e.message)); }

  window.__gateFailures = failures;
  window.__gateLog = out;
})();
`);

const log = window.__gateLog || ["(no test log captured)"];
log.forEach(l => console.log(l));
const f = window.__gateFailures;
if (f === undefined) { console.error("\nGATE ABORTED: the page test did not complete (see errors above)"); process.exit(2); }
console.log(f ? "\nGATE FAILED with " + f + " failure(s)" : "\nGATE PASSED");
process.exit(f ? 1 : 0);
