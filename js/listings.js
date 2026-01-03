import { db, auth } from "./firebase.js";
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
    UI.actions.openChat(UI.state.currentListing.id, UI.state.currentListing.title || "إعلان");
  };
}

function openAdd(){
  UI.resetOverlays();
  UI.show(UI.el.addBox);

  // لمسة ذكية: إذا الأصناف فاضية، نعرض تلميح
  try{
    const count = UI.el.aCat?.options?.length || 0;
    if (UI.el.catsHint){
      UI.el.catsHint.textContent =
        (count <= 1) ? "الأصناف فاضية… اضغط (تحديث الأصناف) أو أضف categories في Firestore." : "";
    }
  }catch{}

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
    UI.el.btnMore.disabled = false;
  }

  const wh = [ where("isActive","==", true) ];

  const city = UI.el.cityFilter.value || "";
  const cat  = UI.el.catFilter.value || "";
  if (city) wh.push(where("city","==", city));
  if (cat)  wh.push(where("category","==", cat));

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
  } else {
    // ما في المزيد
    if (!reset) UI.el.btnMore.disabled = true;
  }

  const keyword = (UI.el.qSearch.value || "").trim().toLowerCase();
  let addedNow = 0;

  snap.forEach(ds=>{
    const data = ds.data();

    // فلترة محلية للبحث (MVP)
    if (keyword){
      const t = String(data.title || "").toLowerCase();
      const d = String(data.description || "").toLowerCase();
      if (!t.includes(keyword) && !d.includes(keyword)) return;
    }

    const img = (data.images && data.images[0]) ? data.images[0] : "";
    const title = escapeHtml(data.title || "بدون عنوان");
    const meta  = `${escapeHtml(data.city||"")} • ${escapeHtml(data.category||"")}`;
    const price = escapeHtml(formatPrice(data.price, data.currency));

    const card = document.createElement("div");
    card.className = "cardItem";
    card.innerHTML = `
      <img src="${img}" alt="" />
      <div class="p">
        <div class="t">${title}</div>
        <div class="m">${meta}</div>
        <div class="pr">${price}</div>
        <button class="secondary" type="button">عرض</button>
      </div>
    `;

    card.querySelector("button").onclick = () => openDetails(ds.id, data);
    UI.el.listings.appendChild(card);
    addedNow++;
  });

  // Empty state
  const isEmpty = UI.el.listings.children.length === 0;
  UI.setEmptyState(isEmpty);

  // لو ما أضفنا ولا بطاقة بسبب البحث المحلي، وما في صفحات تانية، عطّل المزيد
  if (!addedNow && snap.docs.length === 0) UI.el.btnMore.disabled = true;
}