import { db } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";
import {
  collection, getDocs, limit, orderBy, query, startAfter, where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function initListings(){
  UI.actions.loadListings = loadListings;
  UI.actions.openAdd = openAdd;
  UI.actions.openDetails = openDetails;

  UI.el.btnChat.onclick = () => {
    if (!UI.state.currentListing) return;
    UI.actions.openChat(UI.state.currentListing.id, UI.state.currentListing.title);
  };
}

function openAdd(){
  UI.resetOverlays();
  UI.show(UI.el.addBox);
  UI.el.uploadStatus.textContent = "";
  UI.el.imgPreview.innerHTML = "";
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
  }

  const wh = [ where("isActive","==",true) ];
  if (UI.el.cityFilter.value) wh.push(where("city","==", UI.el.cityFilter.value));
  if (UI.el.catFilter.value) wh.push(where("category","==", UI.el.catFilter.value));

  let qy = query(collection(db,"listings"), ...wh, orderBy("createdAt","desc"), limit(10));
  if (UI.state.lastDoc){
    qy = query(collection(db,"listings"), ...wh, orderBy("createdAt","desc"), startAfter(UI.state.lastDoc), limit(10));
  }

  const snap = await getDocs(qy);
  if (snap.docs.length) UI.state.lastDoc = snap.docs[snap.docs.length-1];

  const keyword = (UI.el.qSearch.value || "").trim().toLowerCase();
  let added = 0;

  snap.forEach(ds=>{
    const data = ds.data();

    // فلترة محلية سريعة (MVP)
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
    added++;
  });

  // Empty state
  const isEmpty = UI.el.listings.children.length === 0;
  UI.setEmptyState(isEmpty);

  // إذا الصفحة كانت pagination وزاد صفر، خلي زر المزيد disabled
  if (!snap.docs.length && !reset) UI.el.btnMore.disabled = true;
  if (reset) UI.el.btnMore.disabled = false;
}