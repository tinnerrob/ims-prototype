/* =========================================================
   IMS — categories.js (split out of app.js)
   Resource categories management.
   ========================================================= */
"use strict";

function renderCategories(){
  $("#content").innerHTML = `
    <div class="page-head"></div>
    <div class="card"><div class="card-header"><span class="card-title"><i class="bi bi-tags"></i> Resource Categories</span>
      <button class="btn btn-ims btn-sm2" id="catAddBtn"><i class="bi bi-plus-lg"></i> Add Category</button></div>
      <div class="card-body">${categoriesManagerHTML()}</div></div>`;
  bindCategoryManager();
}

function categoriesManagerHTML(){
  return `
    <div class="subtabs" id="catTabs">
      ${CAT_TYPES.map(t => `<button class="subtab ${t.key === App.catType ? "active" : ""}" data-type="${t.key}">
        <i class="bi ${t.icon}"></i>${t.label}<span class="count-pill">${IMS.settings.categories[t.key].length}</span></button>`).join("")}
    </div>
    <div id="catPanel">${categoryTable()}</div>`;
}

const CAT_TYPES = [
  { key:"serialized", label:"Serialized Equipment", icon:"bi-truck-front" },
  { key:"bulk", label:"Bulk Resources", icon:"bi-boxes" },
  { key:"consumable", label:"Consumables", icon:"bi-capsule" },
  { key:"labor", label:"Labor / Employees", icon:"bi-person-badge" },
  { key:"parts", label:"Stock Inventory", icon:"bi-wrench-adjustable" }
];
const typeLabel = t => (CAT_TYPES.find(x => x.key === t) || {}).label || t;
const activeCats = type => (IMS.settings.categories[type] || []).filter(c => c.active !== false).map(c => c.name);
const catOptions = (type, current) => {
  const names = activeCats(type);
  if (current && !names.includes(current)) names.push(current);
  return opt(names);
};

function categoryTable(){
  const type = App.catType;
  const cats = IMS.settings.categories[type] || [];
  const countOf = cat => {
    if (type === "serialized") return IMS.serializedAssets.filter(a => a.category === cat).length;
    if (type === "bulk") return IMS.bulkResources.filter(b => b.category === cat).length;
    if (type === "consumable") return IMS.consumables.filter(c => c.category === cat).length;
    if (type === "labor") return IMS.labor.filter(e => e.category === cat).length;
    if (type === "parts") return IMS.parts.filter(p => p.category === cat).length;
    return 0;
  };
  const rows = cats.map(c => `<tr>
    <td class="strong">${c.name}</td>
    <td>${c.active !== false ? `<span class="badge-status st-active"><i class="bi bi-circle-fill"></i>Active</span>` : `<span class="badge-status st-out"><i class="bi bi-circle-fill"></i>Inactive</span>`}</td>
    <td class="num">${countOf(c.name)}</td>
    <td class="text-end text-nowrap">
      <button class="btn btn-ims-outline btn-sm2" data-cate="rename" data-name="${c.name}" title="Rename"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-ims-outline btn-sm2" data-cate="del" data-name="${c.name}" title="Remove"><i class="bi bi-x-lg"></i></button>
    </td>
  </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Category</th><th>Active</th><th class="num">Items</th><th class="text-end">Actions</th>
  </tr></thead><tbody>${rows || emptyRow(4)}</tbody></table></div>`;
}

function bindCategoryManager(){
  $$("#catTabs .subtab").forEach(b => b.addEventListener("click", () => { App.catType = b.dataset.type; renderCategories(); }));
  const addBtn = $("#catAddBtn");
  if (addBtn) addBtn.addEventListener("click", addCategoryModal);
  const panel = $("#catPanel");
  if (!panel) return;
  panel.addEventListener("click", e => {
    const r = e.target.closest("[data-cate]");
    if (!r) return;
    const type = App.catType, name = r.dataset.name;
    if (r.dataset.cate === "del") { IMS.settings.categories[type] = IMS.settings.categories[type].filter(c => c.name !== name); renderCategories(); }
    else if (r.dataset.cate === "rename") renameCategoryModal(type, name);
  });
}

function addCategoryModal(){
  const type = App.catType;
  openFormModal({
    id: "mdl-cat-add", title: "Add Category — " + typeLabel(type), icon: "bi-plus-circle",
    fields: [
      { key:"name", label:"Category Name", type:"text", value:"", required:true },
      { key:"active", label:"Active", type:"checkbox", value:true, hint:"Inactive categories won't appear in Inventory & Assets" }
    ],
    onSave: v => {
      const name = v.name.trim();
      if (name && !IMS.settings.categories[type].some(c => c.name === name)) IMS.settings.categories[type].push({ name, active: v.active !== false });
      renderCategories();
    }
  });
}

function renameRecords(type, oldName, newName){
  if (type === "serialized") IMS.serializedAssets.forEach(a => { if (a.category === oldName) a.category = newName; });
  else if (type === "bulk") IMS.bulkResources.forEach(b => { if (b.category === oldName) b.category = newName; });
  else if (type === "consumable") IMS.consumables.forEach(c => { if (c.category === oldName) c.category = newName; });
  else if (type === "labor") IMS.labor.forEach(e => { if (e.category === oldName) e.category = newName; });
}

function renameCategoryModal(type, oldName){
  const cat = IMS.settings.categories[type].find(c => c.name === oldName);
  openFormModal({
    id: "mdl-cat-rename", title: "Rename Category — " + oldName, icon: "bi-pencil-square",
    fields: [
      { key:"name", label:"New Category Name", type:"text", value: oldName, required:true },
      { key:"active", label:"Active", type:"checkbox", value: cat ? cat.active : true, hint:"Inactive categories won't appear in Inventory & Assets" }
    ],
    onSave: v => {
      const arr = IMS.settings.categories[type];
      const idx = arr.findIndex(c => c.name === oldName);
      if (idx >= 0) { arr[idx].name = v.name; arr[idx].active = v.active !== false; renameRecords(type, oldName, v.name); }
      renderCategories();
    }
  });
}

