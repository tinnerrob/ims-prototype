/* =========================================================
   IMS — handoff-wiz.js
   Multi-step "New Rental / Check Out" wizard (replaces the old
   single-scroll modal). Three pages inside one Bootstrap modal:
     1. Customer information (new or existing + billing).
     2. Line items — each is typed (Equipment / Bulk / Consumable /
        Stock part / Kit / Attachment). Time-based items rent by
        hour/day/week with custom rates + qty + dates; consumables &
        stock parts are one-time per-unit sales (price each).
     3. Invoice-style billing review with totals + deposits + tax,
        and the "Create Rental & Check Out" action.
   Loaded AFTER handoff.js so its openNewRentalModal() overrides the
   old modal entry point. Reuses data, helpers, chain-of-custody and
   inventory-sync routines from handoff.js / common.js / data.js.
   ========================================================= */
"use strict";

/* Reused from handoff.js / common.js: getResource, recActive,
   availableSerialized, fmtMoney, fmtInt, daysBetween, hoTodayStr,
   taxRate, nextContractId, nextCustomerId, nextLiId, getCustomer,
   syncInventoryOnStage, hoLog, renderHandoff, dismissModal,
   openRawModal, $ (single-element selector). */

/* ---- type catalog that this rental supports ---- */
const RW_TYPES = [
  { type: "serialized", label: "Equipment" },
  { type: "bulk",       label: "Bulk" },
  { type: "consumable", label: "Consumable" },
  { type: "part",       label: "Stock / Part" },
  { type: "kit",        label: "Kit" },
  { type: "attachment", label: "Attachment" }
];
const RW_TYPE_LABEL = {};
RW_TYPES.forEach(t => { RW_TYPE_LABEL[t.type] = t.label; });
const RW_TIME_TYPES = { serialized: 1, bulk: 1, kit: 1, attachment: 1 };
const rwIsTime = t => !!RW_TIME_TYPES[t];        // billed over a rental window
const rwMulti = t => t !== "serialized";         // takes a quantity field
const rwHasDep = rwIsTime;                       // every rentable (time) type can hold a deposit

function rwDefaultDepPct(type, ref){
  const r = rwRes(type, ref);
  return (r && r.depositPct != null) ? Math.min(100, Math.max(0, r.depositPct)) : 25;
}

const rwRes = (type, ref) => getResource({ type, refId: ref });

function rwRefKey(type){
  if (type === "serialized") return "id";
  if (type === "bulk" || type === "consumable") return "sku";
  if (type === "part") return "partId";
  if (type === "kit") return "kitId";
  if (type === "attachment") return "accId";
  return "id";
}

function rwLabel(type, ref){
  const r = rwRes(type, ref); if (!r) return ref;
  if (type === "serialized") return `${r.id} · ${r.make} ${r.model}`;
  if (type === "bulk" || type === "consumable") return `${r.sku} · ${r.name}`;
  if (type === "part") return `${r.partId} · ${r.description}`;
  if (type === "kit") return `${r.kitId} · ${r.name}`;
  if (type === "attachment") return `${r.accId} · ${r.name}`;
  return ref;
}

/* Max units a single line may take (per current on-hand / availability). */
function rwAvail(type, ref){
  const r = rwRes(type, ref); if (!r) return 0;
  if (type === "serialized") return availableSerialized().some(a => a.id === ref) ? 1 : 0;
  if (type === "bulk") return r.qtyAvailable || 0;
  if (type === "consumable" || type === "part") return r.qtyOnHand || 0;
  if (type === "kit" || type === "attachment") return r.qtyOwned || 1;
  return 0;
}
function rwUnitDesc(type, ref){
  const r = rwRes(type, ref);
  if (type === "serialized") return fmtMoney(r.baseDaily) + "/day";
  if (type === "bulk") return fmtInt(rwAvail(type, ref)) + " avail · " + fmtMoney(r.baseDaily) + "/u/day";
  if (type === "consumable") return fmtInt(rwAvail(type, ref)) + " on hand · " + fmtMoney(r.retailPrice) + " each";
  if (type === "part") return fmtInt(rwAvail(type, ref)) + " on hand · " + fmtMoney(r.costPrice) + " each";
  if (type === "kit") return fmtInt(rwAvail(type, ref)) + " owned · " + fmtMoney(r.baseRate) + "/day";
  if (type === "attachment") return fmtInt(rwAvail(type, ref)) + " owned · " + fmtMoney(r.daily) + "/day";
  return "";
}

