/* =========================================================
   IMS — geo.js (split out of app.js)
   Geo asset tracking view + live GPS simulation engine.
   ========================================================= */
"use strict";

/* =========================================================
   STAGE 4 — GEOGRAPHICAL ASSET TRACKING
   ========================================================= */
const GEO_BOUNDS = { minLat: 33.700, maxLat: 33.770, minLng: -84.460, maxLng: -84.330 };
const pinHTML = (kind, x, y, label) => `<div class="map-pin ${kind}" style="left:${x}px;top:${y}px"><div class="pin-dot"></div><div class="pin-label">${label}</div></div>`;

function latLngToXY(map, lat, lng){
  const W = map.clientWidth || 520, H = map.clientHeight || 560;
  const x = (lng - GEO_BOUNDS.minLng) / (GEO_BOUNDS.maxLng - GEO_BOUNDS.minLng) * W;
  const y = (GEO_BOUNDS.maxLat - lat) / (GEO_BOUNDS.maxLat - GEO_BOUNDS.minLat) * H;
  return { x, y };
}

function metersToPx(map, meters){
  const W = map.clientWidth || 520, H = map.clientHeight || 560;
  const latPx = H / (GEO_BOUNDS.maxLat - GEO_BOUNDS.minLat) / 111320;
  const lngPx = W / (GEO_BOUNDS.maxLng - GEO_BOUNDS.minLng) / 111320;
  return meters * (latPx + lngPx) / 2;
}

