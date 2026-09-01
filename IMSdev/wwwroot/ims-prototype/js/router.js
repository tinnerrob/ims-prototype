/* =========================================================
   IMS — router.js (split out of app.js)
   Navigation router (view map + showView) and app bootstrap (init / DOMContentLoaded).
   ========================================================= */
"use strict";

/* =========================================================
   NAVIGATION / ROUTER
   ========================================================= */
const TITLES = { dashboard:"Dashboard", inventory:"Inventory & Assets", contracts:"Customers & Contracts", scheduler:"Scheduler", geo:"Geo Asset Tracking", logistics:"Logistics Board", maintenance:"Service & Maintenance", timesheet:"Labor & Timesheets", yard:"Yard Inspections", invoicing:"Cycle Invoicing", rerents:"Sub-Rentals", branches:"Branch / Yard Profiles", pricing:"Pricing Rules", categories:"Resource Categories" };
const RENDER = { dashboard: renderDashboard, inventory: renderInventory, contracts: renderCustomersContracts, scheduler: renderScheduler, geo: renderGeo, logistics: renderLogistics, maintenance: renderMaintenance, timesheet: renderTimesheet, yard: renderYard, invoicing: renderInvoicing, rerents: renderRerents, branches: renderBranches, pricing: renderPricing, categories: renderCategories };
const DESCRIPTIONS = {
  dashboard:"Aggregated business metrics from all mocked data engines.",
  inventory:"Structural database tables driving scheduling, costing and dispatch.",
  contracts:"Customer records, their rental contracts, and status control (active ↔ closed).",
  scheduler:"Stage multi-resource line items on a contract timeline and tune the pricing rules engine.",
  geo:"Dispatch control — live fleet telemetry and geofence monitoring.",
  logistics:"Dispatch board for deliveries, pickups and route assignment.",
  maintenance:"Work orders, service actions and parts drawn from consumables inventory.",
  timesheet:"Employee time punched against contracts and maintenance work orders.",
  yard:"Asset in/out inspection portal with meter & fuel tracking and overage flags.",
  invoicing:"28-day cycle billing ledger for long-term contract lifecycles.",
  rerents:"Sub-rentals sourced from third-party vendors with spread analysis.",
  branches:"Configure branch / yard locations and facilities.",
  pricing:"Global pricing rules engine, localized tax schedule and overhead fee configs.",
  categories:"Manage the active category options for all inventory resource types."
};

function showView(id){
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
  $("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#notifBtn").addEventListener("click", () => showView("geo"));

  $("#globalSearch").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const q = e.target.value.trim();
      if (!q) return;
      App.geoFilter = q;
      showView("geo");
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
      const con = getContract(inv.contractId);
      if (con) inv.baseAmount = contractRentalForPeriod(con, inv.cycleStart, inv.cycleEnd);
    }
  });

  initSim();
  updateBadges();
  App.simTimer = setInterval(geoSimTick, 2500);  /* live GPS telemetry loop */

  showView("dashboard");
}

document.addEventListener("DOMContentLoaded", init);
