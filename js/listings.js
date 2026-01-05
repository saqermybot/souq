// listings.js (Deluxe: typeFilter hidden + yearFrom/yearTo + عقارات + ميتا + مراسلة/Inbox)
// ✅ مهم: ربط الفلاتر صار حصراً في ui.js لمنع التكرار (listeners duplicated)

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";

import {
  collection,
  getDoc,
  getDocs,
  doc,
  deleteDoc,
  limit,
  orderBy,
  query,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   ✅ Helpers
========================= */

function $id(id){ return document.getElementById(id); }

function typeToAr(typeId){
  if (typeId === "sale") return "بيع";
  if (typeId === "rent") return "إيجار";
  if (typeId === "بيع") return "بيع";
  if (typeId === "إيجار") return "إيجار";
  return "";
}

function normalizeTypeId(t){
  if (t === "بيع") return "sale";
  if (t === "إيجار") return "rent";
  return (t || "").toString().trim();
}

function normalizeCat(v){
  const s = (v || "").toString().trim().toLowerCase();
  if (!s) return "";
  if (s === "سيارات") return "cars";
  if (s === "عقارات") return "realestate";
  if (s === "إلكترونيات" || s === "الكترونيات") return "electronics";
  return s; // cars/realestate/electronics/...
}

function getCatId(data){
  // نخليها مرنة: categoryId (الأفضل) ثم categoryNameAr ثم category
  const raw = data.categoryId || data.categoryNameAr || data.category || "";
  return normalizeCat(raw);
}

function getTypeId(data){
  return (data.typeId ?? data.car?.typeId ?? data.estate?.typeId ?? data.type ?? "").toString().trim();
}

// ---- Cars ----
function isCarsCategory(data){ return getCatId(data) === "cars"; }

function getCarModel(data){
  return (data.car?.model ?? data.carModel ?? data.model ?? "").toString().trim();
}
function getCarYearRaw(data){
  return (data.car?.year ?? data.carYear ?? data.year ?? "").toString().trim();
}
function getCarYearNum(data){
  const y = Number(getCarYearRaw(data) || 0);
  return Number.isFinite(y) && y > 0 ? y : 0;
}
function carLine(data){
  const type  = typeToAr(getTypeId(data));
  const model = getCarModel(data);
  const year  = getCarYearRaw(data);
  return [type, model, year].filter(Boolean).join(" • ");
}

// ---- Real Estate ----
function isEstateCategory(data){ return getCatId(data) === "realestate"; }

function getEstateKind(data){
  return (data.estate?.kind ?? data.estateKind ?? data.kind ?? data.subType ?? "").toString().trim();
}
function getRoomsNum(data){
  const v = (data.estate?.rooms ?? data.rooms ?? data.bedrooms ?? "").toString().trim();
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function estateLine(data){
  const type = typeToAr(getTypeId(data));
  const kind = getEstateKind(data);
  const rooms = getRoomsNum(data);
  const roomsTxt = rooms ? `${rooms} غرف` : "";
  return [type, kind, roomsTxt].filter(Boolean).join(" • ");
}

// ✅ NEW: seller display helpers
function getSellerName(data){
  const n = (data?.sellerName || "").toString().trim();
  if (n) return n;

  const em = (data?.sellerEmail || "").toString().trim();
  if (em && em.includes("@")) return em.split("@")[0];

  // fallback بسيط
  return "صاحب الإعلان";
}

function getSellerUid(data){
  return (data?.ownerId || data?.uid || "").toString().trim();
}

function buildStoreUrl(uid){
  return `store.html?u=${encodeURIComponent(uid)}`;
}

/* =========================
   ✅ Filters (قراءة فقط - الربط في ui.js)
========================= */

function readTypeFilter(){
  // hidden input in HTML
  const hidden = $id("typeFilter");
  if (hidden && typeof hidden.value === "string") return hidden.value.trim();

  // fallback (لو في نسخة قديمة)
  return (UI.el.typeFilter?.value || "").toString().trim();
}

function readYearRange(){
  const yf = Number(($id("yearFrom")?.value || "").toString().trim() || 0) || 0;
  const yt = Number(($id("yearTo")?.value || "").toString().trim() || 0) || 0;

  if (yf && yt && yf > yt) return { from: yt, to: yf };
  return { from: yf, to: yt };
}

/* =========================
   ✅ INIT
========================= */

export function initListings(){
  UI.actions.loadListings = loadListings;
  UI.actions.openDetails = openDetails;

  // ✅ ممنوع نربط فلاتر هنا (لأن ui.js بيربطها) => منع تكرار و double load

  // ✅ زر مراسلة من صفحة التفاصيل
  UI.el.btnChat.onclick = () => {
    const l = UI.state.currentListing;
    if (!l) return;

    const me = auth.currentUser?.uid || "";
    const ownerId = l.ownerId || "";

    // إذا الإعلان إلك -> افتح Inbox
    if (me && ownerId && me === ownerId) {
      if (typeof UI.actions.openInbox === "function") return UI.actions.openInbox(l.id);
      return alert("Inbox غير جاهز بعد.");
    }

    // إذا مو إلك -> افتح الشات
    UI.actions.openChat(l.id, l.title || "إعلان", ownerId);
  };

  // ✅ زر حذف الإعلان
  if (UI.el.btnDeleteListing){
    UI.el.btnDeleteListing.onclick = () => deleteCurrentListing();
  }
}

/* =========================
   ✅ Delete
========================= */

async function deleteCurrentListing(){
  try{
    const l = UI.state.currentListing;
    if (!l) return;

    const me = auth.currentUser?.uid || "";
    const ownerId = l.ownerId || "";

    if (!me) return alert("يجب تسجيل الدخول أولاً");
    if (!ownerId || ownerId !== me) return alert("لا يمكنك حذف هذا الإعلان");

    const ok = confirm("هل أنت متأكد أنك تريد حذف الإعلان نهائياً؟");
    if (!ok) return;

    UI.el.btnDeleteListing.disabled = true;

    await deleteDoc(doc(db, "listings", l.id));

    UI.hideDetailsPage();
    UI.state.currentListing = null;
    await UI.actions.loadListings(true);

    alert("تم حذف الإعلان ✅");
  }catch(e){
    alert(e?.message || "فشل حذف الإعلان");
  }finally{
    if (UI.el.btnDeleteListing) UI.el.btnDeleteListing.disabled = false;
  }
}

/* =========================
   ✅ Details
========================= */

async function openDetails(id, data = null, fromHash = false){
  try{
    if (!data){
      const snap = await getDoc(doc(db, "listings", id));
      if (!snap.exists()) return alert("الإعلان غير موجود أو تم حذفه.");
      data = snap.data();
    }

    UI.state.currentListing = { id, ...data };
    UI.showDetailsPage();

    UI.renderGallery(data.images || []);
    UI.el.dTitle.textContent = data.title || "";

    const catTxt = (data.category || data.categoryNameAr || data.categoryId || "").toString().trim();
    const baseMeta = `${data.city || ""}${(data.city && catTxt) ? " • " : ""}${catTxt}`.trim();

    const extraMeta =
      isCarsCategory(data) ? carLine(data) :
      isEstateCategory(data) ? estateLine(data) :
      "";

    UI.el.dMeta.textContent = extraMeta ? `${baseMeta} • ${extraMeta}` : baseMeta;

    UI.el.dPrice.textContent = formatPrice(data.price, data.currency);
    UI.el.dDesc.textContent = data.description || "";

    // زر الحذف فقط للمالك
    const me = auth.currentUser?.uid || "";
    const isOwner = !!(me && data.ownerId && me === data.ownerId);
    UI.el.btnDeleteListing?.classList.toggle("hidden", !isOwner);
    if (UI.el.btnDeleteListing) UI.el.btnDeleteListing.disabled = false;

    if (!fromHash){
      const newHash = `#listing=${encodeURIComponent(id)}`;
      if (location.hash !== newHash) history.replaceState(null, "", newHash);
    }
  }catch(e){
    alert(e?.message || "فشل فتح الإعلان");
  }
}

/* =========================
   ✅ Load listings (no where/index)
   ✅ Sequence Guard لمنع السباق والتكرار
========================= */

let _loadSeq = 0;

async function loadListings(reset = true){
  const mySeq = ++_loadSeq;

  if (reset){
    UI.el.listings.innerHTML = "";
    UI.state.lastDoc = null;
    UI.el.btnMore.disabled = false;
  }

  let qy = query(collection(db, "listings"), orderBy("createdAt", "desc"), limit(12));

  if (UI.state.lastDoc){
    qy = query(collection(db, "listings"), orderBy("createdAt", "desc"), startAfter(UI.state.lastDoc), limit(12));
  }

  const snap = await getDocs(qy);

  // ✅ لو صار طلب أحدث أثناء انتظار هذا الطلب
  if (mySeq !== _loadSeq) return;

  if (snap.docs.length){
    UI.state.lastDoc = snap.docs[snap.docs.length - 1];
  }else{
    if (!reset) UI.el.btnMore.disabled = true;
  }

  const keyword = (UI.el.qSearch.value || "").trim().toLowerCase();
  const useFilters = !!UI.state.filtersActive;

  const cityVal = useFilters ? (UI.el.cityFilter.value || "") : "";
  const catVal  = useFilters ? normalizeCat(UI.el.catFilter.value || "") : "";

  const typeVal = useFilters ? readTypeFilter() : ""; // "" | sale | rent
  const { from: yearFrom, to: yearTo } = useFilters ? readYearRange() : { from: 0, to: 0 };

  const estateKindVal = useFilters ? (($id("estateKindFilter")?.value || "").toString().trim()) : "";
  const roomsVal = useFilters ? Number(($id("roomsFilter")?.value || "").toString().trim() || 0) : 0;

  snap.forEach(ds=>{
    const data = ds.data();

    // فقط الفعّال
    if (data.isActive === false) return;

    // city/category فقط بعد Apply
    if (cityVal && data.city !== cityVal) return;

    if (catVal){
      const docCat = getCatId(data);
      if (docCat !== catVal) return;
    }

    // type (cars/estate فقط)
    if (typeVal){
      const t = normalizeTypeId(getTypeId(data));
      if ((isCarsCategory(data) || isEstateCategory(data)) && t !== typeVal) return;
    }

    // car year range
    if ((yearFrom || yearTo) && isCarsCategory(data)){
      const y = getCarYearNum(data);
      if (!y) return;
      if (yearFrom && y < yearFrom) return;
      if (yearTo && y > yearTo) return;
    }

    // estate filters
    if (isEstateCategory(data)){
      if (estateKindVal){
        const k = getEstateKind(data);
        if (k !== estateKindVal) return;
      }
      if (roomsVal){
        const rr = getRoomsNum(data);
        if (rr !== roomsVal) return;
      }
    }

    // keyword
    if (keyword){
      const t = String(data.title || "").toLowerCase();
      const d = String(data.description || "").toLowerCase();
      if (!t.includes(keyword) && !d.includes(keyword)) return;
    }

    const img = (data.images && data.images[0]) ? data.images[0] : "";

    const extraMeta =
      isCarsCategory(data) ? carLine(data) :
      isEstateCategory(data) ? estateLine(data) :
      "";

    const cityTxt = escapeHtml(data.city || "");
    const catTxt  = escapeHtml(data.category || data.categoryNameAr || data.categoryId || "");

    // ✅ NEW: seller link
    const sellerUid = getSellerUid(data);
    const sellerName = escapeHtml(getSellerName(data));
    const sellerHtml = sellerUid
      ? `<div class="sellerLine">البائع: <a class="sellerLink" href="${buildStoreUrl(sellerUid)}">${sellerName}</a></div>`
      : `<div class="sellerLine">البائع: <span class="sellerName">${sellerName}</span></div>`;

    const card = document.createElement("div");
    card.className = "cardItem";
    card.innerHTML = `
      <img src="${img}" alt="" />
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>

        ${extraMeta ? `<div class="carMeta">${escapeHtml(extraMeta)}</div>` : ``}

        <div class="m">${cityTxt}${(cityTxt && catTxt) ? " • " : ""}${catTxt}</div>

        ${sellerHtml}

        <div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>
      </div>
    `;

    const imgEl = card.querySelector("img");
    if (imgEl){
      imgEl.onclick = (e) => { e.stopPropagation(); openDetails(ds.id, data); };
    }

    // ✅ prevent card click when clicking seller link
    const sellerLinkEl = card.querySelector(".sellerLink");
    if (sellerLinkEl){
      sellerLinkEl.addEventListener("click", (e) => {
        e.stopPropagation();
        // اترك المتصفح يفتح الرابط طبيعي
      });
    }

    card.onclick = () => openDetails(ds.id, data);

    UI.el.listings.appendChild(card);
  });

  UI.setEmptyState(UI.el.listings.children.length === 0);
}