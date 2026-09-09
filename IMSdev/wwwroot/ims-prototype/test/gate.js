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

  window.__gateFailures = failures;
  window.__gateLog = out;
})();
`);

const log = window.__gateLog || ["(no test log captured)"];
log.forEach(l => console.log(l));
const f = window.__gateFailures;
console.log(f ? "\nGATE FAILED with " + f + " failure(s)" : "\nGATE PASSED");
process.exit(f ? 1 : 0);
