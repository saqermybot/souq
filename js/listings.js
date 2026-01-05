// listings.js (Deluxe: يدعم typeFilter hidden + yearFrom/yearTo + عقارات + ميتا سطر + زر مراسلة يفتح Inbox إذا الإعلان إلك)

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
   ✅ Helpers (بيع/إيجار + سيارات + عقارات)
========================= */

function typeToAr(typeId){
  if (typeId === "sale") return "بيع";
  if (typeId === "rent") return "إيجار";
  if (typeId === "بيع") return "بيع";
  if (typeId === "إيجار") return "إيجار";
  return "";
}

// ---- Cars ----
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
function getTypeId(data){
  return (data.typeId ?? data.car?.typeId ?? data.estate?.typeId ?? data.type ?? "").toString().trim();
}
function normalizeTypeId(t){
  // ندعم عربي/انجليزي
  if (t === "بيع") return "sale";
  if (t === "إيجار") return "rent";
  return t; // sale/rent/...
}
function isCarsCategory(data){
  const c = (data.categoryId || data.category || "").toString().trim().toLowerCase();
  return c === "cars" || c === "سيارات";
}
function carLine(data){
  const type  = typeToAr(getTypeId(data));
  const model = getCarModel(data);
  const year  = getCarYearRaw(data);
  const parts = [type, model, year].filter(Boolean);
  return parts.join(" • ");
}

// ---- Real Estate ----
function isEstateCategory(data){
  const c = (data.categoryId || data.category || "").toString().trim().toLowerCase();
  return c === "realestate" || c === "عقارات";
}
function getEstateKind(data){
  return (data.estate?.kind ?? data.estateKind ?? data.kind ?? data.subType ?? "").toString().trim();
}
function getRoomsNum(data){
  const v = (data.estate?.rooms ?? data.rooms ?? data.bedrooms ?? "").toString().trim();
  if (!v) return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}
function estateLine(data){
  const type = typeToAr(getTypeId(data));
  const kind = getEstateKind(data);
  const rooms = getRoomsNum(data);

  const roomsTxt = rooms ? `${rooms} غرف` : "";
  const parts = [type, kind, roomsTxt].filter(Boolean);
  return parts.join(" • ");
}

/* =========================
   ✅ Read filters (DELUXE IDs)
   - typeFilter (hidden) or legacy select
   - yearFrom/yearTo (range) or legacy yearFilter
========================= */

function $id(id){ return document.getElementById(id); }

function readTypeFilter(){
  // الجديد: hidden input (typeFilter)
  const hidden = $id("typeFilter");
  if (hidden && typeof hidden.value === "string") return hidden.value.trim();

  // القديم: select injected
  const legacy = UI.el.typeFilter || $id("typeFilter");
  if (legacy && typeof legacy.value === "string") return legacy.value.trim();

  return "";
}

