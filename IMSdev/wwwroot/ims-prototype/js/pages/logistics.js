/* =========================================================
   IMS — logistics.js (split out of app.js)
   Logistics dispatch board.
   ========================================================= */
"use strict";

function dispatchGrid(driverOpts, truckOpts, statusOpts){
  const siteOf = d => { const con = getOrder(d.orderId); return con ? con.projectName : ""; };
  const cols = [
    { key:"route", header:"Route", td:"num", render: d => d.routeSeq },
    { key:"dispatch", header:"Dispatch", td:"strong mono", always:true, render: d => d.dispatchId },
    { key:"asset", header:"Asset", td:"strong", render: d => d.assetId },
    { key:"site", header:"Site", td:"text-muted2 text-xs2", render: d => siteOf(d) },
    { key:"driver", header:"Driver (CDL)", render: d => `<select class="form-select" data-ddrv="${d.dispatchId}"><option value="">— none —</option>${driverOpts}</select>` },
    { key:"truck", header:"Truck", render: d => `<select class="form-select" data-dtrk="${d.dispatchId}"><option value="">— none —</option>${truckOpts}</select>` },
    { key:"status", header:"Status", render: d => `<select class="form-select" data-dsta="${d.dispatchId}">${statusOpts(d.status)}</select>` }
  ];
  return IMSGrid.render("log-dispatch", cols, IMS.dispatches, { empty:"No dispatches." });
}

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
              const con = getOrder(d.orderId);
              return `<div class="staged-item"><div>
                <span class="tag">${d.dispatchId}</span> <span class="strong">${d.assetId}</span><br>
                <span class="text-muted2" style="font-size:11.5px">${con ? con.jobSite : ""}</span><br>
                <span class="mono text-muted2" style="font-size:11px">${con ? con.siteLat.toFixed(4) + ", " + con.siteLng.toFixed(4) : ""}</span>
              </div><div class="text-end">
                <div class="text-muted2" style="font-size:11px">${con ? con.orderId : ""}</div>
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
          <div class="card-body" id="dspGridWrap">${dispatchGrid(driverOpts, truckOpts, statusOpts)}</div>
        </div>
      </div>
    </div>`;
  IMSGrid.ensure("log-dispatch", renderLogistics);
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

