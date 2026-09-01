/* =========================================================
   IMS — logistics.js (split out of app.js)
   Logistics dispatch board.
   ========================================================= */
"use strict";

function renderLogistics(){
  const cdls = IMS.labor.filter(e => (e.certs || []).includes("CDL"));
  const driverOpts = cdls.map(e => `<option value="${e.empId}">${e.empId} — ${e.name}</option>`).join("");
  const truckOpts = IMS.vehicles.map(v => `<option value="${v.truckId}">${v.truckId} — ${v.name}</option>`).join("");
  const statuses = ["Staged","En Route","Delivered","Pending Return"];
  const statusOpts = s => statuses.map(x => `<option ${x === s ? "selected" : ""}>${x}</option>`).join("");
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="split-layout">
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-inbox"></i> Pending Dispatches</span>
            <span class="badge-status st-reorder">${IMS.dispatches.filter(d => d.status === "Staged").length} staged</span></div>
          <div class="card-body">
            ${IMS.dispatches.filter(d => d.status === "Staged").map(d => {
              const con = getContract(d.contractId);
              return `<div class="staged-item"><div>
                <span class="tag">${d.dispatchId}</span> <span class="strong">${d.assetId}</span><br>
                <span class="text-muted2" style="font-size:11.5px">${con ? con.jobSite : ""}</span><br>
                <span class="mono text-muted2" style="font-size:11px">${con ? con.siteLat.toFixed(4) + ", " + con.siteLng.toFixed(4) : ""}</span>
              </div><div class="text-end">
                <div class="text-muted2" style="font-size:11px">${con ? con.contractId : ""}</div>
                <button class="btn btn-ims btn-sm2" data-dispatch="${d.dispatchId}">Assign</button>
              </div></div>`;
            }).join("") || `<p class="text-muted2 py-3 text-center">No pending staged dispatches.</p>`}
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-truck"></i> Driver Assignment Grid</span>
            <button class="btn btn-ims btn-sm2" id="dspSave"><i class="bi bi-check2-all"></i> Apply Assignments</button></div>
          <div class="card-body table-wrap">
            <table class="table"><thead><tr><th class="num">Route</th><th>Dispatch</th><th>Asset</th><th>Site</th><th>Driver (CDL)</th><th>Truck</th><th>Status</th></tr></thead>
            <tbody>${IMS.dispatches.map(d => {
              const con = getContract(d.contractId);
              return `<tr>
                <td class="num">${d.routeSeq}</td>
                <td class="strong mono">${d.dispatchId}</td>
                <td class="strong">${d.assetId}</td>
                <td class="text-muted2" style="font-size:11.5px">${con ? con.projectName : ""}</td>
                <td><select class="form-select" data-ddrv="${d.dispatchId}"><option value="">— none —</option>${driverOpts}</select></td>
                <td><select class="form-select" data-dtrk="${d.dispatchId}"><option value="">— none —</option>${truckOpts}</select></td>
                <td><select class="form-select" data-dsta="${d.dispatchId}">${statusOpts(d.status)}</select></td>
              </tr>`;
            }).join("")}</tbody></table>
          </div>
        </div>
      </div>
    </div>`;
  IMS.dispatches.forEach(d => {
    if (d.driverId) { const s = $(`[data-ddrv="${d.dispatchId}"]`); if (s) s.value = d.driverId; }
    if (d.truckId) { const s = $(`[data-dtrk="${d.dispatchId}"]`); if (s) s.value = d.truckId; }
  });
  $("#dspSave").addEventListener("click", () => {
    IMS.dispatches.forEach(d => {
      const drv = $(`[data-ddrv="${d.dispatchId}"]`); if (drv) d.driverId = drv.value || null;
      const trk = $(`[data-dtrk="${d.dispatchId}"]`); if (trk) d.truckId = trk.value || null;
      const sta = $(`[data-dsta="${d.dispatchId}"]`); if (sta) d.status = sta.value;
      if (trk && trk.value) { const v = IMS.vehicles.find(x => x.truckId === trk.value); if (v) v.status = (sta && sta.value === "En Route") ? "En Route" : "Available"; }
    });
    renderLogistics();
  });
  $$("[data-dispatch]").forEach(b => b.addEventListener("click", () => {
    const d = IMS.dispatches.find(x => x.dispatchId === b.dataset.dispatch);
    if (!d) return;
    const drv = $(`[data-ddrv="${d.dispatchId}"]`), sta = $(`[data-dsta="${d.dispatchId}"]`);
    if (drv && !d.driverId && cdls[0]) drv.value = cdls[0].empId;
    if (sta && d.status === "Staged") sta.value = "En Route";
  }));
}