/* ---- option lists per type ---- */
function rwPool(type){
  if (type === "serialized") return availableSerialized();
  if (type === "bulk") return IMS.bulkResources.filter(recActive);
  if (type === "consumable") return IMS.consumables.filter(recActive);
  if (type === "part") return IMS.parts.filter(recActive);
  if (type === "kit") return IMS.kits.filter(recActive);
  if (type === "attachment") return IMS.attachments.filter(recActive);
  return [];
}
/* exclude = map of refs already used (only serialized pieces can't repeat). */
function rwOpts(type, exclude){
  const ex = exclude || {};
  const key = rwRefKey(type);
  return rwPool(type)
    .filter(r => !ex[r[key]])
    .map(r => `<option value="${r[key]}">${rwLabel(type, r[key])} · ${rwUnitDesc(type, r[key])}</option>`)
    .join("");
}
function rwDefaultRates(type, ref){
  const r = rwRes(type, ref);
  const h = (IMS.settings.pricing && IMS.settings.pricing.dailyMinHours) || 8;
  let daily = 0;
  if (type === "serialized" || type === "bulk") daily = r ? r.baseDaily : 0;
  else if (type === "kit") daily = r ? r.baseRate : 0;
  else if (type === "attachment") daily = r ? r.daily : 0;
  const weekly = r ? (r.baseWeekly || daily * 7) : 0;
  return { hourly: daily ? Math.round((daily / h) * 100) / 100 : 0, daily, weekly };
}
function rwDefaultPrice(type, ref){
  const r = rwRes(type, ref); if (!r) return 0;
  return type === "consumable" ? (r.retailPrice || 0) : type === "part" ? (r.costPrice || 0) : 0;
}

const rwRatebox = (seq, unit, disp) =>
  `<div class="col-9 field-group rn-ratebox" data-rate="${unit}" style="display:${disp}">` +
    `<label class="form-label">Custom ${unit === "hour" ? "Hour" : unit === "day" ? "Day" : "Week"} rate ($/${unit === "hour" ? "hr" : unit})</label>` +
    `<input class="form-control rn-rate" id="rn_${unit === "hour" ? "h" : unit === "day" ? "d" : "w"}_${seq}" type="number" step="0.01" min="0"></div>`;

/* Build the collapsible body (fields) for one item of `type`. */
function rwBody(seq, type, used){
  const today = hoTodayStr();
  const time = rwIsTime(type), multi = rwMulti(type), dep = rwHasDep(type);
  const typOpts = RW_TYPES.map(t => `<option value="${t.type}" ${t.type === type ? "selected" : ""}>${t.label}</option>`).join("");
  const itemOpts = `<option value="">— select ${RW_TYPE_LABEL[type]} —</option>` + rwOpts(type, used);
  const cols = [];
  cols.push(`<div class="row g-2">
      <div class="col-md-3 field-group"><label class="form-label">Type</label>
        <select class="form-select rn-ty" id="rn_ty_${seq}" data-seq="${seq}">${typOpts}</select></div>
      <div class="col-md-9 field-group"><label class="form-label">Item</label>
        <select class="form-select rn-a" id="rn_a_${seq}" data-seq="${seq}">${itemOpts}</select></div>
    </div>`);
  if (time){
    const qtyCell = multi
      ? `<div class="col-2 field-group"><label class="form-label">Qty</label><input class="form-control rn-q" id="rn_q_${seq}" type="number" min="1" step="1" value="1"></div>`
      : "";
    const w = multi ? 5 : 6;
    cols.push(`<div class="row g-2">${qtyCell}
        <div class="col-${w} field-group"><label class="form-label">Rent from</label><input class="form-control rn-date" id="rn_s_${seq}" type="date" value="${today}"></div>
        <div class="col-${w} field-group"><label class="form-label">Return by</label><input class="form-control rn-date" id="rn_e_${seq}" type="date" value="${today}"></div>
      </div>`);
    cols.push(`<div class="row g-2">
        <div class="col-3 field-group"><label class="form-label">Charge</label>
          <select class="form-select rn-freq" id="rn_f_${seq}" data-seq="${seq}">
            <option value="hour">Hour</option><option value="day" selected>Day</option><option value="week">Week</option></select></div>
        ${rwRatebox(seq, "hour", "none")}${rwRatebox(seq, "day", "")}${rwRatebox(seq, "week", "none")}
      </div>`);
    if (dep){
      cols.push(`<div class="row g-2">
          <div class="col-3 field-group"><label class="form-label">Deposit (%)</label><input class="form-control rn-dep" id="rn_p_${seq}" type="number" min="0" max="100" step="1" value="25"></div>
          <div class="col-9 field-group rn-depcell">
            <span class="form-label rn-depspacer"></span>
            <div class="rn-depcell-row"><div class="form-check form-switch">
              <input class="form-check-input rn-ref" type="checkbox" id="rn_x_${seq}" checked>
              <label class="form-check-label" for="rn_x_${seq}">Refundable deposit</label></div></div>
          </div>
        </div>`);
    }
    cols.push(`<div class="row g-2">
        <div class="col-3 field-group"><label class="form-label">Payment due</label>
          <select class="form-select rn-due" id="rn_due_${seq}"><option value="pickup">At pick-up</option><option value="return">At return</option></select></div>
        <div class="col-9 field-group d-flex align-items-end"><span class="text-muted2 rw-note"><i class="bi bi-calendar2-check"></i> Bill this item when it is picked up or when it is returned.</span></div>
      </div>`);
  } else {
    cols.push(`<div class="row g-2">
        <div class="col-3 field-group"><label class="form-label">Qty</label><input class="form-control rn-q" id="rn_q_${seq}" type="number" min="1" step="1" value="1"></div>
        <div class="col-4 field-group"><label class="form-label">Price each ($)</label><input class="form-control rn-up" id="rn_u_${seq}" type="number" step="0.01" min="0" placeholder="0.00"></div>
        <div class="col-5 field-group d-flex align-items-end"><span class="text-muted2 rw-note"><i class="bi bi-info-circle"></i> Due at pick-up · charged once at check-out — not time-based</span></div>
      </div>`);
  }
  return cols.join("\n");
}
/* ---- line-item state ---- */
let rwSeq = 0;          // running section id (also its display index)
let rwStep = 1;         // 1 customer | 2 items | 3 review
let rwLastType = "serialized";

