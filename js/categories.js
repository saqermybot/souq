// categories.js (نسخة مرتبة: عربي + value=id + كاش + دعم قوائم فرعية اختياري)

import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";

import {
  collection,
  getDocs,
  orderBy,
  query

// ✅ كاش للأنواع: categoryId -> types[]

function arabicElectLabel(id){
  const s = (id || "").toString().trim().toLowerCase();
  if (!s) return "";
  if (s === "mobiles" || s === "mobile" || s === "phone" || s === "phones") return "موبايلات";
  if (s === "tv" || s === "television" || s === "tvs") return "تلفزيونات";
  if (s === "computers" || s === "computer" || s === "pc" || s === "laptops") return "كمبيوتر";
  if (s === "games" || s === "game" || s === "playstation" || s === "ps") return "ألعاب";
  // لو كان أصلاً عربي
  return (id || "").toString().trim();
}

const _typesCache = new Map();

// ✅ مصدر احتياطي ثابت للأصناف (يضمن عدم انهيار الواجهة إذا تعطل Firestore داخل بعض الدول)
const DEFAULT_CATEGORIES = [
  { id: "cars", name_ar: "سيارات", order: 10, isActive: true },
  { id: "realestate", name_ar: "عقارات", order: 20, isActive: true },
  { id: "electronics", name_ar: "إلكترونيات", order: 30, isActive: true },
];

async function loadCategoriesFromFile() {
  // يمكن وضع الملف في: /data/categories.json داخل GitHub/Hosting
  const url = `/data/categories.json?v=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`categories.json HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error("categories.json invalid");
  return data;
}

async function loadCategoriesFromFirestore() {
  // تحميل Firebase/Firestore عند الحاجة فقط (يقلل الأعطال إذا كانت Google endpoints غير مستقرة)
  const fb = await import("./firebase.js");
  const { collection, getDocs, orderBy, query } = await import(
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"
  );

  const qy = query(collection(fb.db, "categories"), orderBy("order", "asc"));
  const snap = await getDocs(qy);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}


export async function initCategories() {
  // خيارات افتراضية
  if (UI.el.catFilter) UI.el.catFilter.innerHTML = `<option value="">كل الأصناف</option>`;
  if (UI.el.aCat) UI.el.aCat.innerHTML = `<option value="">اختر صنف الإعلان</option>`;

  // action
  UI.actions.loadCategories = loadCategories;

  // تحميل أولي
  await loadCategories();

  // ✅ لما يغيّر المستخدم الصنف بصفحة "إعلان جديد"
  // (اختياري) عبّي أنواع القسم (types) بشكل ديناميكي من Firestore
  if (UI.el.aCat) {
    UI.el.aCat.addEventListener("change", () => {
      const catId = UI.el.aCat.value || "";
      syncTypesForCategory(catId).catch(()=>{});
    });
  }

  // ✅ لما يغيّر المستخدم الصنف بالفلترة
  if (UI.el.catFilter) {
    UI.el.catFilter.addEventListener("change", () => {
      const catId = UI.el.catFilter.value || "";
      syncTypesForCategory(catId).catch(()=>{});
    });
  }
}

/**
 * يجلب الأصناف من Firestore:
 * - value = id (cars / realestate / electronics)
 * - label = name_ar (عربي)
 * - كاش إلى UI.state.categories
 */
async function loadCategories() {
  let raw = null;

  // 1) حاول جلب الأصناف من ملف ثابت (أفضل لسوريا لأنه لا يعتمد على Google endpoints)
  try {
    raw = await loadCategoriesFromFile();
  } catch (e) {
    console.warn("[categories] file source failed:", e?.message || e);
  }

  // 2) إذا فشل الملف، جرّب Firestore
  if (!raw) {
    try {
      raw = await loadCategoriesFromFirestore();
    } catch (e) {
      console.warn("[categories] firestore source failed:", e?.message || e);
    }
  }

  // 3) آخر حل: default ثابت
  if (!raw) raw = DEFAULT_CATEGORIES;

  // ✅ فعّال فقط + ترتيب ثابت
  const active = raw
    .map((x) => ({
      id: (x.id || "").toString().trim(),
      name_ar: x.name_ar || x.title || x.name || x.nameAr || x.label,
      order: Number(x.order ?? 999),
      isActive: (x.isActive === undefined ? true : !!x.isActive),
    }))
    .filter((x) => x.id && x.isActive === true)
    .sort((a, b) => a.order - b.order);

  // ✅ خزّن بالكاش لتستخدمها بأي ملف
  UI.state.categories = active;

  const opts = active.map((x) => {
    const label = (x.name_ar || x.id || "").toString().trim();
    return `<option value="${escapeHtml(x.id)}">${escapeHtml(label)}</option>`;
  });

  if (UI.el.catFilter) {
    UI.el.catFilter.innerHTML = `<option value="">كل الأصناف</option>` + opts.join("");
  }
  if (UI.el.aCat) {
    UI.el.aCat.innerHTML = `<option value="">اختر صنف الإعلان</option>` + opts.join("");
  }

  // ✅ بعد التحميل: جهّز الفرعيات بناء على الاختيار الحالي (لو فيه)
  const selectedCat = UI.el.aCat?.value || "";
  syncTypesForCategory(selectedCat).catch(()=>{});
}


/**
 * ✅ تحميل أنواع القسم (types) ديناميكياً من:
 * categories/{catId}/types
 *
 * الاستعمال الحالي:
 * - فلترة الإلكترونيات: electKindFilter
 * - فلترة العقارات: estateKindFilter (لو كانت عندك types للعقارات)
 *
 * ملاحظة: هذا لا يضيف أي ميزة جديدة للمستخدم، فقط يستبدل الخيارات الهاردكود
 * بخيارات Firestore عند توفرها.
 */
async function syncTypesForCategory(catId){
  const cid = (catId || "").toString().trim();
  // إذا ما في قسم، رجّع القوائم للوضع الافتراضي
  if (!cid){
    resetDynamicTypeSelects();
    return;
  }

  const types = await loadTypes(cid);
  // إذا ما في types، ما نكسر شي
  if (!types.length){
    resetDynamicTypeSelects(cid);
    return;
  }

  // ✅ إلكترونيات: عبّي قائمة النوع الموجودة أصلاً
  if (cid === "electronics" && UI.el.electKindFilter){
    UI.el.electKindFilter.innerHTML =
      `<option value="">كل الأنواع</option>` +
      types.map(t => {
        const label = (t.name_ar || arabicElectLabel(t.id) || t.id);
        return `<option value="${escapeHtml(t.id)}">${escapeHtml(label)}</option>`;
      }).join("");
  }
}

async function loadTypes(categoryId){
  if (_typesCache.has(categoryId)) return _typesCache.get(categoryId);
  try{
    const qy = query(
      collection(db, "categories", categoryId, "types"),
      orderBy("order", "asc")
    );
    const snap = await getDocs(qy);
    const arr = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(x => x.isActive === true);
    _typesCache.set(categoryId, arr);
    return arr;
  }catch(e){
    _typesCache.set(categoryId, []);
    return [];
  }
}

function resetDynamicTypeSelects(currentCatId=""){
  // رجّع الالكترونيات للوضع الافتراضي إذا مو بقسم الإلكترونيات
  if (currentCatId !== "electronics" && UI.el.electKindFilter){
    UI.el.electKindFilter.innerHTML = `
      <option value="">كل الأنواع</option>
      <option value="mobiles">موبايلات</option>
      <option value="tv">تلفزيونات</option>
      <option value="computers">كمبيوتر</option>
      <option value="games">ألعاب (بلايستيشن)</option>
    `;
  }
  if (currentCatId !== "realestate" && UI.el.estateKindFilter){
    UI.el.estateKindFilter.innerHTML = `
      <option value="">كل أنواع العقارات</option>
      <option value="شقة">شقة</option>
      <option value="محل">محل</option>
      <option value="أرض">أرض</option>
      <option value="بيت">بيت</option>
    `;
  }
}