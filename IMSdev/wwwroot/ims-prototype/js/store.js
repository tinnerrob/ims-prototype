/* =========================================================
   IMS — store.js  (JSON data service / API seam)
   Central access to the core JSON collections. Views will read
   and write through repositories; a future `apiAdapter` can back
   these same methods (async, JSON) without touching modules.
   Business data persists as JSON (localStorage) behind `save`.
   ========================================================= */
"use strict";

IMS.store = (function(){
  const listeners = [];

  /* Resolve a live array for a core table name (items = full typed catalog). */
  function arrayOf(name){
    if (name === "parties") return IMS.parties;
    if (name === "orders") return IMS.orders;
    if (name === "movements") return IMS.movements;
    if (name === "labor") return IMS.labor;
    return null;
  }

  function emit(name){
    listeners.forEach(fn => { try { fn(name); } catch(_) {} });
  }

  function repo(name){
    const arr = arrayOf(name);
    return {
      name,
      list(){ return arr ? arr.slice() : []; },
      get(pred){ return arr ? arr.find(pred) || null : null; },
      create(rec){
        if (!arr) throw new Error("Unknown store table: " + name);
        arr.push(rec); emit(name); return rec;
      },
      update(idField, id, patch){
        if (!arr) return null;
        const rec = arr.find(r => r[idField] === id);
        if (rec){ Object.assign(rec, patch); emit(name); return rec; }
        return null;
      },
      remove(idField, id){
        if (!arr) return false;
        const i = arr.findIndex(r => r[idField] === id);
        if (i >= 0){ arr.splice(i, 1); emit(name); return true; }
        return false;
      }
    };
  }

  const STORE_KEY = "ims.store";

  return {
    /* apiAdapter: set { list, create, update, remove } (async JSON) later. */
    api: { mode: "local", adapter: null },

    repo,
    on(fn){ listeners.push(fn); },

    /* JSON persistence behind the store (swap for API in future). */
    save(){
      const snapshot = { parties: IMS.parties, orders: IMS.orders, movements: IMS.movements };
      try { if (window.localStorage) localStorage.setItem(STORE_KEY, JSON.stringify(snapshot)); } catch(_) {}
    },
    hydrate(){
      try {
        if (!window.localStorage) return;
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return;
        const snap = JSON.parse(raw);
        (["parties","orders","movements"]).forEach(k => {
          if (Array.isArray(snap[k]) && Array.isArray(IMS[k])){ IMS[k].length = 0; snap[k].forEach(r => IMS[k].push(r)); }
        });
      } catch(_) {}
    }
  };
})();