/* Refs already on this rental — only serialized pieces are mutually exclusive. */
function rwUsedSerialized(){
  const u = {};
  document.querySelectorAll('#rn-items .rn-item[data-type="serialized"] select.rn-a')
    .forEach(s => { if (s.value) u[s.value] = 1; });
  return u;
}

/* Push defaults into a fresh item: rates/price/date defaults, freq view. */
function rwFill(seq, quiet){
  const seg = document.querySelector('#rn-items .rn-item[data-seq="' + seq + '"]');
  if (!seg) return;
  const type = seg.dataset.type;
  const aSel = seg.querySelector("#rn_a_" + seq);
  const ref = aSel ? aSel.value : "";
  if (!ref){ if (!quiet) rwRefreshAll(); return; }
  if (rwIsTime(type)){
    const d = rwDefaultRates(type, ref);
    ["h", "d", "w"].forEach(k => {
      const el = seg.querySelector("#rn_" + k + "_" + seq);
      if (el) el.value = d[k === "h" ? "hourly" : k === "d" ? "daily" : "weekly"];
    });
    const pEl = seg.querySelector("#rn_p_" + seq);
    if (pEl) pEl.value = rwDefaultDepPct(type, ref);
    const av = rwAvail(type, ref);
    const qEl = seg.querySelector("#rn_q_" + seq);
    if (qEl && av > 0) qEl.max = av;
  } else {
    const uEl = seg.querySelector("#rn_u_" + seq);
    if (uEl) uEl.value = rwDefaultPrice(type, ref);
    const av = rwAvail(type, ref);
    const qEl = seg.querySelector("#rn_q_" + seq);
    if (qEl && av > 0) qEl.max = av;
  }
  rwApplyFreq(seq);
  if (!quiet) rwRefreshAll();
}

/* Only the custom-rate box matching the charge frequency is visible. */
function rwApplyFreq(seq){
  const seg = document.querySelector('#rn-items .rn-item[data-seq="' + seq + '"]');
  if (!seg) return;
  const f = seg.querySelector("#rn_f_" + seq); if (!f) return;
  const freq = f.value;
  seg.querySelectorAll(".rn-ratebox").forEach(b => { b.style.display = b.dataset.rate === freq ? "" : "none"; });
}

/* Compute the parsed value of one item section (or null if no item chosen). */
function rwCompute(seg){
  const seq = seg.dataset.seq, type = seg.dataset.type;
  const aSel = seg.querySelector("#rn_a_" + seq);
  const ref = aSel ? aSel.value : "";
  if (!ref) return null;
  const qEl = seg.querySelector("#rn_q_" + seq);
  const qty = qEl ? Math.max(1, parseInt(qEl.value, 10) || 1) : 1;
  const time = rwIsTime(type);
  if (!time){
    const uEl = seg.querySelector("#rn_u_" + seq);
    const unit = uEl ? (parseFloat(uEl.value) || 0) : 0;
    return { seq, type, ref, label: rwLabel(type, ref), qty, unit, time: false, dueAt: "pickup",
             units: qty, uLabel: "each", subtotal: Math.round(unit * qty * 100) / 100, deposit: 0, depPct: 0 };
  }
  const sEl = seg.querySelector("#rn_s_" + seq), eEl = seg.querySelector("#rn_e_" + seq);
  const start = sEl ? sEl.value : "", end = eEl ? eEl.value : "";
  const days = (start && end) ? Math.max(1, daysBetween(start, end)) : 0;
  const fEl = seg.querySelector("#rn_f_" + seq);
  const freq = fEl ? fEl.value : "day";
  const g = i => { const el = seg.querySelector("#rn_" + i + "_" + seq); return el ? (parseFloat(el.value) || 0) : 0; };
  const rates = { hourly: g("h"), daily: g("d"), weekly: g("w") };
  const minH = (IMS.settings.pricing && IMS.settings.pricing.dailyMinHours) || 8;
  const key = freq === "hour" ? "hourly" : freq === "week" ? "weekly" : "daily";
  const units = freq === "week" ? Math.max(1, Math.ceil(days / 7)) : (freq === "hour" ? days * minH : days);
  const uLabel = freq === "week" ? "week" : freq === "hour" ? "hour" : "day";
  const subtotal = Math.round(rates[key] * units * qty * 100) / 100;
  const pEl = seg.querySelector("#rn_p_" + seq);
  const depPct = pEl ? Math.min(100, Math.max(0, parseFloat(pEl.value) || 0)) : 0;
  const rEl = seg.querySelector("#rn_x_" + seq);
  const refundable = rEl ? rEl.checked : true;
  const dueEl = seg.querySelector("#rn_due_" + seq);
  const dueAt = dueEl ? (dueEl.value === "return" ? "return" : "pickup") : "pickup";
  return { seq, type, ref, label: rwLabel(type, ref), qty, start, end, days, freq, rates,
           units, uLabel, subtotal, depPct, deposit: Math.round(subtotal * depPct / 100 * 100) / 100,
           refundable, dueAt, time: true };
}

