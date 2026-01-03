import { db } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import {
  collection, getDocs, orderBy, query, where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function initCategories(){
  UI.el.catFilter.innerHTML = `<option value="">كل الأصناف</option>`;
  UI.el.aCat.innerHTML = `<option value="">اختر صنف</option>`;

  UI.actions.loadCategories = loadCategories;
  await loadCategories();
}

async function loadCategories(){
  const qy = query(
    collection(db, "categories"),
    where("isActive","==", true),
    orderBy("order","asc")
  );

  const snap = await getDocs(qy);
  const opts = snap.docs.map(d=>{
    const id = d.id;
    const n = d.data().name_ar || id;
    return `<option value="${id}">${escapeHtml(n)}</option>`;
  });

  UI.el.catFilter.innerHTML = `<option value="">كل الأصناف</option>` + opts.join("");
  UI.el.aCat.innerHTML = `<option value="">اختر صنف</option>` + opts.join("");
}