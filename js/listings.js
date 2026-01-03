import { db } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";
import {
  collection, getDocs, limit, orderBy, query, startAfter, where, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function initListings(){
  UI.actions.loadListings = loadListings;
  UI.actions.openAdd = openAdd;
  UI.actions.openListingPage = openListingPage;

  // chat
  UI.el.btnChat.onclick = () => {
    if (!UI.state.currentListing) return;
    UI.actions.openChat(UI.state.currentListing.id, UI.state.currentListing.title);
  };

  // share
  UI.el.btnShare.onclick = shareListing;

  // open fullscreen
  UI.el.gImg.onclick = () => openImageModal(UI.state.gallery.idx);

  // fullscreen modal
  UI.el.imgClose.onclick = () => UI.hide(UI.el.imgModal);
  UI.el.imgPrev.onclick = () => setFullIdx(fullIdx - 1);
  UI.el.imgNext.onclick = () => setFullIdx(fullIdx + 1);

  // Swipe support
  UI.el.imgFull.addEventListener("touchstart", (e)=>{
    touchStartX = e.changedTouches[0].screenX;
  }, { passive:true });

  UI.el.imgFull.addEventListener("touchend", (e)=>{
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  });

  // Router
  window.addEventListener("hashchange", handleRoute);
  handleRoute();
}

function openAdd(){
  UI.resetOverlays();
  UI.show(UI.el.addBox);
  UI.el.uploadStatus.textContent = "";
  UI.el.imgPreview.innerHTML = "";
}

function goToListing(id){
  location.hash = `#/listing/${id}`;
}

async function openListingPage(id){
  UI.resetOverlays();
  UI.show(UI.el.detailsPage);

  const ref = doc(db, "listings", id);
  const snap = await getDoc(ref);

  if (!snap.exists()){
    UI.state.currentListing = null;
    UI.renderGallery([]);
    UI.el.dTitle.textContent = "الإعلان غير موجود";
    UI.el.dMeta.textContent = "";
    UI.el.dPrice.textContent = "";
    UI.el.dDesc.textContent = "";
    return;
  }

  const data = snap.data();
  UI.state.currentListing = { id: snap.id, ...data };

  const imgs = normalizeImages(data.images);
  UI.renderGallery(imgs);

  UI.el.dTitle.textContent = data.title || "";
  UI.el.dMeta.textContent = `${data.city || ""} • ${data.category || ""}`;
  UI.el.dPrice.textContent = formatPrice(data.price, data.currency);
  UI.el.dDesc.textContent = data.description || "";
}

function handleRoute(){
  const h = location.hash || "";
  const m = h.match(/^#\/listing\/(.+)$/);
  if (m){
    openListingPage(m[1]);
    return;
  }
  UI.resetOverlays();
}

/* ===== Listings list ===== */
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

    const imgs = normalizeImages(data.images);
    const img = imgs[0] || "";

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

    card.querySelector("img").onclick = () => goToListing(ds.id);
    card.querySelector(".t").onclick = () => goToListing(ds.id);
    card.querySelector("button").onclick = () => goToListing(ds.id);

    UI.el.listings.appendChild(card);
  });

  UI.setEmptyState(UI.el.listings.children.length === 0);

  if (!snap.docs.length && !reset) UI.el.btnMore.disabled = true;
}

/* ===== Images normalize (support string or {url}) ===== */
function normalizeImages(images){
  if (!Array.isArray(images)) return [];
  return images.map(x => typeof x === "string" ? x : (x?.url || "")).filter(Boolean);
}

/* ===== Share ===== */
function shareListing(){
  const l = UI.state.currentListing;
  if (!l) return;

  const url = location.origin + location.pathname + `#/listing/${l.id}`;
  const text = `${l.title}\n${formatPrice(l.price, l.currency)}\n${url}`;

  if (navigator.share){
    navigator.share({ title: l.title, text, url }).catch(()=>{});
  }else{
    navigator.clipboard.writeText(url);
    alert("تم نسخ رابط الإعلان 📋");
  }
}

/* ===== Fullscreen images + swipe ===== */
let fullIdx = 0;
let touchStartX = 0;
let touchEndX = 0;

function openImageModal(idx=0){
  if (!UI.state.gallery.imgs.length) return;
  fullIdx = idx;
  UI.show(UI.el.imgModal);
  renderFull();
}

function setFullIdx(i){
  const n = UI.state.gallery.imgs.length;
  if (!n) return;
  fullIdx = (i + n) % n;
  renderFull();
}

function renderFull(){
  const n = UI.state.gallery.imgs.length;
  UI.el.imgFull.src = UI.state.gallery.imgs[fullIdx];
  UI.el.imgCounter.textContent = `${fullIdx+1} / ${n}`;
}

function handleSwipe(){
  const diff = touchEndX - touchStartX;
  if (Math.abs(diff) < 40) return;
  if (diff > 0) setFullIdx(fullIdx - 1);
  else setFullIdx(fullIdx + 1);
}