/* Recompute every section's headline total + label and refresh live previews. */
function rwAggregate(items){
  const rate = taxRate();
  let subP = 0, taxP = 0, subR = 0, taxR = 0, dep = 0;
  items.forEach(it => {
    const tx = Math.round(it.subtotal * rate * 100) / 100;
    if (it.time && it.dueAt === "return"){ subR += it.subtotal; taxR += tx; }
    else { subP += it.subtotal; taxP += tx; }
    dep += it.deposit || 0;
  });
  const round2 = n => Math.round(n * 100) / 100;
  return { subP, taxP, subR, taxR, dep,
    collectP: round2(subP + taxP), collectR: round2(subR + taxR), grand: round2(subP + subR + taxP + taxR) };
}

function rwRefreshAll(){
  const segs = Array.from(document.querySelectorAll("#rn-items .rn-item"));
  const items = [];
  segs.forEach(seg => {
    const seq = seg.dataset.seq;
    const c = rwCompute(seg);
    const tEl = seg.querySelector(".rn-t");
    let txt = c ? fmtMoney(c.subtotal) : "";
    if (c){
      if (c.time) txt += " · " + (c.qty > 1 ? c.qty + " × " : "") + c.units + " " + c.uLabel + (c.units !== 1 ? "s" : "");
      else txt += " · " + c.qty + " each";
      if (c.time && c.dueAt === "return") txt += " · on return";
    }
    if (tEl) tEl.textContent = txt;
    const labEl = seg.querySelector(".rn-headlbl");
    if (labEl){
      const idx = segs.indexOf(seg) + 1;
      labEl.textContent = RW_TYPE_LABEL[seg.dataset.type] + " " + idx + (c ? " · " + c.label : "");
    }
    if (c) items.push(c);
  });
  const mini = $("#rn-summary2"); if (!mini) return;
  const a = rwAggregate(items);
  mini.innerHTML = `<div class="divider"></div>
    <div class="list-line"><span class="l">${items.length} line item${items.length === 1 ? "" : "s"}</span><span class="r strong">${fmtMoney(a.grand)}</span></div>
    <div class="list-line"><span class="l strong">Due at pick-up</span><span class="r strong">${fmtMoney(a.collectP)}</span></div>
    <div class="list-line"><span class="l">Due at return</span><span class="r">${fmtMoney(a.collectR)}</span></div>
    <div class="list-line"><span class="l">Deposits (held at pick-up)</span><span class="r">${fmtMoney(a.dep)}</span></div>`;
  if (rwStep === 3 && $("#rn-invoice")) rwRenderInvoice();
}
/* Add one typed item section. `type` defaults to the last-used type. */
function rwAddItem(type){
  const t = type || (rwLastType || "serialized");
  rwSeq++; const seq = rwSeq;
  const used = t === "serialized" ? rwUsedSerialized() : {};
  const box = $("#rn-items"); if (!box) return;
  const idx = box.querySelectorAll(".rn-item").length + 1;
  box.insertAdjacentHTML("beforeend",
    `<div class="rn-item" data-seq="${seq}" data-type="${t}">
      <div class="rn-item-head">
        <span class="strong rn-headlbl" id="rn_lbl_${seq}">${RW_TYPE_LABEL[t]} ${idx}</span>
        <span class="rn-item-head-right">
          <span class="rn-t mono" id="rn_t_${seq}"></span>
          <button type="button" class="btn btn-ims-outline btn-sm2 rn-toggle" data-seq="${seq}" title="Collapse / expand"><i class="bi bi-chevron-up"></i></button>
          <button type="button" class="btn btn-ims-outline btn-sm2 rn-del" data-seq="${seq}" title="Remove"><i class="bi bi-x-lg"></i></button>
        </span>
      </div>
      <div class="rn-body">${rwBody(seq, t, used)}</div>
    </div>`);
  const seg = box.querySelector('.rn-item[data-seq="' + seq + '"]');
  rwWireBody(seq);
  rwWireHeader(seg);
  rwFill(seq);
  rwLastType = t;
}

