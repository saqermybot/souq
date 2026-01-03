import { db } from "./firebase.js";
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

  // زر مراسلة داخل التفاصيل
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

  // شروط الاستعلام
  const wh = [ where("isActive","==",true) ];
  if (UI.el.cityFilter.value) wh.push(where("city","==", UI.el.cityFilter.value));
  if (UI.el.catFilter.value) wh.push(where("category","==", UI.el.catFilter.value));

  let qy = query(
    collection(db,"listings"),
    ...wh,
    orderBy("createdAt","desc"),
    limit(10)
  );

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

  // تحديث lastDoc للـ pagination
  if (snap.docs.length){
    UI.state.lastDoc = snap.docs[snap.docs.length-1];
  }

  // بحث محلي (MVP) بعد الجلب
  const keyword = (UI.el.qSearch.value || "").trim().toLowerCase();

  let addedThisBatch = 0;

  snap.forEach(ds=>{
    const data = ds.data();

    // فلترة محلية سريعة بالكلمة
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
        <button class="secondary">عرض</button>
      </div>
    `;

    card.querySelector("button").onclick = () => openDetails(ds.id, data);

    UI.el.listings.appendChild(card);
    addedThisBatch++;
  });

  // Empty state
  const isEmpty = UI.el.listings.children.length === 0;
  UI.setEmptyState(isEmpty);

  // لو ما رجع ولا نتيجة من فايرستور بهالدفعة: وقف زر المزيد
  if (!snap.docs.length && !reset){
    UI.el.btnMore.disabled = true;
  }

  // إذا رجع docs بس الفلترة المحلية شالتهم كلهم،
  // ما نوقف زر المزيد مباشرة، لأن ممكن الدفعة الجاية فيها نتائج
  // (بس إذا بدك، بعملها “أذكى” لاحقاً ببحث على السيرفر)
}