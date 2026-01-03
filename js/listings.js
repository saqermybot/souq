import { db } from "./firebase.js";
import { auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function initListings(){
  UI.actions.loadListings = loadListings;
  UI.actions.openDetails = openDetails;

  // زر مراسلة من صفحة التفاصيل
  UI.el.btnChat.onclick = () => {
    if (!UI.state.currentListing) return;
    UI.actions.openChat(UI.state.currentListing.id, UI.state.currentListing.title);
  };
}

function openDetails(id, data){
  UI.resetOverlays();
  UI.show(UI.el.details);

  UI.state.currentListing = { id, ...data };

  UI.renderGallery(data.images || []);
  UI.el.dTitle.textContent = data.title || "";
  UI.el.dMeta.textContent = `${data.city || ""} • ${data.category || ""}`;
  UI.el.dPrice.textContent = formatPrice(data.price, data.currency);
  UI.el.dDesc.textContent = data.description || "";
}

async function loadListings(reset=true){
  if (reset){
    UI.el.listings.innerHTML = "";
    UI.state.lastDoc = null;
    UI.el.btnMore.disabled = false;
  }

  // ✅ دائماً نظهر فقط الفعّالة
  const wh = [ where("isActive","==",true) ];

  // ✅ keyword search (محلي) — لا يحتاج apply
  const keyword = (UI.el.qSearch.value || "").trim().toLowerCase();

  // ✅ city/category filters فقط إذا المستخدم ضغط تطبيق (filtersActive=true)
  if (UI.state.filtersActive){
    if (UI.el.cityFilter.value) wh.push(where("city","==", UI.el.cityFilter.value));
    if (UI.el.catFilter.value) wh.push(where("category","==", UI.el.catFilter.value));
  }

  // ✅ Query أساسي (بدون فلاتر = يعرض الكل)
  let qy = query(
    collection(db,"listings"),
    ...wh,
    orderBy("createdAt","desc"),
    limit(10)
  );

  // pagination
  if (UI.state.lastDoc){
    qy = query(
      collection(db,"listings"),
      ...wh,
      orderBy("createdAt","desc"),
      startAfter(UI.state.lastDoc),
      limit(10)
    );
  }

  const snap = await getDocs(qy);

  if (snap.docs.length){
    UI.state.lastDoc = snap.docs[snap.docs.length-1];
  } else {
    // ما في صفحات إضافية
    if (!reset) UI.el.btnMore.disabled = true;
  }

  let added = 0;

  snap.forEach(ds=>{
    const data = ds.data();

    // ✅ فلترة محلية بالكلمة (عنوان/وصف) فقط إذا في كلمة بحث
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

  // Empty state
  UI.setEmptyState(UI.el.listings.children.length === 0);

  // لو reset وبعدين ما أضفنا شي بسبب فلترة keyword المحلية
  // نخلي زر المزيد شغال، لأن ممكن صفحات ثانية فيها نتائج
  // (ممكن لاحقاً نعمل بحث سيرفر-side أفضل)
}