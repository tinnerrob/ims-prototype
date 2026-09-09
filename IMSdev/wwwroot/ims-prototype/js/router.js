/* =========================================================
   IMS — router.js (split out of app.js)
   Navigation router (view map + showView) and app bootstrap (init / DOMContentLoaded).
   ========================================================= */
"use strict";

/* =========================================================
   NAVIGATION / ROUTER
   ========================================================= */
const TITLES = {
  dashboard:"Operations Dashboard", inventory:"Items & Stock", orders:"Parties & Orders", scheduler:"Allocations",
  handoff:"Item Hand-Off & Custody", geo:"Fleet Telemetry", logistics:"Logistics & Dispatch", maintenance:"Field Service & Maintenance",
  timesheet:"Labor & Timesheets", yard:"Receiving / Inspections", invoicing:"Billing & Invoicing", rerents:"Rentals / Sub-Rentals",
  branches:"Locations", pricing:"Pricing & Policies", categories:"Categories & Types", config:"Feature Modules"
};
const RENDER = { dashboard: renderDashboard, inventory: renderInventory, orders: renderOrdersParties, scheduler: renderScheduler, handoff: renderHandoff, geo: renderGeo, logistics: renderLogistics, maintenance: renderMaintenance, timesheet: renderTimesheet, yard: renderYard, invoicing: renderInvoicing, rerents: renderRerents, branches: renderBranches, pricing: renderPricing, categories: renderCategories, config: renderConfig };
const DESCRIPTIONS = {
  dashboard:"Aggregated operational metrics from the inventory core and enabled modules.",
  inventory:"Core catalog: typed items, stock quantities, and on-hand levels across the inventory.",
  orders:"Counterparties (customers, vendors, sites) and the orders placed against inventory.",
  scheduler:"Module: planned availability and allocation of inventory over time.",
  handoff:"Core: custody & movement of items — issue out, receive/return, and chain of custody.",
  geo:"Module: live fleet telemetry and geofence monitoring for tracked items.",
  logistics:"Module: dispatch board for deliveries, pickups, and route assignment.",
  maintenance:"Module: field service and maintenance work orders against item instances.",
  timesheet:"Module: labor time records against orders and work orders.",
  yard:"Core: receiving, inspection, and check-in of items to locations.",
  invoicing:"Module: billing derived from priced orders.",
  rerents:"Module: rentals and sub-rental loans sourced from third-party vendors.",
  branches:"Core: location hierarchy (yards, branches, warehouses, bins).",
  pricing:"Policies: optional pricing, tax, and overhead rules applied to orders.",
  categories:"Core: manage item type / category options across the catalog.",
  config:"Administration: enable or disable industry modules layered on the inventory core."
};

/* =========================================================
   MODULE MANIFEST (industry modules over the IMS core)
   Core views are always on. Each optional module can be
   disabled per tenant via IMS.settings.featureModules.
   Default: every module is enabled.
   ========================================================= */
const MODULE_VIEW = {
  scheduler: "scheduling",
  logistics: "dispatch",
  geo: "telemetry",
  timesheet: "labor",
  maintenance: "service",
  rerents: "rentals",
  invoicing: "billing"
};
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

document.addEventListener("DOMContentLoaded", init);
