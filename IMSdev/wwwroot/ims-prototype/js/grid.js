/* =========================================================
   IMS — grid.js  (shared data-table + column-profile layer)
   Lets any table declare its columns as descriptors and renders
   <thead>/<tbody> from them, skipping columns the tenant hides.
   Show/hide columns via a "Columns" gear, persisted per table in
   localStorage under `ims.cols.<tableId>`.
   ========================================================= */
"use strict";

window.IMSGrid = (function(){
  const PREFIX = "ims.cols.";
  const renderers = {};   // tableId -> rerender callback

  /* Read a dotted path into a record (flat core fields, or JSONB-style nested
     paths like "extended_attributes.meter_hours"). */
  function getValueByPath(obj, path){
    if (obj == null || !path) return obj;
    return String(path).split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function defaultVis(cols){
    const v = {};
    cols.forEach(c => { v[c.key] = (c.always === true) || (c.defaultHidden !== true); });
    return v;
  }

  function loadVis(tableId, cols){
    const v = defaultVis(cols);
    try {
      const raw = localStorage.getItem(PREFIX + tableId);
      if (raw){ const s = JSON.parse(raw); if (s && typeof s === "object"){ cols.forEach(c => { if (s[c.key] !== undefined) v[c.key] = !!s[c.key]; }); } }
    } catch(_) {}
    cols.forEach(c => { if (c.always === true) v[c.key] = true; });
    return v;
  }

  function saveVis(tableId, v){ try { localStorage.setItem(PREFIX + tableId, JSON.stringify(v)); } catch(_) {} }

  /* Per-column classes: thClass = c.th ?? c.align ; tdClass = c.td ?? c.align */
  const thCls = c => (c.th != null ? c.th : (c.align || ""));
  const tdCls = c => (c.td != null ? c.td : (c.align || ""));

  function visibleCols(tableId, cols){
    const v = loadVis(tableId, cols);
    return cols.filter(c => v[c.key] !== false);
  }

  function headHTML(cs){
    return cs.map(c => `<th${thCls(c) ? ` class="${thCls(c)}"` : ""}>${c.header}</th>`).join("");
  }

  function cellValue(c, rec){
    let val = c.render ? c.render(rec) : getValueByPath(rec, c.path || c.key);
    return (val == null) ? "" : val;
  }

  function rowHTML(cs, rec, trAttrs){
    const td = c => { const k = tdCls(c); return k ? ` class="${k}"` : ""; };
    return `<tr${trAttrs ? ` ${trAttrs(rec)}` : ""}>` + cs.map(c => `<td${td(c)}>${cellValue(c, rec)}</td>`).join("") + "</tr>";
  }

  function bodyHTML(tableId, cols, records, opts){
    const cs = visibleCols(tableId, cols);
    if (!records.length) return `<tr><td colspan="${cs.length}" class="text-center text-muted2 py-4">${opts.empty || "No records."}</td></tr>`;
    return records.map(rec => rowHTML(cs, rec, opts.trAttrs)).join("");
  }
  /* Render the full grid HTML (Columns gear + menu container + table). The
     caller replaces its panel with the returned string, then keeps row events
     working via delegation (data-* attributes unchanged). */
  function render(tableId, cols, records, opts){
    opts = opts || {};
    const cs = visibleCols(tableId, cols);
    renderers._cols = renderers._cols || {};
    renderers._cols[tableId] = cols;
    const html =
      `<div class="grid-head">
         <button type="button" class="btn btn-ims-outline btn-sm2 grid-cols-toggle" data-grid="${tableId}" title="Show / hide columns"><i class="bi bi-ui-checks"></i> Columns</button>
         <div class="grid-cols-menu hidden" data-grid-menu="${tableId}"></div>
       </div>
       <div class="table-wrap"><table class="table"><thead><tr>${headHTML(cs)}</tr></thead>
         <tbody data-grid-body="${tableId}">${bodyHTML(tableId, cols, records, opts)}</tbody></table></div>`;
    if (opts.renderer) renderers[tableId] = opts.renderer;
    return html;
  }

  function ensure(tableId, renderer){ if (renderer) renderers[tableId] = renderer; }
  function rerender(tableId){ const fn = renderers[tableId]; if (fn) fn(); }

  function menuHTML(tableId){
    const cols = (renderers._cols && renderers._cols[tableId]) || [];
    const v = loadVis(tableId, cols);
    const items = cols.filter(c => c.always !== true).map(c =>
      `<label class="grid-col-opt"><input type="checkbox" data-col="${c.key}" ${v[c.key] !== false ? "checked" : ""}>${c.header}</label>`).join("");
    return `<div class="grid-cols-head">Columns</div>
      ${items || `<div class="text-muted2 text-12">No toggleable columns.</div>`}
      <button type="button" class="btn btn-ims-outline btn-sm2 w-100 mt-2 grid-cols-reset" data-grid="${tableId}">Reset to defaults</button>`;
  }

  /* ---- delegated gear + menu handling ---- */
  document.addEventListener("click", function(e){
    const gear = e.target.closest(".grid-cols-toggle");
    if (gear){
      e.stopPropagation();
      const id = gear.dataset.grid;
      const head = gear.closest(".grid-head");
      const menu = head && head.querySelector('[data-grid-menu="' + id + '"]');
      if (menu){
        document.querySelectorAll(".grid-cols-menu").forEach(m => { if (m !== menu) m.classList.add("hidden"); });
        if (menu.classList.contains("hidden") || !menu.childElementCount) menu.innerHTML = menuHTML(id);
        menu.classList.toggle("hidden");
      }
      return;
    }
    const reset = e.target.closest(".grid-cols-reset");
    if (reset){
      const id = reset.dataset.grid;
      try { localStorage.removeItem(PREFIX + id); } catch(_) {}
      rerender(id);
      return;
    }
    const cb = e.target.closest('.grid-cols-menu input[data-col]');
    if (cb){
      const menu = cb.closest(".grid-cols-menu");
      const id = menu && menu.dataset.gridMenu;
      const cols = (renderers._cols && renderers._cols[id]) || [];
      if (id){ const v = loadVis(id, cols); v[cb.dataset.col] = cb.checked; saveVis(id, v); rerender(id); }
      return;
    }
    if (!e.target.closest(".grid-cols-menu")){
      document.querySelectorAll(".grid-cols-menu").forEach(m => m.classList.add("hidden"));
    }
  });

  return {
    prefix: PREFIX,
    getValueByPath,
    registerColumns: function(tableId, cols){ renderers._cols = renderers._cols || {}; renderers._cols[tableId] = cols; },
    render: render,
    ensure: ensure,
    rerender: rerender,
    visible: visibleCols,
    loadVis: loadVis
  };
})();