/* Attach body-field listeners (re-run after a type change rebuilds the body). */
function rwWireBody(seq){
  const seg = document.querySelector('#rn-items .rn-item[data-seq="' + seq + '"]');
  if (!seg) return;
  const ty = seg.querySelector(".rn-ty");
  if (ty) ty.addEventListener("change", () => rwReconfigure(seq, ty.value));
  const a = seg.querySelector(".rn-a");
  if (a) a.addEventListener("change", () => rwFill(seq));
  const f = seg.querySelector(".rn-freq");
  if (f) f.addEventListener("change", () => { rwApplyFreq(seq); rwRefreshAll(); });
  const due = seg.querySelector(".rn-due");
  if (due) due.addEventListener("change", rwRefreshAll);
  seg.querySelectorAll(".rn-date, .rn-rate, .rn-q, .rn-up, .rn-dep").forEach(i =>
    i.addEventListener("input", rwRefreshAll));
  const rf = seg.querySelector(".rn-ref");
  if (rf) rf.addEventListener("change", rwRefreshAll);
}

/* Header collapse + remove (attach exactly once, when the section is created). */
function rwWireHeader(seg){
  const seq = seg.dataset.seq;
  const togg = seg.querySelector(".rn-toggle");
  if (togg) togg.addEventListener("click", () => {
    seg.classList.toggle("rn-collapsed");
    const ic = togg.querySelector("i");
    if (ic) ic.className = "bi " + (seg.classList.contains("rn-collapsed") ? "bi-chevron-down" : "bi-chevron-up");
  });
  const del = seg.querySelector(".rn-del");
  if (del) del.addEventListener("click", () => { seg.remove(); rwRefreshAll(); });
}

