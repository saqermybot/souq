import { db } from "./firebase.js";
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

export function initListings(){
  UI.actions.loadListings = loadListings;
  UI.actions.openDetails = openDetails;

  // ✅ زر مراسلة من صفحة التفاصيل
  UI.el.btnChat.onclick = () => {
    const l = UI.state.currentListing;
    if (!l) return;

    // ✅ مرّر ownerId بشكل صريح حتى الشات يشتغل 100%
    UI.actions.openChat(l.id, l.title || "إعلان", l.ownerId || null);
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

  let added = 0;

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

    const card = document.createElement("div");
    card.className = "cardItem";
    card.innerHTML = `
      <img src="${img}" alt="" />
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>
        <div class="m">${escapeHtml(data.city||"")} • ${escapeHtml(data.category||"")}</div>
        <div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>
        <button class="secondary">عرض الإعلان</button>
      </div>
    `;

    // ✅ فتح التفاصيل عند الضغط على الصورة أو الزر
    card.querySelector("img").onclick = () => openDetails(ds.id, data);
    card.querySelector("button").onclick = () => openDetails(ds.id, data);

    UI.el.listings.appendChild(card);
    added++;
  });

  UI.setEmptyState(UI.el.listings.children.length === 0);

  // إذا ما أضفنا شي بسبب فلترة محلية، زر المزيد يبقى شغال لأنه ممكن الصفحة التالية فيها نتائج
  // (بس إذا ما في docs أصلاً سكّرناه فوق)
}