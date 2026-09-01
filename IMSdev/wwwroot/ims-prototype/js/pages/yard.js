/* =========================================================
   IMS — yard.js (split out of app.js)
   Yard inspections (meter/fuel check-in/out, overage).
   ========================================================= */
"use strict";

function meterOverage(insp){
  if (insp.direction !== "Check-In" || insp.meterIn == null || insp.meterOut == null) return null;
  const contract = getContract(insp.contractId);
  const days = contract ? daysBetween(contract.startDate, contract.endDate) : 1;
  const P = IMS.settings.pricing;
  const allowed = days >= 7 ? P.weeklyHours : P.dailyMinHours * days;
  const used = insp.meterIn - insp.meterOut;
  const overage = used - allowed;
  return overage > 0 ? { used, allowed, overage } : null;
}

function getLastMeter(assetId){
  const last = IMS.inspections.filter(x => x.assetId === assetId && x.direction === "Check-Out").slice(-1)[0];
  return last ? last.meterOut : 0;
}

function renderYard(){
  const checks = ["tires","fluids","guards","lights","engine"];
  const checkLabels = { tires:"Tires / Tracks", fluids:"Fluids", guards:"Safety Guards", lights:"Lights", engine:"Engine" };
  const assetOpts = IMS.serializedAssets.map(a => `<option value="${a.id}">${a.id} — ${a.make} ${a.model}</option>`).join("");
  const contractOpts = IMS.contracts.map(c => `<option value="${c.contractId}">${c.contractId} — ${c.projectName}</option>`).join("");
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="split-layout">
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-clipboard-check"></i> Asset In / Out Inspection</span>
            <button class="btn btn-ims btn-sm2" id="inspSave"><i class="bi bi-check2-square"></i> Log Inspection</button></div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-6 field-group"><label class="form-label">Asset</label><select class="form-select" id="i-asset">${assetOpts}</select></div>
              <div class="col-md-6 field-group"><label class="form-label">Contract</label><select class="form-select" id="i-contract"><option value="">— none —</option>${contractOpts}</select></div>
              <div class="col-md-6 field-group"><label class="form-label">Direction</label><select class="form-select" id="i-dir"><option>Check-Out</option><option>Check-In</option></select></div>
              <div class="col-md-6 field-group"><label class="form-label">Date</label><input class="form-control" id="i-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
            </div>
            <div class="strong mb-2">Telemetry Verification</div>
            <div class="row g-2 mb-2">
              ${checks.map(k => `<div class="col-md-6"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="i-${k}" checked><label class="form-check-label" for="i-${k}">${checkLabels[k]}</label></div></div>`).join("")}
            </div>
            <div class="row g-2">
              <div class="col-md-6 field-group"><label class="form-label">Current Meter Hours</label><input class="form-control" id="i-meter" type="number" value="0"></div>
              <div class="col-md-6 field-group"><label class="form-label">Fuel Level %</label><input class="form-control" id="i-fuel" type="number" min="0" max="100" value="100"></div>
            </div>
            <div id="i-overage"></div>
            <div class="divider"></div>
            <div class="strong mb-2">Damage / Scratches</div>
            <div class="photo-drop">
              <i class="bi bi-camera"></i>
              <div>Upload site photos<br><span class="text-muted2">Tap to capture scratch / damage evidence</span></div>
              <button class="btn btn-ims-outline btn-sm2" type="button" data-filebtn>Choose File</button>
              <input type="file" multiple accept="image/*" hidden>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-list-check"></i> Inspection Log</span>
            <span class="text-muted2" style="font-weight:500">${IMS.inspections.length} records</span></div>
          <div class="card-body table-wrap">
            <table class="table"><thead><tr><th>Insp #</th><th>Asset</th><th>Dir</th><th class="num">Meter Out</th><th class="num">Meter In</th><th class="num">Fuel</th><th class="num">Checks</th><th>Status</th><th>Overage</th></tr></thead>
            <tbody id="inspTbody"></tbody></table>
          </div>
        </div>
      </div>
    </div>`;
  $$("[data-filebtn]").forEach(b => b.addEventListener("click", () => b.parentElement.querySelector("input[type=file]").click()));
  $("#i-meter").addEventListener("input", updateOveragePreview);
  $("#i-dir").addEventListener("change", updateOveragePreview);
  $("#i-contract").addEventListener("change", updateOveragePreview);
  $("#inspSave").addEventListener("click", () => {
    const dir = $("#i-dir").value;
    const meter = parseFloat($("#i-meter").value) || 0;
    const assetId = $("#i-asset").value;
    IMS.inspections.push({
      inspId:"INSP-" + String(IMS.inspections.length + 1).padStart(3, "0"),
      assetId, contractId: $("#i-contract").value || null, direction: dir, date: $("#i-date").value,
      meterOut: dir === "Check-Out" ? meter : getLastMeter(assetId),
      meterIn: dir === "Check-In" ? meter : null,
      fuelOut: parseFloat($("#i-fuel").value) || 0, fuelIn: null,
      checks: { tires:$("#i-tires").checked, fluids:$("#i-fluids").checked, guards:$("#i-guards").checked, lights:$("#i-lights").checked, engine:$("#i-engine").checked },
      photos: 1, status: dir === "Check-In" ? "Closed" : "Open"
    });
    renderYard();
  });
  renderInspLog();
  updateOveragePreview();
}

function renderInspLog(){
  const tbody = $("#inspTbody");
  if (!tbody) return;
  tbody.innerHTML = IMS.inspections.map(insp => {
    const a = getAsset(insp.assetId);
    const ov = meterOverage(insp);
    const checksDone = Object.values(insp.checks || {}).filter(Boolean).length;
    return `<tr data-edit="${insp.inspId}">
      <td class="strong mono">${insp.inspId}</td>
      <td class="strong">${insp.assetId} <span class="text-muted2">${a ? a.model : ""}</span></td>
      <td>${insp.direction}</td>
      <td class="num">${insp.meterOut ?? "—"}</td>
      <td class="num">${insp.meterIn ?? "—"}</td>
      <td class="num">${insp.fuelOut}%${insp.fuelIn != null ? " → " + insp.fuelIn + "%" : ""}</td>
      <td class="num">${checksDone}/5</td>
      <td>${statusBadge(insp.status)}</td>
      <td>${ov ? `<span class="badge-status st-reorder"><i class="bi bi-exclamation-triangle"></i>${fmtInt(ov.overage)} hr</span>` : `<span class="text-muted2">—</span>`}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="9" class="text-center text-muted2 py-3">No inspections logged.</td></tr>`;
  /* Clicking an inspection row opens the edit modal. */
  delegate($("#inspTbody"), "click", "tr[data-edit]", (el, e) => {
    if (e.target.closest("button, a, input, select, label, .form-check")) return;
    const insp = IMS.inspections.find(x => x.inspId === el.dataset.edit);
    if (insp) inspectionModal(insp);
  });
}

/* Edit an inspection log record. */
function inspectionModal(existing){
  const e = existing || {};
  const checks = ["tires","fluids","guards","lights","engine"];
  const checkLabels = { tires:"Tires / Tracks", fluids:"Fluids", guards:"Safety Guards", lights:"Lights", engine:"Engine" };
  const assetOpts = IMS.serializedAssets.map(a => ({ value:a.id, label:`${a.id} — ${a.make} ${a.model}` }));
  const fields = [
    { key:"assetId", label:"Asset", type:"select", value:e.assetId, options:assetOpts },
    { key:"direction", label:"Direction", type:"select", value:e.direction || "Check-Out", options:opt(["Check-Out","Check-In"]) },
    { key:"status", label:"Status", type:"select", value:e.status || "Open", options:opt(["Open","Closed"]) },
    { key:"meterOut", label:"Meter Out", type:"number", value:e.meterOut ?? "" },
    { key:"meterIn", label:"Meter In", type:"number", value:e.meterIn ?? "" },
    { key:"fuelOut", label:"Fuel Out %", type:"number", value:e.fuelOut || 0 },
    { key:"fuelIn", label:"Fuel In %", type:"number", value:e.fuelIn ?? "" }
  ];
  checks.forEach(k => fields.push({ key:"chk_" + k, label:checkLabels[k], type:"checkbox", value: !!(e.checks || {})[k] }));
  openFormModal({
    id: "mdl-insp", title: "Edit Inspection " + (e.inspId || ""), icon: "bi-clipboard-check",
    fields,
    onSave: v => {
      const rec = {
        assetId:v.assetId, direction:v.direction, status:v.status,
        fuelOut:v.fuelOut, fuelIn:v.fuelIn,
        checks: Object.fromEntries(checks.map(k => [k, !!v["chk_" + k]]))
      };
      if (v.meterOut !== 0 || e.meterOut != null) rec.meterOut = v.meterOut;
      if (v.meterIn !== 0 || e.meterIn != null) rec.meterIn = v.meterIn;
      Object.assign(existing, rec);
      renderYard();
    }
  });
}

function updateOveragePreview(){
  const box = $("#i-overage");
  if (!box) return;
  const dir = $("#i-dir").value;
  const assetId = $("#i-asset").value;
  if (dir !== "Check-In") { box.innerHTML = ""; return; }
  const meterIn = parseFloat($("#i-meter").value) || 0;
  const meterOut = getLastMeter(assetId);
  const contract = getContract($("#i-contract").value) || null;
  const days = contract ? daysBetween(contract.startDate, contract.endDate) : 1;
  const P = IMS.settings.pricing;
  const allowed = days >= 7 ? P.weeklyHours : P.dailyMinHours * days;
  const used = meterIn - meterOut;
  const overage = used - allowed;
  box.innerHTML = overage > 0
    ? `<div class="alert-line breach" style="margin-top:8px"><span class="ts">LIVE</span><span><strong>Overage Fees Apply:</strong> ${fmtInt(overage)} Hours Overage Detected (${fmtInt(used)} used vs ${fmtInt(allowed)} allowed)</span></div>`
    : `<div class="alert-line info" style="margin-top:8px"><span class="ts">LIVE</span><span>Within limit — ${fmtInt(Math.max(0, allowed - used))} hrs remaining (${fmtInt(used)} of ${fmtInt(allowed)} allowed)</span></div>`;
}

