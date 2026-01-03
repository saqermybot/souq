import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";

import {
  collection, getDocs, limit, orderBy, query, startAfter, where, doc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function initListings(){
  UI.actions.loadListings = loadListings;
  UI.actions.openAdd = openAdd;
  UI.actions.openDetails = openDetails;

  UI.el.btnChat.onclick = () => {
    if (!UI.state.currentListing) return;
    UI.actions.openChat(UI.state.currentListing.id, UI.state.currentListing.title);
  };

  UI.el.btnDelete.onclick = async () => {
    const listing = UI.state.currentListing;
    if (!listing) return;

    const ok = confirm("⚠️ هل أنت متأكد من حذف الإعلان؟");
    if (!ok) return;

    try{
      await deleteDoc(doc(db, "listings", listing.id));
      alert("تم حذف الإعلان ✅ (وسيتم حذف الصور تلقائياً)");
      UI.hide(UI.el.details);
      await UI.actions.loadListings(true);
    }catch(e){
      alert(e?.message || "فشل حذف الإعلان");
    }
  };
}

function openAdd(){
  UI.resetOverlays();
  UI.show(UI.el.addBox);
  UI.el.uploadStatus.textContent = "";
  UI.el.imgPreview.innerHTML = "";
}

// ✅ استخراج رابط الصورة من الشكل الجديد/القديم
function firstImageUrl(data){
  if (!data.images || !Array.isArray(data.images) || !data.images.length) return "";
  const x = data.images[0];
  if (typeof x === "string") return x;        // قديم
  return x?.url || "";                        // جديد
}

function allImageUrls(data){
  if (!data.images || !Array.isArray(data.images)) return [];
  return data.images.map(x => typeof x === "string" ? x : (x?.url || "")).filter(Boolean);
}

function openDetails(id, data){
  UI.resetOverlays();
  UI.show(UI.el.details);

  UI.state.currentListing = { id, ...data };

  UI.renderGallery(allImageUrls(data));
  UI.el.dTitle.textContent = data.title || "";
  UI.el.dMeta.textContent = `${data.city || ""} • ${data.category || ""}`;
  UI.el.dPrice.textContent = formatPrice(data.price, data.currency);
  UI.el.dDesc.textContent = data.description || "";

  if (auth.currentUser && auth.currentUser.uid === data.ownerId){
    UI.show(UI.el.btnDelete);
  } else {
    UI.hide(UI.el.btnDelete);
  }
}

async function loadListings(reset=true){
  if (reset){
    UI.el.listings.innerHTML = "";
    UI.state.lastDoc = null;
    UI.el.btnMore.disabled = false;
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

  snap.forEach(ds=>{
    const data = ds.data();

    if (keyword){
      const t = String(data.title || "").toLowerCase();
      const d = String(data.description || "").toLowerCase();
      if (!t.includes(keyword) && !d.includes(keyword)) return;
    }

    const img = firstImageUrl(data);

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

    // ✅ فتح التفاصيل عند الضغط على الكرت أو زر عرض
    card.onclick = (e) => {
      // إذا ضغط زر "عرض" أو أي مكان من الكرت نفس النتيجة
      openDetails(ds.id, data);
    };

    UI.el.listings.appendChild(card);
  });

  UI.setEmptyState(UI.el.listings.children.length === 0);
  if (!snap.docs.length && !reset) UI.el.btnMore.disabled = true;
}