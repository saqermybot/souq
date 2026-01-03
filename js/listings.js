import { db } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";

import {
  collection,
  doc,
  getDoc,
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

async function openDetails(id, data=null, fromHash=false){
  // إذا جاي من قائمة وفيه data جاهز
  let listing = data;

  // إذا جاي من رابط أو data = null -> جيبها من Firestore
  if (!listing){
    const ref = doc(db, "listings", id);
    const snap = await getDoc(ref);
    if (!snap.exists()){
      alert("الإعلان غير موجود أو تم حذفه.");
      return;
    }
    listing = snap.data();
  }

  UI.state.currentListing = { id, ...listing };

  // افتح صفحة التفاصيل كاملة
  UI.showDetailsPage();

  UI.renderGallery(listing.images || []);
  UI.el.dTitle.textContent = listing.title || "";
  UI.el.dMeta.textContent = `${listing.city || ""} • ${listing.category || ""}`;
  UI.el.dPrice.textContent = formatPrice(listing.price, listing.currency);
  UI.el.dDesc.textContent = listing.description || "";

  // لو مش من hash، حط hash ليسهل مشاركة/رجعة
  if (!fromHash){
    history.replaceState(null, "", `#listing=${encodeURIComponent(id)}`);
  }
}

async function loadListings(reset=true){
  if (reset){
    UI.el.listings.innerHTML = "";
    UI.state.lastDoc = null;
    UI.el.btnMore.disabled = false;
  }

  // ✅ دائماً نظهر فقط الفعّالة
  const wh = [ where("isActive","==",true) ];

  // ✅ keyword search محلي
  const keyword = (UI.el.qSearch.value || "").trim().toLowerCase();

  // ✅ city/category filters فقط بعد Apply
  if (UI.state.filtersActive){
    if (UI.el.cityFilter.value) wh.push(where("city","==", UI.el.cityFilter.value));
    if (UI.el.catFilter.value) wh.push(where("category","==", UI.el.catFilter.value));
  }

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

  if (snap.docs.length){
    UI.state.lastDoc = snap.docs[snap.docs.length-1];
  }else{
    if (!reset) UI.el.btnMore.disabled = true;
  }

  snap.forEach(ds=>{
    const data = ds.data();

    // فلترة محلية بالكلمة
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
  });

  UI.setEmptyState(UI.el.listings.children.length === 0);
}