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

export async function initCategories() {
  // خيارات افتراضية
  if (UI.el.catFilter) UI.el.catFilter.innerHTML = `<option value="">كل الأصناف</option>`;
  if (UI.el.aCat) UI.el.aCat.innerHTML = `<option value="">اختر صنف</option>`;

  // action
  UI.actions.loadCategories = loadCategories;

  // تحميل أولي
  await loadCategories();

  // ✅ لما يغيّر المستخدم الصنف بصفحة "إعلان جديد"
  // (اختياري) عبّي قوائم فرعية مثل بيع/إيجار أو نوع العقار
  if (UI.el.aCat) {
    UI.el.aCat.addEventListener("change", () => {
      const catId = UI.el.aCat.value || "";
      syncSubFiltersForCategory(catId);
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
    UI.el.aCat.innerHTML = `<option value="">اختر صنف</option>` + opts.join("");
  }

  // ✅ بعد التحميل: جهّز الفرعيات بناء على الاختيار الحالي (لو فيه)
  const selectedCat = UI.el.aCat?.value || "";
  syncSubFiltersForCategory(selectedCat);
}

/**
 * (اختياري) تعبئة فلاتر/قوائم فرعية حسب الصنف
 * هذا ما رح يكسر شي إذا ما عندك عناصر بالـ UI
 *
 * - للسيارات: بيع/إيجار + سنة
 * - للعقارات: بيع/إيجار + نوع العقار + غرف
 * - للإلكترونيات: نوع (موبايل/تلفزيون/كمبيوتر) لاحقاً
 */
function syncSubFiltersForCategory(catId) {
  // لو ما عندك عناصر، ما بصير شي
  // مثال عناصر ممكن تكون موجودة عندك لاحقاً:
  // UI.el.aType, UI.el.aYear, UI.el.aEstateKind, UI.el.aRooms ...

  // ✅ أمثلة جاهزة (بس ما تفرض وجود العناصر)
  if (catId === "cars") {
    // إذا عندك select لبيع/إيجار
    if (UI.el.aType) {
      UI.el.aType.innerHTML = `
        <option value="">اختر نوع الإعلان</option>
        <option value="بيع">بيع</option>
        <option value="إيجار">إيجار</option>
      `;
    }

    // إذا عندك سنة
    if (UI.el.aYear) {
      UI.el.aYear.placeholder = "سنة الموديل (مثال 2006)";
    }
  }

  if (catId === "realestate") {
    if (UI.el.aTypeEstate) {
      UI.el.aTypeEstate.innerHTML = `
        <option value="">اختر نوع الإعلان</option>
        <option value="بيع">بيع</option>
        <option value="إيجار">إيجار</option>
      `;
    }

    if (UI.el.aEstateKind) {
      UI.el.aEstateKind.innerHTML = `
        <option value="">اختر نوع العقار</option>
        <option value="شقة">شقة</option>
        <option value="بيت">بيت</option>
        <option value="محل">محل</option>
        <option value="أرض">أرض</option>
      `;
    }
  }

  if (catId === "electronics") {
    // لاحقاً إذا بدك: موبايل/تلفزيون/كمبيوتر
    if (UI.el.aElectKind) {
      UI.el.aElectKind.innerHTML = `
        <option value="">اختر النوع</option>
        <option value="موبايل">موبايل</option>
        <option value="تلفزيون">تلفزيون</option>
        <option value="كمبيوتر">كمبيوتر</option>
        <option value="ألعاب">ألعاب (بلايستيشن)</option>
      `;
    }
  }
}