function haversineMeters(lat1, lng1, lat2, lng2){
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function renderGeo(){
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="geo-layout">
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title"><i class="bi bi-list-ul"></i> Fleet Asset Status</span>
            <span class="text-muted2" style="font-weight:500">${IMS.serializedAssets.length} serialized units</span></div>
          <div class="card-body">
            <input class="filter-input mb-2" id="geoFilter" value="${App.geoFilter || ""}" placeholder="Search asset ID, make, model, serial...">
            <div class="table-wrap" style="max-height:280px;overflow-y:auto">
              <table class="table"><thead><tr><th>Asset</th><th>Status</th><th>Last Reported</th><th>Batt</th><th class="num">Meter Hrs</th></tr></thead>
              <tbody id="geoTbody"></tbody></table>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title"><i class="bi bi-broadcast"></i> Geofence Breach Alerts</span>
            <div><span class="badge-status st-out" id="geoAlertCount">0</span>
            <button class="btn btn-ims-outline btn-sm2 ms-2" id="geoClear"><i class="bi bi-trash"></i> Clear Alerts</button></div></div>
          <div class="card-body"><div class="alerts-log" id="geoAlerts"></div></div>
        </div>
      </div>
      <div class="geo-map-wrap" id="geoMapWrap">
        <div class="geo-map" id="geoMap"></div>
        <div class="map-legend">
          <div class="lg-item"><span style="width:12px;height:12px;border-radius:50%;background:#1f2937;display:inline-block"></span>Yard Hub</div>
          <div class="lg-item"><span style="width:12px;height:12px;border-radius:50%;background:#7c3aed;display:inline-block"></span>Active Job Site (geofence)</div>
          <div class="lg-item"><span style="width:12px;height:12px;border-radius:50%;background:#2563eb;display:inline-block"></span>Asset in geofence</div>
          <div class="lg-item"><span style="width:12px;height:12px;border-radius:50%;background:#dc2626;display:inline-block"></span>Asset breach</div>
        </div>
        <div class="map-scale"><i class="bi bi-rulers"></i> ~1.5 km grid</div>
      </div>
    </div>`;

  $("#geoFilter").addEventListener("input", e => { App.geoFilter = e.target.value; renderGeoTable(); });
  $("#geoClear").addEventListener("click", () => { App.breachAlerts = []; updateBadges(); renderGeoTable(); renderGeoAlerts(); renderGeoMap(); });
  renderGeoTable();
  renderGeoMap();
  renderGeoAlerts();
}

function renderGeoTable(){
  const q = (App.geoFilter || "").toLowerCase();
  const rows = IMS.serializedAssets.filter(a => !q || (a.id + " " + a.make + " " + a.model + " " + a.serial).toLowerCase().includes(q)).map(a => {
    const battCls = a.battery > 60 ? "var(--success)" : (a.battery > 30 ? "var(--warning)" : "var(--danger)");
    return `<tr>
      <td class="strong mono">${a.id}</td>
      <td>${statusBadge(a.status)}${a._breached ? " <span class=\"badge-status st-out\">Breach</span>" : ""}</td>
      <td class="mono text-muted2" style="font-size:11.5px">${fmtDT(a.lastReported)}</td>
      <td><div class="batt-bar"><div style="width:${a.battery}%;background:${battCls}"></div></div><span class="text-muted2" style="font-size:10.5px">${a.battery}%</span></td>
      <td class="num">${fmtInt(a.meterHours)}</td>
    </tr>`;
  }).join("");
  $("#geoTbody").innerHTML = rows || `<tr><td colspan="5" class="text-center text-muted2 py-3">No matching assets</td></tr>`;
}

function renderGeoMap(){
  const map = $("#geoMap");
  if (!map) return;
  const W = map.clientWidth || 520, H = map.clientHeight || 560;
  let grid = "";
  for (let gx = 40; gx < W; gx += 40) grid += `<div class="map-gridline" style="left:${gx}px;top:0;width:1px;height:100%"></div>`;
  for (let gy = 40; gy < H; gy += 40) grid += `<div class="map-gridline" style="top:${gy}px;left:0;height:1px;width:100%"></div>`;
  let html = grid;
  const y = latLngToXY(map, IMS.yard.lat, IMS.yard.lng);
  html += pinHTML("yard", y.x, y.y, "YARD");
  IMS.contracts.filter(c => c.status !== "closed").forEach(c => {
    const s = latLngToXY(map, c.siteLat, c.siteLng);
    const r = metersToPx(map, c.geofenceRadius);
    html += `<div class="geo-ring" style="left:${s.x}px;top:${s.y}px;width:${r * 2}px;height:${r * 2}px"><span class="ring-tag">${c.projectName} (${c.geofenceRadius}m)</span></div>`;
    html += pinHTML("site", s.x, s.y, c.contractId);
  });
  IMS.serializedAssets.forEach(a => {
    const p = latLngToXY(map, a.lat, a.lng);
    html += pinHTML("asset" + (a._breached ? " alerting" : ""), p.x, p.y, a.id);
  });
  map.innerHTML = html;
}

function renderGeoAlerts(){
  const log = $("#geoAlerts");
  if (!log) return;
  const items = App.breachAlerts.slice().reverse();
  $("#geoAlertCount").textContent = App.breachAlerts.filter(a => a.kind === "breach").length;
  log.innerHTML = items.length
    ? items.map(a => `<div class="alert-line ${a.kind}"><span class="ts">${a.ts}</span><span>${a.msg}</span></div>`).join("")
    : `<p class="text-muted2 py-2"><i class="bi bi-check-circle"></i> Monitoring… no geofence events yet.</p>`;
}

/* ---------- geofence movement simulator ---------- */
function initSim(){
  IMS.serializedAssets.forEach(a => {
    a._baseLat = a.lat; a._baseLng = a.lng; a._breached = false;
    if (a.contractId) {
      if (a.id === "BL-119") a._sim = { ampLat: 0.0015, ampLng: 0.0010, sp: 0.9 };
      else if (a.id === "GN-511") a._sim = { ampLat: 0.0005, ampLng: 0.0005, sp: 0.6 };
      else a._sim = { ampLat: 0.0004, ampLng: 0.0003, sp: 0.7 };
    } else {
      a._sim = { ampLat: 0.00006, ampLng: 0.00006, sp: 0.4 };
    }
  });
}

function geoSimTick(){
  try {
    App.tick++;
    const t = App.tick;
    IMS.serializedAssets.forEach(a => {
      const s = a._sim || { ampLat: 0.00006, ampLng: 0.00006, sp: 0.4 };
      a.lat = a._baseLat + s.ampLat * Math.sin(t * s.sp * 0.4);
      a.lng = a._baseLng + s.ampLng * Math.cos(t * s.sp * 0.33);
      a.lastReported = new Date().toISOString().slice(0, 19);
      if (a.contractId) {
        const c = getContract(a.contractId);
        if (!c) return;
        const d = haversineMeters(a.lat, a.lng, c.siteLat, c.siteLng);
        if (d > c.geofenceRadius && !a._breached) { a._breached = true; addBreach(a, c); }
        else if (d <= c.geofenceRadius && a._breached) { a._breached = false; addReentry(a, c); }
      }
    });
    if (App.view === "geo") { renderGeoTable(); renderGeoMap(); renderGeoAlerts(); }
    updateBadges();
  } catch (err) { console.error("geoSimTick", err); }
}

/* Append a geo alert, capping the log length. @param {Object} a @returns {void} */
function pushAlert(a){ App.breachAlerts.push(a); if (App.breachAlerts.length > 40) App.breachAlerts.shift(); }

/* Log a geofence breach alert. @param {Object} asset @param {Object} contract */
function addBreach(asset, contract){
  const d = Math.round(haversineMeters(asset.lat, asset.lng, contract.siteLat, contract.siteLng));
  pushAlert({ kind:"breach", ts: timeNow(), msg:`ALERT: Asset ${asset.id} exited Geofence boundary at Job Site: ${contract.projectName} (${d}m out)` });
}

/* Log a geofence re-entry alert. @param {Object} asset @param {Object} contract */
function addReentry(asset, contract){
  pushAlert({ kind:"info", ts: timeNow(), msg:`Asset ${asset.id} re-entered Geofence at ${contract.projectName}` });
}

/* ---------- global badges / notifications ---------- */
