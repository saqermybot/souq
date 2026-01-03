import { db } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import {
  collection, getDocs, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function initCategories(){
  UI.el.catFilter.innerHTML = `<option value="">كل الأصناف</option>`;
  UI.el.aCat.innerHTML = `<option value="">اختر صنف</option>`;

  UI.actions.loadCategories = loadCategories;
  await loadCategories();
}

async function loadCategories(){
  // ✅ بدون where لتفادي الـ composite index
  const qy = query(
    collection(db, "categories"),
    orderBy("order","asc")
  );

  const snap = await getDocs(qy);

  // فلترة محلية لـ isActive
  const active = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.isActive === true);

  const opts = active.map(x=>{
    const n = x.name_ar || x.id;
    return `<option value="${escapeHtml(x.id)}">${escapeHtml(n)}</option>`;
  });

  UI.el.catFilter.innerHTML = `<option value="">كل الأصناف</option>` + opts.join("");
  UI.el.aCat.innerHTML = `<option value="">اختر صنف</option>` + opts.join("");
}