/* =========================================================
   IMS — router.js (split out of app.js)
   Navigation router (view map + showView) and app bootstrap (init / DOMContentLoaded).
   ========================================================= */
"use strict";

/* =========================================================
   VIEW / MODULE REGISTRY — single source of truth.
   Each VIEWS entry: { id, title, render, module, group, desc }
     module : module key when the view belongs to an opt-in module
              (null for always-on views)
     group  : 'core' | 'policies' | 'admin' | 'module'
   Adding a feature = one entry here + its nav item in index.html.
   The legacy consts (RENDER/TITLES/DESCRIPTIONS/MODULE_VIEW) are
   DERIVED from VIEWS so existing callers keep working unchanged.
   ========================================================= */
const VIEWS = [
  /* ---- Core (always on) ---- */
  { id:"dashboard",  title:"Operations Dashboard",    render:renderDashboard,    module:null, group:"core",     desc:"Aggregated operational metrics from the inventory core and enabled modules." },
  { id:"inventory",  title:"Items & Stock",           render:renderInventory,    module:null, group:"core",     desc:"Core catalog: typed items, stock quantities, and on-hand levels across the inventory." },
  { id:"orders",     title:"Parties & Orders",        render:renderOrdersParties,module:null, group:"core",     desc:"Counterparties (customers, vendors, sites) and the orders placed against inventory." },
  { id:"handoff",    title:"Item Hand-Off & Custody", render:renderHandoff,      module:null, group:"core",     desc:"Core: custody & movement of items — issue out, receive/return, and chain of custody." },
  { id:"yard",       title:"Receiving / Inspections", render:renderYard,         module:null, group:"core",     desc:"Core: receiving, inspection, and check-in of items to locations." },
  { id:"branches",   title:"Locations",               render:renderBranches,     module:null, group:"core",     desc:"Core: location hierarchy (yards, branches, warehouses, bins)." },
  { id:"categories", title:"Categories & Types",      render:renderCategories,   module:null, group:"core",     desc:"Core: manage item type / category options across the catalog." },
  /* ---- Policies (optional pricing) ---- */
  { id:"pricing",    title:"Pricing & Policies",      render:renderPricing,      module:null, group:"policies", desc:"Policies: optional pricing, tax, and overhead rules applied to orders." },
  /* ---- Administration ---- */
  { id:"config",     title:"Feature Modules",         render:renderConfig,       module:null, group:"admin",    desc:"Administration: enable or disable industry modules layered on the inventory core." },
  /* ---- Industry modules (opt-in, gated by IMS.settings.featureModules) ---- */
  { id:"scheduler",  title:"Allocations",             render:renderScheduler,    module:"scheduling", group:"module", desc:"Module: planned availability and allocation of inventory over time." },
  { id:"logistics",  title:"Logistics & Dispatch",    render:renderLogistics,    module:"dispatch",   group:"module", desc:"Module: dispatch board for deliveries, pickups, and route assignment." },
  { id:"geo",        title:"Fleet Telemetry",         render:renderGeo,          module:"telemetry",  group:"module", desc:"Module: live fleet telemetry and geofence monitoring for tracked items." },
  { id:"timesheet",  title:"Labor & Timesheets",      render:renderTimesheet,    module:"labor",      group:"module", desc:"Module: labor time records against orders and work orders." },
  { id:"maintenance",title:"Field Service & Maintenance", render:renderMaintenance, module:"service", group:"module", desc:"Module: field service and maintenance work orders against item instances." },
  { id:"rerents",    title:"Rentals / Sub-Rentals",   render:renderRerents,      module:"rentals",    group:"module", desc:"Module: rentals and sub-rental loans sourced from third-party vendors." },
  { id:"invoicing",  title:"Billing & Invoicing",     render:renderInvoicing,    module:"billing",    group:"module", desc:"Module: billing derived from priced orders." }
];

/* Derived lookup maps (legacy public globals — used by showView, gating, config).
   Single source of truth is VIEWS above. */
const RENDER = {}; const TITLES = {}; const DESCRIPTIONS = {}; const MODULE_VIEW = {};
VIEWS.forEach(v => {
  RENDER[v.id] = v.render; TITLES[v.id] = v.title; DESCRIPTIONS[v.id] = v.desc;
  if (v.module) MODULE_VIEW[v.id] = v.module;
});

/* Module display labels. Modules are core-only today (see MODULE_DEPS below). */
const MODULE_META = {
  scheduling: "Scheduling / Allocations",
  dispatch: "Logistics & Dispatch",
  telemetry: "Fleet Telemetry",
  labor: "Labor & Timesheets",
  service: "Field Service",
  rentals: "Rentals & Sub-Rentals",
  billing: "Billing & Invoicing"
};
/* Module -> modules it requires. All modules are core-only today (the cleanest
   state); this map enforces that a module is never disabled while another
   enabled module depends on it. */
