// categories.js (Supabase)
// هدف هذا الملف: مصدر واحد للأقسام يُستخدم للفلترة ولإضافة الإعلان.

import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import { getSupabase } from "./supabase.js";

const CACHE_KEY = "souq_categories_cache_v1";
const CACHE_TTL_MS = 10 * 60 * 1000;

function now(){ return Date.now(); }

function normalizeRow(r){
  return {
    id: String(r.id),
    name: String(r.name || ""),
    icon: r.icon || null,
    order: Number(r.order_no ?? 100),
    parentId: r.parent_id ? String(r.parent_id) : null,
    groupKey: r.group_key ? String(r.group_key) : null,
    isActive: r.is_active !== false,
  };
}

async function fetchAllCategories(){
  const sb = getSupabase();
  const { data, error } = await sb
    .from("categories")
    .select("id,name,icon,order_no,parent_id,group_key,is_active")
    .eq("is_active", true)
    .order("order_no", { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeRow);
}

function buildMaps(cats){
  const byId = new Map();
  const childrenByParent = new Map();
  const childrenByParentAndGroup = new Map();

  for (const c of cats){
    byId.set(c.id, c);
    if (c.parentId){
      if (!childrenByParent.has(c.parentId)) childrenByParent.set(c.parentId, []);
      childrenByParent.get(c.parentId).push(c);

      const k = `${c.parentId}::${c.groupKey || ""}`;
      if (!childrenByParentAndGroup.has(k)) childrenByParentAndGroup.set(k, []);
      childrenByParentAndGroup.get(k).push(c);
    }
  }

  // sort children arrays by order
  for (const arr of childrenByParent.values()) arr.sort((a,b)=>a.order-b.order);
  for (const arr of childrenByParentAndGroup.values()) arr.sort((a,b)=>a.order-b.order);

  return { byId, childrenByParent, childrenByParentAndGroup };
}

function cacheSet(cats){
  try{
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: now(), cats }));
  }catch{}
}

function cacheGet(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if(!raw) return null;
    const j = JSON.parse(raw);
    if(!j?.t || !Array.isArray(j?.cats)) return null;
    if(now() - j.t > CACHE_TTL_MS) return null;
    return j.cats;
  }catch{ return null; }
}

function setGlobalCategoryMaps(cats){
  const maps = buildMaps(cats);
  globalThis.__CATS = {
    list: cats,
    byId: maps.byId,
    childrenByParent: maps.childrenByParent,
    childrenByParentAndGroup: maps.childrenByParentAndGroup,
    // helper:
    getChildren(parentId){ return maps.childrenByParent.get(parentId) || []; },
    getChildrenByGroup(parentId, groupKey){ return maps.childrenByParentAndGroup.get(`${parentId}::${groupKey||""}`) || []; }
  };
}

function fillSelect(selectEl, items, { placeholder = "كل الأصناف", valueKey="id", labelKey="name" } = {}){
  if (!selectEl) return;
  const current = selectEl.value || "";
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder;
  selectEl.appendChild(ph);

  for (const it of items){
    const opt = document.createElement("option");
    opt.value = String(it[valueKey]);
    opt.textContent = escapeHtml(String(it[labelKey] || it.id));
    selectEl.appendChild(opt);
  }

  // try keep selected
  if ([...selectEl.options].some(o => o.value === current)) {
    selectEl.value = current;
  }
}

export async function initCategories(){
  // 1) حاول من الكاش
  const cached = cacheGet();
  if (cached && cached.length){
    setGlobalCategoryMaps(cached);
    fillMainCategorySelects(cached);
  }

  // 2) جلب مباشر من Supabase
  try{
    const cats = await fetchAllCategories();
    cacheSet(cats);
    setGlobalCategoryMaps(cats);
    fillMainCategorySelects(cats);
  }catch(e){
    console.warn("Supabase categories failed, using cached if any.", e);
  }
}

function fillMainCategorySelects(cats){
  const mains = cats.filter(c => !c.parentId).sort((a,b)=>a.order-b.order);

  // Filter select
  fillSelect(UI.el.catFilter || document.getElementById("catFilter"), mains, { placeholder: "كل الأصناف" });

  // Add listing select
  fillSelect(document.getElementById("aCat"), mains, { placeholder: "اختر الصنف" });
}
