import { db } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import {
  collection, getDocs, orderBy, query, where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// fallback (مؤقت) لو Firestore فاضي
const FALLBACK = [
  { id:"cars",      name_ar:"سيارات" },
  { id:"phones",    name_ar:"موبايلات" },
  { id:"home",      name_ar:"بيت وأثاث" },
  { id:"jobs",      name_ar:"وظائف" },
  { id:"services",  name_ar:"خدمات" },
  { id:"other",     name_ar:"متفرقات" },
];

export async function initCategories(){
  UI.el.catFilter.innerHTML = `<option value="">كل الأصناف</option>`;
  UI.el.aCat.innerHTML = `<option value="">اختر صنف</option>`;

  UI.actions.loadCategories = loadCategories;

  // زر التحديث (من index.html)
  if (UI.el.btnReloadCats){
    UI.el.btnReloadCats.onclick = async () => {
      await loadCategories(true);
      if (UI.el.catsHint) UI.el.catsHint.textContent = "";
    };
  }

  await loadCategories(false);
}

async function loadCategories(forceFallback=false){
  let opts = [];

  if (!forceFallback){
    try{
      // حاول من Firestore أولاً
      const qy = query(
        collection(db, "categories"),
        where("isActive","==", true),
        orderBy("order","asc")
      );
      const snap = await getDocs(qy);

      opts = snap.docs.map(d=>{
        const id = d.id;
        const n = d.data().name_ar || id;
        return { id, name_ar: n };
      });
    }catch(e){
      // إذا صار خطأ index/permission/.. نروح للـ fallback
      opts = [];
    }
  }

  if (!opts.length){
    opts = FALLBACK;
    // تلميح للمستخدم
    if (UI.el.catsHint){
      UI.el.catsHint.textContent = "تم استخدام أصناف مؤقتة. (يفضّل إضافة categories بفايرستور).";
    }
  }

  const html = opts.map(x =>
    `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name_ar)}</option>`
  ).join("");

  UI.el.catFilter.innerHTML = `<option value="">كل الأصناف</option>` + html;
  UI.el.aCat.innerHTML = `<option value="">اختر صنف</option>` + html;
}