const MODULE_DEPS = {};
function orphanedIfDisabled(name, flags){
  const blockers = [];
  Object.keys(MODULE_DEPS).forEach(m => {
    if (MODULE_DEPS[m].indexOf(name) >= 0 && flags[m] !== false) blockers.push(MODULE_META[m] || m);
  });
  return blockers;
}
const viewModule = id => MODULE_VIEW[id] || null;
const moduleEnabled = id => {
  const m = viewModule(id);
  if (!m) return true;                       // core view
  const flags = IMS.settings && IMS.settings.featureModules;
  return flags ? flags[m] !== false : true;  // default on
};
function applyModuleNav(){
  document.querySelectorAll(".nav-item").forEach(b => {
    const m = viewModule(b.dataset.view);
    b.classList.toggle("hidden", m ? !moduleEnabled(b.dataset.view) : false);
  });
}

/* Persisted module flags (localStorage now; tenant/API config later). */
const MODULE_FLAGS_KEY = "ims.featureModules";
function loadModuleFlags(){
  try {
    if (window.localStorage){ const raw = localStorage.getItem(MODULE_FLAGS_KEY); if (raw) return JSON.parse(raw); }
  } catch(_) {}
  return (IMS.settings && IMS.settings.featureModules) || {};
}
function saveModuleFlags(flags){ try { if (window.localStorage) localStorage.setItem(MODULE_FLAGS_KEY, JSON.stringify(flags)); } catch(_) {} }


function showView(id){
  /* Disabled modules fall back to the dashboard (core is always available). */
  if (id !== "dashboard" && !moduleEnabled(id)) return showView("dashboard");
  App.view = id;
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  $("#pageTitle").textContent = TITLES[id] || "";
  $("#pageSub").textContent = DESCRIPTIONS[id] || "";
  const c = $("#content");
  c.innerHTML = "";
  RENDER[id]();
  window.scrollTo(0, 0);
}

/* =========================================================
   GLOBAL SEARCH / NOTIFICATIONS / BOOTSTRAP
   ========================================================= */
function init(){
  const d = new Date();
  $("#topbarDate").textContent = d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" });

  $$(".nav-item").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  IMS.settings.featureModules = loadModuleFlags();
  if (IMS.store && IMS.store.hydrate) IMS.store.hydrate();   /* restore persisted JSON snapshot (no-op if none) */
  if (IMS.store && IMS.store.normalizeCore) IMS.store.normalizeCore();   /* stamp canonical core + extended_attributes on items */
  applyModuleNav();   /* hide nav entries for disabled modules */
  $("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#notifBtn").addEventListener("click", () => showView(moduleEnabled("geo") ? "geo" : "dashboard"));

  $("#globalSearch").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const q = e.target.value.trim();
      if (!q) return;
      App.geoFilter = q;
      showView(moduleEnabled("geo") ? "geo" : "inventory");
      e.target.value = "";
    }
  });

  /* Seed one breach event matching the spec example so the
     dashboard / geo log show activity immediately. */
  App.breachAlerts.push({ kind:"breach", ts:"08:11:47", msg:"ALERT: Asset BL-119 exited Geofence boundary at Job Site: Downtown Plaza Renovation (120m out)" });

  /* Scope seed invoices to their current cycle: give any invoice lacking an explicit
     base amount the amount actually booked for its cycleStart..cycleEnd period. */
  IMS.invoices.forEach(inv => {
    if (inv.baseAmount == null){
      const con = getOrder(inv.orderId);
      if (con) inv.baseAmount = orderRentalForPeriod(con, inv.cycleStart, inv.cycleEnd);
    }
  });

  if (moduleEnabled("geo")) {
    initSim();
    App.simTimer = setInterval(geoSimTick, 2500);  /* live GPS telemetry loop */
  }
  updateBadges();

  showView("dashboard");
}

/* Surface a readable startup failure instead of a silent blank page. */
function bootError(e){
  const c = document.getElementById("content");
  if (!c) return;
  c.innerHTML = `
    <div class="card mt-4 mx-auto" style="max-width:680px">
      <div class="card-header"><span class="card-title"><i class="bi bi-exclamation-triangle"></i> App failed to start</span></div>
      <div class="card-body">
        <p class="text-muted2">Initialization threw an error. Try a hard refresh, or clear this site&rsquo;s storage keys <code>ims.store</code> / <code>ims.featureModules</code> and reload.</p>
        <pre class="small text-muted2 mt-2 mb-0" style="white-space:pre-wrap;overflow:auto">${String((e && e.stack) || e)}</pre>
      </div>
    </div>`;
  const t = document.getElementById("pageTitle"); if (t) t.textContent = "Startup error";
}

document.addEventListener("DOMContentLoaded", () => { try { init(); } catch (e) { bootError(e); } });
