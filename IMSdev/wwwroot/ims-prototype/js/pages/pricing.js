/* =========================================================
   IMS — pricing.js (split out of app.js)
   Pricing rules, tax schedule, overhead fee config, county/city lookup.
   ========================================================= */
"use strict";

function renderPricing(){
  const P = IMS.settings.pricing;
  const riskRows = Object.entries(P.riskPremiums).map(([k, v]) => `<div class="list-line"><span class="l">${k.charAt(0).toUpperCase() + k.slice(1)}</span><span class="r">+${Math.round(v * 100)}%</span></div>`).join("");
  const taxRows = IMS.settings.taxSchedules.map((t, i) => `<tr>
    <td class="strong mono">${t.code || "—"}</td><td>${t.state || "—"}</td><td>${t.county || "—"}</td><td>${t.city || "—"}</td><td class="num">${(t.rate * 100).toFixed(3)}%</td><td class="text-muted2">${t.note || ""}</td>
    <td class="text-end text-nowrap"><button class="btn btn-ims-outline btn-sm2" data-tedit="${i}"><i class="bi bi-pencil"></i></button><button class="btn btn-ims-outline btn-sm2" data-tdel="${i}"><i class="bi bi-x-lg"></i></button></td>
  </tr>`).join("");
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="dash-grid">
      <div>
        <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-sliders"></i> Advanced Pricing Rules Engine</span>
          <button class="btn btn-ims" id="setSave"><i class="bi bi-check2"></i> Save Pricing</button></div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-6 field-group"><label class="form-label">Daily Minimum Hours</label><input class="form-control" type="number" id="set-daily" value="${P.dailyMinHours}"></div>
              <div class="col-md-6 field-group"><label class="form-label">Weekly Limit (hrs)</label><input class="form-control" type="number" id="set-weekly" value="${P.weeklyHours}"></div>
              <div class="col-md-6 field-group"><label class="form-label">Billing Cycle (days)</label><input class="form-control" type="number" id="set-cycle" value="${P.cycleDays}"></div>
              <div class="col-md-6 field-group"><label class="form-label">Default Environmental Fee (%)</label><input class="form-control" type="number" step="0.1" id="set-env" value="${P.envFeePct}"></div>
              <div class="col-md-6 field-group"><label class="form-label">Annual Depreciation Factor</label><input class="form-control" type="number" step="0.01" id="set-dep" value="${P.depreciationAnnual}"></div>
              <div class="col-md-6 field-group"><label class="form-label">Default Weekend Policy</label><select class="form-select" id="set-weekend">${["bill","skip","overtime"].map(w => `<option ${w === P.weekendPolicyDefault ? "selected" : ""}>${w}</option>`).join("")}</select></div>
            </div>
            <div class="divider"></div>
            <div class="strong mb-2">Risk / Environment Premiums</div>
            ${riskRows}
          </div></div>
        <div class="card" style="margin-top:16px">
          <div class="card-header"><span class="card-title"><i class="bi bi-layers"></i> Global Overhead &amp; Service Fee Configurations</span>
            <button class="btn btn-ims" id="ohCfgAdd"><i class="bi bi-plus-lg"></i> Add Overhead</button></div>
          <div class="card-body">${overheadConfigsHTML()}</div></div>
      </div>
      <div>
        <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-percent"></i> Localized Tax Schedule</span>
          <button class="btn btn-ims" id="taxAdd"><i class="bi bi-plus-lg"></i> Add Tax</button></div>
          <div class="card-body table-wrap"><table class="table"><thead><tr><th>Code</th><th>State</th><th>County</th><th>City</th><th class="num">Rate</th><th>Note</th><th class="text-end">Actions</th></tr></thead>
            <tbody>${taxRows || emptyRow(7)}</tbody></table></div></div>
      </div>
    </div>`;
  bindOverheadManager();
  $("#setSave").addEventListener("click", () => {
    const P2 = IMS.settings.pricing;
    P2.dailyMinHours = parseInt($("#set-daily").value, 10) || 8;
    P2.weeklyHours = parseInt($("#set-weekly").value, 10) || 40;
    P2.cycleDays = parseInt($("#set-cycle").value, 10) || 28;
    P2.envFeePct = parseFloat($("#set-env").value) || 5;
    P2.depreciationAnnual = parseFloat($("#set-dep").value) || 0.10;
    P2.weekendPolicyDefault = $("#set-weekend").value;
    renderPricing();
  });
  $("#taxAdd").addEventListener("click", () => taxConfigModal(null));
  $$("[data-tedit]").forEach(b => b.addEventListener("click", () => taxConfigModal(IMS.settings.taxSchedules[parseInt(b.dataset.tedit, 10)])));
  $$("[data-tdel]").forEach(b => b.addEventListener("click", () => { IMS.settings.taxSchedules.splice(parseInt(b.dataset.tdel, 10), 1); renderPricing(); }));
}

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"]
].map(s => ({ code:s[0], name:s[1] }));

/* US Census geography via OpenDataSoft (keyless + CORS), with local fallback. */
const ODS_COUNTY = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-united-states-of-america-county/records";
const ODS_PLACE  = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-united-states-of-america-place/records";
const US_FALLBACK = {
  "Georgia": { counties:["Fulton","Cobb","DeKalb","Gwinnett"], cities:{ "Fulton":["Atlanta","Alpharetta","Roswell"], "Cobb":["Marietta","Smyrna"], "DeKalb":["Decatur"], "Gwinnett":["Lawrenceville"] } },
  "Tennessee": { counties:["Davidson","Shelby","Knox"], cities:{ "Davidson":["Nashville"], "Shelby":["Memphis"], "Knox":["Knoxville"] } },
  "Florida": { counties:["Miami-Dade","Broward","Orange"], cities:{ "Miami-Dade":["Miami","Hialeah"], "Broward":["Fort Lauderdale"], "Orange":["Orlando"] } },
  "Alabama": { counties:["Jefferson","Mobile"], cities:{ "Jefferson":["Birmingham"], "Mobile":["Mobile"] } }
};
const escQ = s => String(s).replace(/'/g, "''");

/* Fetch all pages (OpenDataSoft total_count drives pagination), in parallel.
   @param {string} url - API URL with query params
   @returns {Promise<Object[]>} flattened row records */
async function fetchAll(url){
  const LIMIT = 100;
  /* Fetch one page and return its parsed JSON body. @param {number} offset @returns {Promise<Object>} */
  const fetchPage = async offset => {
    const res = await fetch(url + "&limit=" + LIMIT + "&offset=" + offset);
    return await res.json();
  };
  const first = await fetchPage(0);
  const rows0 = first.results || [];
  const total = Number(first.total_count) || rows0.length;
  const pages = Math.ceil(total / LIMIT);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => fetchPage((i + 1) * LIMIT))
  );
  return rows0.concat(rest.flatMap(j => j.results || []));
}

const COUNTY_CACHE = {};
async function getCounties(stateName){
  if (COUNTY_CACHE[stateName]) return COUNTY_CACHE[stateName];
  let arr = [];
  try {
    const url = ODS_COUNTY + "?where=" + encodeURIComponent("ste_name='" + escQ(stateName) + "'") + "&select=ste_name,coty_name";
    const rows = await fetchAll(url);
    arr = rows.map(r => (Array.isArray(r.coty_name) ? r.coty_name[0] : r.coty_name)).filter(Boolean);
  } catch (_) {}
  if (!arr.length) arr = (US_FALLBACK[stateName] && US_FALLBACK[stateName].counties) || [];
  const uniq = [...new Set(arr)].sort();
  COUNTY_CACHE[stateName] = uniq;
  return uniq;
}

const CITY_CACHE = {};
async function getStatePlaces(stateName){
  if (CITY_CACHE[stateName]) return CITY_CACHE[stateName];
  let places = [];
  try {
    const url = ODS_PLACE + "?where=" + encodeURIComponent("ste_name='" + escQ(stateName) + "'") + "&select=ste_name,coty_name,pla_name";
    const rows = await fetchAll(url);
    places = rows.map(r => ({
      name: (Array.isArray(r.pla_name) ? r.pla_name[0] : r.pla_name),
      counties: (Array.isArray(r.coty_name) ? r.coty_name : [r.coty_name]).filter(Boolean)
    })).filter(p => p.name);
  } catch (_) {}
  CITY_CACHE[stateName] = places;
  return places;
}

async function getCities(stateName, countyName){
  let places = [];
  try { places = await getStatePlaces(stateName); } catch (_) {}
  if (places && places.length) {
    const names = places.filter(p => !countyName || p.counties.includes(countyName)).map(p => p.name);
    if (names.length) return [...new Set(names)].sort();
  }
  const fb = US_FALLBACK[stateName];
  if (fb) {
    if (countyName) return (fb.cities && fb.cities[countyName]) || [];
    return [...new Set(Object.values(fb.cities || {}).reduce((a, c) => a.concat(c), []))].sort();
  }
  return [];
}

function taxConfigModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  const stateVal = e.state || "";
  const countyVal = e.county || "";
  const cityVal = e.city || "";
  const codeVal = e.code || (US_STATES.find(s => s.name === stateVal) || {}).code || "";
  const body = `
    <div class="row g-3">
      <div class="col-md-4 field-group"><label class="form-label">Code</label><input class="form-control" id="t-code" value="${codeVal}" placeholder="e.g. GA"></div>
      <div class="col-md-8 field-group"><label class="form-label">State</label><select class="form-select" id="t-state"><option value="">— select state —</option>${US_STATES.map(s => `<option value="${s.name}" ${s.name === stateVal ? "selected" : ""}>${s.name}</option>`).join("")}</select></div>
      <div class="col-md-6 field-group"><label class="form-label">County (optional)</label><select class="form-select" id="t-county"><option value="">— all counties —</option></select></div>
      <div class="col-md-6 field-group"><label class="form-label">City (optional)</label><select class="form-select" id="t-city"><option value="">— all cities —</option></select></div>
      <div class="col-md-6 field-group"><label class="form-label">Rate (%)</label><input class="form-control" id="t-rate" type="number" step="0.001" value="${(e.rate || 0) * 100}"></div>
      <div class="col-md-6 field-group"><label class="form-label">Note</label><input class="form-control" id="t-note" value="${e.note || ""}"></div>
    </div>
    <div id="tax-load" class="form-hint"></div>`;
  const footer = `<button type="button" class="btn btn-ims-outline" data-bs-dismiss="modal">Cancel</button>
    <button type="button" class="btn btn-ims" id="t-save"><i class="bi bi-check2"></i> Save Tax Schedule</button>`;
  const root = openRawModal({ id:"mdl-tax", size:"lg", title:(isEdit ? "Edit" : "New") + " Tax Schedule", icon:"bi-percent", body, footer });
  const stateSel = root.querySelector("#t-state"), countySel = root.querySelector("#t-county"), citySel = root.querySelector("#t-city"), loadHint = root.querySelector("#tax-load");

  const loadCities = async (st, cy) => {
    citySel.innerHTML = `<option value="">— all cities —</option>`;
    if (!st) return;
    loadHint.textContent = "Loading cities…";
    const cities = await getCities(st, cy);
    cities.forEach(c => citySel.add(new Option(c, c)));
    if (cityVal) citySel.value = cityVal;
    loadHint.textContent = cities.length ? "" : (cy ? "No city data for this county." : "No city data available.");
  };
  const loadCounties = async (st) => {
    countySel.innerHTML = `<option value="">— all counties —</option>`;
    citySel.innerHTML = `<option value="">— all cities —</option>`;
    if (!st) return;
    loadHint.textContent = "Loading counties…";
    const counties = await getCounties(st);
    counties.forEach(c => countySel.add(new Option(c, c)));
    if (countyVal) countySel.value = countyVal;
    loadHint.textContent = counties.length ? "" : "No county data available.";
    loadCities(st, countySel.value);
  };
  stateSel.addEventListener("change", e => {
    const s = US_STATES.find(x => x.name === e.target.value);
    if (s) root.querySelector("#t-code").value = s.code;
    loadCounties(e.target.value);
  });
  countySel.addEventListener("change", e => loadCities(stateSel.value, e.target.value));
  if (stateVal) loadCounties(stateVal);

  root.querySelector("#t-save").addEventListener("click", () => {
    const rec = {
      code: root.querySelector("#t-code").value.trim(),
      state: stateSel.value,
      county: countySel.value,
      city: citySel.value,
      rate: (parseFloat(root.querySelector("#t-rate").value) || 0) / 100,
      note: root.querySelector("#t-note").value
    };
    if (isEdit) Object.assign(existing, rec);
    else IMS.settings.taxSchedules.push(rec);
    renderPricing();
    dismissModal(root);
  });
}

function overheadConfigsHTML(){
  const rows = IMS.settings.overheads.map((o, i) => `<tr>
    <td class="strong">${o.name}</td>
    <td>${o.category}</td>
    <td>${o.chargeType}${o.chargeType === "Percent of Equipment Total" ? ` <span class="text-muted2">${o.pct}%</span>` : ""}</td>
    <td class="num">${fmtMoney(o.cost)}</td>
    <td class="num">${fmtMoney(o.retail)}</td>
    <td>${o.locked ? `<span class="badge-status st-active"><i class="bi bi-bolt"></i>Auto-inject</span>` : `<span class="badge-status st-closed"><i class="bi bi-slash-circle"></i>Optional</span>`}</td>
    <td class="text-end text-nowrap">
      <button class="btn btn-ims-outline btn-sm2" data-ohcfg="edit" data-i="${i}"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-ims-outline btn-sm2" data-ohcfg="del" data-i="${i}"><i class="bi bi-x-lg"></i></button>
    </td>
  </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Fee / Asset Name</th><th>Category</th><th>Charge Type</th><th class="num">Default Cost</th><th class="num">Default Retail</th><th>Auto-Inject</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(7)}</tbody></table></div>`;
}

function bindOverheadManager(){
  const addBtn = $("#ohCfgAdd");
  if (addBtn) addBtn.addEventListener("click", () => overheadConfigModal(null));
  $$("[data-ohcfg]").forEach(b => b.addEventListener("click", () => {
    const i = parseInt(b.dataset.i, 10);
    const cfg = IMS.settings.overheads[i];
    if (!cfg) return;
    if (b.dataset.ohcfg === "del") { IMS.settings.overheads.splice(i, 1); renderPricing(); }
    else if (b.dataset.ohcfg === "edit") overheadConfigModal(cfg);
  }));
}

function overheadConfigModal(existing){
  const isEdit = !!existing;
  const e = existing || {};
  openFormModal({
    id: "mdl-ohcfg", title: (isEdit ? "Edit" : "New") + " Overhead / Service Fee", icon: "bi-layers",
    fields: [
      { key:"name", label:"Fee / Asset Name", type:"text", value: e.name || "", required:true },
      { key:"category", label:"Category", type:"select", value: e.category || "Freight/Logistics", options: opt(["Facility","Freight/Logistics","Compliance"]) },
      { key:"chargeType", label:"Charge Type", type:"select", value: e.chargeType || "Flat Fee", options: opt(["Flat Fee","Percent of Equipment Total","Per Mile","Per Day"]) },
      { key:"pct", label:"Percentage of Equipment Total (%)", type:"number", value: e.pct || 0, step:"0.1", hint:"Used when Charge Type = Percentage" },
      { key:"cost", label:"Default Cost Price ($)", type:"number", value: e.cost || 0 },
      { key:"retail", label:"Default Billable Retail ($)", type:"number", value: e.retail || 0 },
      { key:"locked", label:"Auto-inject into new contracts", type:"checkbox", value: e.locked === true }
    ],
    onSave: v => {
      const rec = { ohId: e.ohId || "OH-" + String(IMS.settings.overheads.length + 1).padStart(3, "0"),
        name:v.name, category:v.category, chargeType:v.chargeType, pct:v.pct, cost:v.cost, retail:v.retail, locked: !!v.locked };
      if (isEdit) Object.assign(existing, rec);
      else IMS.settings.overheads.push(rec);
      renderPricing();
    }
  });
}

