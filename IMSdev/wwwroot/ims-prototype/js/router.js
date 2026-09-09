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
  branches:"Locations", pricing:"Pricing & Policies", categories:"Categories & Types"
};
const RENDER = { dashboard: renderDashboard, inventory: renderInventory, orders: renderCustomersContracts, scheduler: renderScheduler, handoff: renderHandoff, geo: renderGeo, logistics: renderLogistics, maintenance: renderMaintenance, timesheet: renderTimesheet, yard: renderYard, invoicing: renderInvoicing, rerents: renderRerents, branches: renderBranches, pricing: renderPricing, categories: renderCategories };
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
  categories:"Core: manage item type / category options across the catalog."
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
      const con = getOrder(inv.orderId);
      if (con) inv.baseAmount = orderRentalForPeriod(con, inv.cycleStart, inv.cycleEnd);
    }
  });

  initSim();
  updateBadges();
  App.simTimer = setInterval(geoSimTick, 2500);  /* live GPS telemetry loop */

  showView("dashboard");
}

document.addEventListener("DOMContentLoaded", init);