/* Switching type rebuilds the body with the new catalog + fields. */
function rwReconfigure(seq, newType){
  const seg = document.querySelector('#rn-items .rn-item[data-seq="' + seq + '"]');
  if (!seg || seg.dataset.type === newType) return;
  seg.dataset.type = newType;
  const used = newType === "serialized" ? rwUsedSerialized() : {};
  seg.querySelector(".rn-body").innerHTML = rwBody(seq, newType, used);
  rwWireBody(seq);
  rwFill(seq);
  rwLastType = newType;
}
/* ---- invoice-style review (page 3) ---- */
function rwBasisText(c){
  if (!c.time) return "One-time · " + fmtMoney(c.unit) + "/each";
  const key = c.freq === "hour" ? "hourly" : c.freq === "week" ? "weekly" : "daily";
  const unit = c.freq === "week" ? "week" : c.freq === "hour" ? "hour" : "day";
  return "Rental · " + fmtMoney(c.rates[key]) + "/" + unit + " · " + c.days + " days";
}
function rwRenderInvoice(){
  const box = $("#rn-invoice"); if (!box) return;
  const items = Array.from(document.querySelectorAll("#rn-items .rn-item")).map(rwCompute).filter(Boolean);
  const custSel = $("#rn-cust");
  let custName = "", custContact = "", custAddr = "", custId = "";
  if (custSel){
    custId = custSel.value;
    if (custId === "__new__"){ custName = ($("#rn-name").value || "").trim() || "New customer"; custContact = ($("#rn-contact").value || "").trim() || custName; custAddr = ($("#rn-address").value || "").trim() || "Front counter pickup"; }
    else { const c = getCustomer(custId); if (c){ custName = c.name; custContact = c.contact || c.name; custAddr = c.billingAddress || "Front counter pickup"; } }
  }
  const dueText = c => c.time ? ("Due " + (c.dueAt === "return" ? "at return" : "at pick-up")) : "Due at pick-up";
  const rows = items.map(c => `<tr>
      <td class="num">${fmtInt(c.qty)}</td>
      <td><span class="strong">${c.label}</span><div class="text-muted2">${c.time ? (RW_TYPE_LABEL[c.type] + " · " + c.start + " → " + c.end) : RW_TYPE_LABEL[c.type] + " (sale)"} · <span class="badge-status ${c.dueAt === "return" ? "st-out" : "st-available"}">${dueText(c)}</span></div></td>
      <td class="text-muted2">${rwBasisText(c)}</td>
      <td class="num">${fmtMoney(c.subtotal)}</td></tr>`).join("");
  const a = rwAggregate(items);
  box.innerHTML = `<div class="rw-invoice card">
      <div class="card-body">
        <div class="rw-inv-head">
          <div><div class="strong">RENTAL / CHECK-OUT · NEW</div>
            <div class="text-muted2">Front counter walk-in rental</div></div>
          <div class="text-end text-muted2"><div>${fmtDate(hoTodayStr())}</div><div>Counter · D. Reynolds</div></div>
        </div>
        <div class="divider"></div>
        <div class="list-line"><span class="l">Bill to</span><span class="r strong">${custName}</span></div>
        <div class="list-line"><span class="l">Contact</span><span class="r">${custContact}</span></div>
        <div class="list-line"><span class="l">Site / address</span><span class="r">${custAddr}</span></div>
        <div class="divider"></div>
        ${items.length
          ? `<div class="table-wrap"><table class="table rw-inv-table"><thead><tr>
              <th class="num" style="width:60px">Qty</th><th>Description</th><th>Rate</th><th class="num">Amount</th></tr></thead>
              <tbody>${rows}</tbody></table></div>`
          : `<p class="text-muted2 py-2">No items added yet.</p>`}
        <div class="divider"></div>
        <div class="rw-totals">
          <div class="list-line"><span class="l strong">Due at pick-up</span><span class="r strong">${fmtMoney(a.collectP)}</span></div>
          <div class="list-line text-muted2"><span class="l">Pick-up subtotal</span><span class="r">${fmtMoney(a.subP)}</span></div>
          <div class="list-line text-muted2"><span class="l">Pick-up sales tax (${Math.round(taxRate() * 100)}%)</span><span class="r">${fmtMoney(a.taxP)}</span></div>
          <div class="list-line"><span class="l strong">Due at return</span><span class="r strong">${fmtMoney(a.collectR)}</span></div>
          <div class="list-line text-muted2"><span class="l">Return subtotal</span><span class="r">${fmtMoney(a.subR)}</span></div>
          <div class="list-line text-muted2"><span class="l">Return sales tax (${Math.round(taxRate() * 100)}%)</span><span class="r">${fmtMoney(a.taxR)}</span></div>
          <div class="list-line"><span class="l">Deposits (held at pick-up)</span><span class="r">${fmtMoney(a.dep)}</span></div>
          <div class="divider"></div>
          <div class="list-line"><span class="l strong">Grand total</span><span class="r strong rw-big">${fmtMoney(a.grand)}</span></div>
        </div>
        <div class="text-muted2" style="margin-top:10px"><i class="bi bi-info-circle"></i> Deposits are held at pick-up and returned when the last item is checked back in. Items marked "due at return" are billed on return.</div>
      </div>
    </div>`;
}
/* ---- customer helpers ---- */
function rwCustomerOptions(){
  const opts = IMS.customers.map(c => `<option value="${c.id}">${c.name} · ${c.contact || ""} · ${c.billingCycle || ""}</option>`).join("");
  return `<option value="__new__" selected>— New customer —</option>` + opts;
}
const rwCycleOpts = [["daily", "Daily"], ["weekly", "Weekly"], ["bi-weekly", "Bi-Weekly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"]]
  .map(c => `<option value="${c[0]}">${c[1]}</option>`).join("");

