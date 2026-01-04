// listings.js (آخر تعديل: سطر سيارات بالكارد + زر "مراسلة" يفتح Inbox إذا الإعلان إلك، وإلا يفتح شات)

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";

import {
  collection,
  getDoc,
  getDocs,
  doc,
  limit,
  orderBy,
  query,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   ✅ Helpers للسيارات
========================= */

function typeToAr(typeId){
  if (typeId === "sale") return "بيع";
  if (typeId === "rent") return "إيجار";
  return "";
}

function getCarModel(data){
  // ندعم أكثر من شكل تخزين لتجنب كسر القديم
  return (data.car?.model ?? data.model ?? "").toString().trim();
}

function getCarYear(data){
  return (data.car?.year ?? data.year ?? "").toString().trim();
}

function getTypeId(data){
  return (data.typeId ?? data.car?.typeId ?? data.type ?? "").toString().trim();
}

function isCarsCategory(data){
  // ندعم عربي/إنجليزي + categoryId لو موجود
  const c = (data.categoryId || data.category || "").toString().trim().toLowerCase();
  return c === "cars" || c === "سيارات";
}

function carLine(data){
  const type = typeToAr(getTypeId(data));
  const model = getCarModel(data);
  const year  = getCarYear(data);

  const parts = [type, model, year].filter(Boolean);
  return parts.join(" • ");
}

/* ========================= */

export function initListings(){
  UI.actions.loadListings = loadListings;
  UI.actions.openDetails = openDetails;

  // ✅ زر مراسلة من صفحة التفاصيل
  UI.el.btnChat.onclick = () => {
    const l = UI.state.currentListing;
    if (!l) return;

    const me = auth.currentUser?.uid || "";
    const ownerId = l.ownerId || null;

    // ✅ إذا الإعلان إلك → افتح Inbox (مفلتر على هذا الإعلان)
    if (me && ownerId && me === ownerId) {
      if (typeof UI.actions.openInbox === "function") {
        return UI.actions.openInbox(l.id); // openInbox يدعم listingId كفلتر
      }
      return alert("Inbox غير جاهز بعد.");
    }

    // ✅ إذا مو إلك → افتح الشات مع صاحب الإعلان
    UI.actions.openChat(l.id, l.title || "إعلان", ownerId);
  };
}

/**
 * openDetails يدعم حالتين:
 * 1) openDetails(id, data) من الكارد (data موجود)
 * 2) openDetails(id, null, true) من رابط hash => يجلب الداتا من Firestore
 */
async function openDetails(id, data = null, fromHash = false){
  try{
    if (!data){
      const snap = await getDoc(doc(db, "listings", id));
      if (!snap.exists()) return alert("الإعلان غير موجود أو تم حذفه.");
      data = snap.data();
    }

    UI.state.currentListing = { id, ...data };

    // افتح صفحة التفاصيل كاملة (مو بطاقة تحت)
    UI.showDetailsPage();

    UI.renderGallery(data.images || []);
    UI.el.dTitle.textContent = data.title || "";
    UI.el.dMeta.textContent = `${data.city || ""} • ${data.category || ""}`;
    UI.el.dPrice.textContent = formatPrice(data.price, data.currency);
    UI.el.dDesc.textContent = data.description || "";

    // ثبّت رابط المشاركة (اختياري) عبر hash
    if (!fromHash){
      const newHash = `#listing=${encodeURIComponent(id)}`;
      if (location.hash !== newHash) history.replaceState(null, "", newHash);
    }
  }catch(e){
    alert(e?.message || "فشل فتح الإعلان");
  }
}

/**
 * ✅ بدون where() نهائياً => ما في Index
 * - نجيب آخر الإعلانات حسب createdAt
 * - نفلتر محلياً: isActive + keyword + (city/category عند تطبيق)
 */
async function loadListings(reset = true){
  if (reset){
    UI.el.listings.innerHTML = "";
    UI.state.lastDoc = null;
    UI.el.btnMore.disabled = false;
  }

  let qy = query(
    collection(db, "listings"),
    orderBy("createdAt", "desc"),
    limit(12)
  );

  if (UI.state.lastDoc){
    qy = query(
      collection(db, "listings"),
      orderBy("createdAt", "desc"),
      startAfter(UI.state.lastDoc),
      limit(12)
    );
  }

  const snap = await getDocs(qy);

  if (snap.docs.length){
    UI.state.lastDoc = snap.docs[snap.docs.length - 1];
  }else{
    if (!reset) UI.el.btnMore.disabled = true;
  }

  // فلاتر محلية
  const keyword = (UI.el.qSearch.value || "").trim().toLowerCase();

  const useFilters = !!UI.state.filtersActive;
  const cityVal = useFilters ? (UI.el.cityFilter.value || "") : "";
  const catVal  = useFilters ? (UI.el.catFilter.value || "") : "";

  snap.forEach(ds=>{
    const data = ds.data();

    // ✅ فقط الفعّال
    if (data.isActive === false) return;

    // ✅ فلترة مدينة/صنف فقط بعد "تطبيق"
    if (cityVal && data.city !== cityVal) return;
    if (catVal && data.category !== catVal) return;

    // ✅ كلمة البحث (عنوان/وصف)
    if (keyword){
      const t = String(data.title || "").toLowerCase();
      const d = String(data.description || "").toLowerCase();
      if (!t.includes(keyword) && !d.includes(keyword)) return;
    }

    const img = (data.images && data.images[0]) ? data.images[0] : "";

    // ✅ سطر سيارات
    const carMeta = isCarsCategory(data) ? carLine(data) : "";

    const card = document.createElement("div");
    card.className = "cardItem";
    card.innerHTML = `
      <img src="${img}" alt="" />
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>

        ${carMeta ? `<div class="carMeta">${escapeHtml(carMeta)}</div>` : ``}

        <div class="m">${escapeHtml(data.city||"")} • ${escapeHtml(data.category||"")}</div>
        <div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>
        <button class="secondary">عرض الإعلان</button>
      </div>
    `;

    // ✅ فتح التفاصيل عند الضغط على الصورة أو الزر
    card.querySelector("img").onclick = () => openDetails(ds.id, data);
    card.querySelector("button").onclick = () => openDetails(ds.id, data);

    UI.el.listings.appendChild(card);
  });

  UI.setEmptyState(UI.el.listings.children.length === 0);
}