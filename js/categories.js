// categories.js (نسخة مرتبة: عربي + value=id + كاش + دعم قوائم فرعية اختياري)

import { db } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";

import {
  collection,
  getDocs,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ كاش للأنواع: categoryId -> types[]
const _typesCache = new Map();

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
  const qy = query(collection(db, "categories"), orderBy("order", "asc"));
  const snap = await getDocs(qy);

  const active = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => x.isActive === true);

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
      types.map(t => `<option value="${escapeHtml(t.name_ar || t.id)}">${escapeHtml(t.name_ar || t.id)}</option>`).join("");
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
      <option value="موبايل">موبايل</option>
      <option value="تلفزيون">تلفزيون</option>
      <option value="كمبيوتر">كمبيوتر</option>
      <option value="ألعاب">ألعاب (بلايستيشن)</option>
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