function rwCustFieldsDisabled(off){
  ["name", "contact", "phone", "email", "address", "cycle"].forEach(id => {
    const el = $("#rn-" + id); if (el) el.disabled = off;
  });
}
function rwSyncCustomer(){
  const cust = $("#rn-cust");
  if (!cust) return;
  if (cust.value === "__new__"){
    $("#rn-new").style.display = ""; $("#rn-exist").style.display = "none";
    rwCustFieldsDisabled(false);
  } else {
    $("#rn-new").style.display = "none"; $("#rn-exist").style.display = "";
    const c = getCustomer(cust.value);
    if (c){
      $("#rn-name").value = c.name; $("#rn-contact").value = c.contact || ""; $("#rn-phone").value = c.phone || "";
      $("#rn-email").value = c.email || ""; $("#rn-address").value = c.billingAddress || ""; $("#rn-cycle").value = c.billingCycle || "weekly";
      rwCustFieldsDisabled(true);
      $("#rn-existsum").innerHTML =
        `<div class="list-line"><span class="l">Company</span><span class="r strong">${c.name}</span></div>
         <div class="list-line"><span class="l">Contact</span><span class="r">${c.contact || "—"}</span></div>
         <div class="list-line"><span class="l">Phone / email</span><span class="r">${c.phone || "—"}${c.email ? " · " + c.email : ""}</span></div>
         <div class="list-line"><span class="l">Billing address</span><span class="r">${c.billingAddress || "—"}</span></div>
         <div class="list-line"><span class="l">Billing cycle</span><span class="r">${c.billingCycle || "—"}</span></div>`;
    }
  }
}
/* ---- wizard shell builders ---- */
function rwStepsHTML(){
  return `<div class="rw-steps">
      <div class="rw-step active" data-step="1"><span class="rw-step-n">1</span>Customer</div>
      <div class="rw-step" data-step="2"><span class="rw-step-n">2</span>Items</div>
      <div class="rw-step" data-step="3"><span class="rw-step-n">3</span>Review &amp; Check Out</div>
    </div>`;
}
function rwCustPane(){
  return `<div class="pane" id="rn-p1">
      <div class="rw-pane-title"><i class="bi bi-person-lines-fill"></i> Customer &amp; Billing</div>
      <div class="row g-2 mb-2">
        <div class="col-md-12 field-group"><label class="form-label">Customer</label>
          <select id="rn-cust" class="form-select">${rwCustomerOptions()}</select></div>
      </div>
      <div id="rn-new">
        <div class="row g-2">
          <div class="col-md-6 field-group"><label class="form-label">Company / name *</label><input id="rn-name" class="form-control"></div>
          <div class="col-md-6 field-group"><label class="form-label">Contact</label><input id="rn-contact" class="form-control" placeholder="Name of person picking up"></div>
          <div class="col-md-4 field-group"><label class="form-label">Phone</label><input id="rn-phone" class="form-control" placeholder="(555) 000-0000"></div>
          <div class="col-md-4 field-group"><label class="form-label">Email</label><input id="rn-email" class="form-control" type="email" placeholder="name@company.com"></div>
          <div class="col-md-4 field-group"><label class="form-label">Billing cycle</label>
            <select id="rn-cycle" class="form-select">${rwCycleOpts}</select></div>
          <div class="col-md-12 field-group"><label class="form-label">Billing address</label><input id="rn-address" class="form-control" placeholder="Street, City, State ZIP"></div>
        </div>
      </div>
      <div id="rn-exist" style="display:none"><div class="rn-custcard" id="rn-existsum"></div></div>
      <div class="field-group" style="margin-top:8px"><label class="form-label">Job / delivery site <span class="text-muted2">(optional)</span></label>
        <input id="rn-site" class="form-control" placeholder="Site or counter pick-up (defaults to billing address)"></div>
    </div>`;
}
function rwItemsPane(){
  return `<div class="pane" id="rn-p2">
      <div class="rw-toolbar"><span class="strong"><i class="bi bi-box-seam"></i> Items to rent / sell</span></div>
      <div id="rn-items"></div>
      <div class="rw-additem-wrap"><button type="button" class="btn btn-ims-outline btn-sm2" id="rn-add"><i class="bi bi-plus-lg"></i> Add item</button></div>
      <div id="rn-summary2" class="ho-preview"></div>
    </div>`;
}
function rwReviewPane(){
  return `<div class="pane" id="rn-p3"><div class="rw-pane-title"><i class="bi bi-receipt"></i> Invoice &amp; Check Out</div><div id="rn-invoice"></div></div>`;
}
function rwNavHTML(){
  return `<div class="rw-nav">
      <div class="rw-nav-left">
        <button type="button" class="btn btn-ims-outline" id="rn-back"><i class="bi bi-chevron-left"></i> Back</button>
      </div>
      <div class="rw-nav-right">
        <button type="button" class="btn btn-ims" id="rn-next">Next <i class="bi bi-chevron-right"></i></button>
        <button type="button" class="btn btn-ims" id="rn-create" style="display:none"><i class="bi bi-check2"></i> Create Rental &amp; Check Out</button>
      </div>
    </div>`;
}
function rwGoto(n){
  rwStep = Math.max(1, Math.min(3, n));
  document.querySelectorAll(".rw-wiz .pane").forEach(p => { p.style.display = p.id === "rn-p" + rwStep ? "" : "none"; });
  document.querySelectorAll(".rw-step").forEach(s => s.classList.toggle("active", +s.dataset.step === rwStep));
  const back = $("#rn-back"), next = $("#rn-next"), create = $("#rn-create");
  if (back) back.style.display = rwStep === 1 ? "none" : "";
  if (rwStep < 3){ if (next) next.style.display = ""; if (create) create.style.display = "none"; }
  else { if (next) next.style.display = "none"; if (create) create.style.display = ""; rwRenderInvoice(); }
}

