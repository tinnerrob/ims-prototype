/* =========================================================
   IMS — config.js
   Administration: Feature Modules. Toggle industry modules on
   / off over the always-on inventory core. Toggles persist to
   localStorage (tenant/API config later) and immediately gate
   navigation + router entry points via the module manifest.
   ========================================================= */
"use strict";

const MODULE_DESC = {
  scheduling: "Plan availability and allocation of inventory over time.",
  dispatch: "Logistics board for deliveries, pickups, and route assignment.",
  telemetry: "Live fleet telemetry and geofence monitoring for tracked items.",
  labor: "Labor time records against orders and work orders.",
  service: "Field service and maintenance work orders against item instances.",
  rentals: "Rental and sub-rental loans sourced from third-party vendors.",
  billing: "Invoice generation derived from priced orders."
};

const CORE_MODULES = [
  "Operations Dashboard", "Items & Stock", "Categories & Types", "Locations",
  "Item Hand-Off & Custody", "Receiving / Inspections", "Parties & Orders"
];

function renderConfig(){
  const flags = IMS.settings.featureModules = (IMS.settings.featureModules || {});
  const vertOpts = Object.keys(IMS.metadata.verticals).map(v =>
    `<option value="${v}" ${IMS.metadata.vertical() === v ? "selected" : ""}>${IMS.metadata.verticals[v]}</option>`).join("");
  const rows = Object.keys(MODULE_META || {}).map(k => {
    const on = flags[k] !== false;
    return `<div class="list-line mod-row">
        <span class="l">
          <span class="strong">${MODULE_META[k]}</span>
          <div class="text-muted2 small">${MODULE_DESC[k] || ""}</div>
        </span>
        <span class="r">
          <div class="form-check form-switch mb-0">
            <input class="form-check-input mod-toggle" type="checkbox" id="mod-${k}" data-mod="${k}" ${on ? "checked" : ""}>
            <label class="form-check-label small" for="mod-${k}">${on ? "On" : "Off"}</label>
          </div>
        </span>
      </div>`;
  }).join("") || `<p class="text-muted2">No modules registered.</p>`;

  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card mb-3">
      <div class="card-header">
        <span class="card-title"><i class="bi bi-sliders2"></i> Industry / Vertical</span>
      </div>
      <div class="card-body">
        <div class="row g-2 align-items-end">
          <div class="col-md-6 field-group mb-0">
            <label class="form-label">Active vertical</label>
            <select class="form-select" id="modVertical">${vertOpts}</select>
          </div>
          <div class="col-md-6"><span class="text-muted2 text-12">Selects which catalog types appear on <strong>Items &amp; Stock</strong> (e.g. Healthcare shows a medical/device tab instead of serialized equipment).</span></div>
        </div>
      </div>
    </div>
    <div class="card mb-3">
      <div class="card-header">
        <span class="card-title"><i class="bi bi-toggles"></i> Feature Modules</span>
        <button class="btn btn-ims-outline btn-sm2" id="modReset" type="button"><i class="bi bi-arrow-counterclockwise"></i> Enable All</button>
      </div>
      <div class="card-body">
        <p class="text-muted2 small mb-3">Industry modules sit on an always-on inventory core. Turning a module off hides its entry points; the core never depends on a module, so nothing else breaks.</p>
        <div class="strong mb-2">Core &middot; always on</div>
        <div class="d-flex flex-wrap gap-1 mb-3">${CORE_MODULES.map(c => `<span class="badge-status st-available">${c}</span>`).join("")}</div>
        <div class="divider"></div>
        <div class="strong mb-2">Optional modules</div>
        ${rows}
      </div>
    </div>`;

  delegate($("#content"), "change", "#modVertical", b => {
    if (typeof IMS.metadata.setVertical === "function") IMS.metadata.setVertical(b.value);
    renderConfig();
  });

  delegate($("#content"), "change", ".mod-toggle", b => {
    if (!b.checked){
      const blockers = (typeof orphanedIfDisabled === "function") ? orphanedIfDisabled(b.dataset.mod, flags) : [];
      if (blockers.length){ window.alert(blockers.join(", ") + " depend on this module — disable them first."); b.checked = true; return; }
    }
    flags[b.dataset.mod] = b.checked;              // false = off
    if (typeof saveModuleFlags === "function") saveModuleFlags(flags);
    if (typeof applyModuleNav === "function") applyModuleNav();
    renderConfig();                                 // refresh On/Off labels
  });
  $("#modReset").addEventListener("click", () => {
    const cleared = {};
    if (typeof saveModuleFlags === "function") saveModuleFlags(cleared);
    IMS.settings.featureModules = cleared;
    if (typeof applyModuleNav === "function") applyModuleNav();
    renderConfig();
  });
}