function readYearRange(){
  // الجديد
  const yf = Number(($id("yearFrom")?.value || "").trim() || 0) || 0;
  const yt = Number(($id("yearTo")?.value || "").trim() || 0) || 0;

  if (yf || yt) return { from: yf, to: yt };

  // القديم: yearFilter (سنة واحدة)
  const legacy = (UI.el.yearFilter || $id("yearFilter"))?.value || "";
  const y = Number(String(legacy).trim() || 0) || 0;
  if (y) return { from: y, to: y };

  return { from: 0, to: 0 };
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
        return UI.actions.openInbox(l.id);
      }
      return alert("Inbox غير جاهز بعد.");
    }

    // ✅ إذا مو إلك → افتح الشات مع صاحب الإعلان
    UI.actions.openChat(l.id, l.title || "إعلان", ownerId);
  };

  // ✅ زر حذف الإعلان (يظهر فقط للمالك)
  if (UI.el.btnDeleteListing){
    UI.el.btnDeleteListing.onclick = () => deleteCurrentListing();
  }
}

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

    if (UI.el.btnDeleteListing) UI.el.btnDeleteListing.disabled = true;

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

    UI.showDetailsPage();

    UI.renderGallery(data.images || []);
    UI.el.dTitle.textContent = data.title || "";

    // ✅ الميتا: مدينة + صنف + (سطر إضافي للسيارات/عقارات إذا موجود)
    const baseMeta = `${data.city || ""} • ${data.category || data.categoryNameAr || data.categoryId || ""}`.trim();
    const extraMeta = isCarsCategory(data) ? carLine(data) : isEstateCategory(data) ? estateLine(data) : "";
    UI.el.dMeta.textContent = extraMeta ? `${baseMeta} • ${extraMeta}` : baseMeta;

    UI.el.dPrice.textContent = formatPrice(data.price, data.currency);
    UI.el.dDesc.textContent = data.description || "";

    // ✅ إظهار زر الحذف فقط للمالك
    const me = auth.currentUser?.uid || "";
    const isOwner = !!(me && data.ownerId && me === data.ownerId);
    if (UI.el.btnDeleteListing){
      UI.el.btnDeleteListing.classList.toggle("hidden", !isOwner);
      UI.el.btnDeleteListing.disabled = false;
    }

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
 * - نفلتر محلياً: isActive + keyword + (city/category/type/year range/estateKind/rooms بعد تطبيق)
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

  // ✅ فلاتر محلية
  const keyword = (UI.el.qSearch.value || "").trim().toLowerCase();
  const useFilters = !!UI.state.filtersActive;

  const cityVal = useFilters ? (UI.el.cityFilter.value || "") : "";
  const catVal  = useFilters ? (UI.el.catFilter.value || "") : "";

  const typeVal = useFilters ? readTypeFilter() : ""; // sale/rent
  const { from: yearFrom, to: yearTo } = useFilters ? readYearRange() : { from: 0, to: 0 };

  const estateKindVal = useFilters ? ((UI.el.estateKindFilter?.value || "").trim()) : "";
  const roomsVal = useFilters ? Number(UI.el.roomsFilter?.value || 0) : 0;

  snap.forEach(ds=>{
    const data = ds.data();

    // ✅ فقط الفعّال
    if (data.isActive === false) return;

    // ✅ فلترة مدينة/صنف فقط بعد "تطبيق"
    if (cityVal && data.city !== cityVal) return;

    // catVal هو عربي (مثلاً "سيارات") عندك حالياً
    if (catVal){
      const catData = (data.category || data.categoryNameAr || "").toString().trim();
      if (catData !== catVal) return;
    }

    // ✅ فلترة بيع/إيجار (للسيارات + العقارات فقط)
    if (typeVal){
      const t = normalizeTypeId(getTypeId(data));
      if (isCarsCategory(data) || isEstateCategory(data)){
        if (t !== typeVal) return;
      }
    }

    // ✅ فلترة سيارات: سنة range
    if ((yearFrom || yearTo) && isCarsCategory(data)){
      const y = getCarYearNum(data);
      if (!y) return;

      if (yearFrom && y < yearFrom) return;
      if (yearTo && y > yearTo) return;
    }

    // ✅ فلترة عقارات: نوع + غرف (إذا عناصر legacy موجودة)
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

    // ✅ كلمة البحث (عنوان/وصف)
    if (keyword){
      const t = String(data.title || "").toLowerCase();
      const d = String(data.description || "").toLowerCase();
      if (!t.includes(keyword) && !d.includes(keyword)) return;
    }

    const img = (data.images && data.images[0]) ? data.images[0] : "";

    // ✅ سطر ميتا صغير حسب الصنف
    const carMeta = isCarsCategory(data) ? carLine(data) : "";
    const estMeta = isEstateCategory(data) ? estateLine(data) : "";
    const extraMeta = carMeta || estMeta;

    const cityTxt = escapeHtml(data.city || "");
    const catTxt  = escapeHtml(data.category || data.categoryNameAr || data.categoryId || "");

    const card = document.createElement("div");
    card.className = "cardItem";
    card.innerHTML = `
      <img src="${img}" alt="" />
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>

        ${extraMeta ? `<div class="carMeta">${escapeHtml(extraMeta)}</div>` : ``}

        <div class="m">${cityTxt}${(cityTxt && catTxt) ? " • " : ""}${catTxt}</div>
        <div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>
      </div>
    `;

    // ✅ منع فتح التفاصيل مرتين (img + card)
    const imgEl = card.querySelector("img");
    if (imgEl){
      imgEl.onclick = (e) => { e.stopPropagation(); openDetails(ds.id, data); };
    }
    card.onclick = () => openDetails(ds.id, data);

    UI.el.listings.appendChild(card);
  });

  UI.setEmptyState(UI.el.listings.children.length === 0);
}