/* ---- overrides the old modal entry point in handoff.js ---- */
function openNewRentalModal(){
  rwSeq = 0; rwStep = 1; rwLastType = "serialized";
  const body = `<div class="rw-wiz">
      ${rwStepsHTML()}
      <div class="rw-panes">
        ${rwCustPane()}
        ${rwItemsPane()}
        ${rwReviewPane()}
      </div>
      ${rwNavHTML()}
    </div>`;
  const root = openRawModal({
    id: "mdl-rental", size: "lg", title: "New Rental / Check Out", icon: "bi-box-arrow-up-right",
    body, footer: ""
  });
  rwSyncCustomer();
  $("#rn-cust").addEventListener("change", rwSyncCustomer);
  $("#rn-add").addEventListener("click", () => rwAddItem());
  rwAddItem("serialized"); // one starting equipment line
  $("#rn-back").addEventListener("click", () => rwGoto(rwStep - 1));
  $("#rn-next").addEventListener("click", () => rwGoto(rwStep + 1));
  document.querySelectorAll(".rw-step").forEach(s => s.addEventListener("click", () => rwGoto(+s.dataset.step)));
  $("#rn-create").addEventListener("click", () => rwCreate(root));
  rwGoto(1);
}
/* ---- create the rental/checkout from all three pages ---- */
function rwCreate(root){
  const custSel = $("#rn-cust");
  if (!custSel) return;
  const custVal = custSel.value;
  let custId = custVal, custName = "", custContact = "", custPhone = "", custEmail = "", custAddr = "", custCycle = "";
  const site = ($("#rn-site").value || "").trim();
  if (custVal === "__new__"){
    custName = ($("#rn-name").value || "").trim();
    if (!custName){ window.alert("Enter the customer name."); return; }
    custContact = ($("#rn-contact").value || "").trim() || custName;
    custPhone = ($("#rn-phone").value || "").trim(); custEmail = ($("#rn-email").value || "").trim();
    custAddr = ($("#rn-address").value || "").trim(); custCycle = $("#rn-cycle").value || "walk-in";
    custId = nextCustomerId();
    IMS.customers.push({ id: custId, name: custName, contact: custContact, phone: custPhone, email: custEmail, billingAddress: custAddr, billingCycle: custCycle, notes: "Walk-in rental / checkout" });
  } else {
    const c = getCustomer(custVal);
    if (c){ custName = c.name; custContact = c.contact || c.name; custAddr = c.billingAddress || ""; }
  }
  const items = Array.from(document.querySelectorAll("#rn-items .rn-item")).map(rwCompute).filter(Boolean);
  if (!items.length){ window.alert("Add at least one item."); return; }

  const seenSer = {}, needQty = {};
  for (const it of items){
    if (it.type === "serialized"){
      if (seenSer[it.ref]){ window.alert(it.label + " is already on the rental — use its own line."); return; }
      seenSer[it.ref] = true;
    }
    if (it.time && it.start && it.end && it.end < it.start){ window.alert(it.label + ": \"Return by\" must be after \"Rent from\"."); return; }
    needQty[it.type + "|" + it.ref] = (needQty[it.type + "|" + it.ref] || 0) + it.qty;
  }
  for (const k in needQty){
    const parts = k.split("|");
    const avail = rwAvail(parts[0], parts[1]);
    if (avail >= 0 && needQty[k] > avail){ window.alert(rwLabel(parts[0], parts[1]) + ": only " + avail + " available."); return; }
  }

  const timeItems = items.filter(i => i.time);
  let cStart = "", cEnd = "";
  timeItems.forEach(it => { if (it.start && (!cStart || it.start < cStart)) cStart = it.start; if (it.end && it.end > cEnd) cEnd = it.end; });
  const today = hoTodayStr();
  if (!cStart) cStart = today;
  if (!cEnd) cEnd = addDays(today, 1);

  const cid = nextContractId();
  const lineItems = items.map(it => {
    const base = { id: nextLiId(), type: it.type, refId: it.ref, qty: it.qty,
      pricingMatrix: "standard", weekendPolicy: "bill", riskPremium: "standard", flatTotal: 0,
      dueAt: it.dueAt || "pickup" };
    if (it.time){
      base.startDate = it.start + "T09:00"; base.endDate = it.end + "T17:00";
      base.customRates = it.rates; base.freq = it.freq;
      base.depositPct = it.depPct; base.depositRefundable = it.refundable;
    } else {
      base.unitPrice = it.unit; base.flatTotal = Math.round(it.unit * it.qty * 100) / 100;
    }
    return base;
  });
  IMS.contracts.push({
    contractId: cid, customerId: custId, customer: custName,
    jobSite: site || custAddr || "Front counter pickup",
    projectName: "Rental / Check Out — " + custName,
    startDate: cStart + "T09:00", endDate: cEnd + "T17:00", status: "active", counter: true,
    orderType: "loan", billing: { enabled: true },
    geofenceRadius: 300, overheads: [],
    siteLat: (IMS.yard && IMS.yard.lat) || 33.7490, siteLng: (IMS.yard && IMS.yard.lng) || -84.3880,
    lineItems
  });
  const contract = getContract(cid);
  items.forEach(it => {
    if (it.type === "serialized"){
      syncInventoryOnStage("serialized", it.ref, 1, true, contract);
      hoLog(it.ref, cid, "Check-Out", custContact, "Rental checked out at the front desk.");
    } else if (it.type === "bulk" || it.type === "consumable" || it.type === "part"){
      syncInventoryOnStage(it.type, it.ref, it.qty, true, contract);
    }
    /* kits + attachments leave no stock-count change here */
  });
  dismissModal(root);
  renderHandoff();
}
// EOF








