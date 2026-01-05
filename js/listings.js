// listings.js (تعديل: فلاتر سيارات/عقارات + سطر ميتا صغير + زر مراسلة يفتح Inbox إذا الإعلان إلك)

import { db, auth } from "./firebase.js";
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
  startAfter,
  deleteDoc
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
  return (data.car?.model ?? data.model ?? "").toString().trim();
}
function getCarYear(data){
  return (data.car?.year ?? data.year ?? "").toString().trim();
}
function getTypeId(data){
  return (data.typeId ?? data.car?.typeId ?? data.type ?? "").toString().trim();
}
function isCarsCategory(data){
  const c = (data.categoryId || data.category || "").toString().trim().toLowerCase();
  return c === "cars" || c === "سيارات";
}
function carLine(data){
  const type  = typeToAr(getTypeId(data));
  const model = getCarModel(data);
  const year  = getCarYear(data);
  const parts = [type, model, year].filter(Boolean);
  return parts.join(" • ");
}

// ---- Real Estate ----
function isEstateCategory(data){
  const c = (data.categoryId || data.category || "").toString().trim().toLowerCase();
  return c === "realestate" || c === "عقارات";
}
function getEstateKind(data){
  // ندعم أكثر من اسم
  return (data.estateKind ?? data.kind ?? data.subType ?? "").toString().trim();
}
function getRooms(data){
  const v = (data.rooms ?? data.bedrooms ?? "").toString().trim();
  // لو كانت 0 أو فاضية
  if (!v) return "";
  const n = Number(v);
  if (Number.isNaN(n) || n <= 0) return "";
  return String(n);
}
function estateLine(data){
  const type = typeToAr(getTypeId(data));
  const kind = getEstateKind(data);
  const rooms = getRooms(data);

  const roomsTxt = rooms ? `${rooms} غرف` : "";
  const parts = [type, kind, roomsTxt].filter(Boolean);
  return parts.join(" • ");
}

/* =========================
   ✅ Filters UI (إنشاء الفلاتر تلقائياً تحت catFilter)
   - type: بيع/إيجار
   - year: سنة (سيارات)
   - estateKind + rooms (عقارات)
========================= */


function ensureFilterControls(){
  // ✅ مراجع العناصر (موجودة بالـ HTML)
  UI.el.typeFilter = document.getElementById("typeFilter");
  UI.el.yearFilter = document.getElementById("yearFilter");
  UI.el.estateKindFilter = document.getElementById("estateKindFilter");
  UI.el.roomsFilter = document.getElementById("roomsFilter");

  UI.el.minPrice = document.getElementById("minPrice");
  UI.el.maxPrice = document.getElementById("maxPrice");
  UI.el.currencyFilter = document.getElementById("currencyFilter");
  UI.el.sortFilter = document.getElementById("sortFilter");

  // إذا ما في عناصر (نسخة قديمة) → لا تعطل الموقع
  if (!UI.el.catFilter) return;

  // ✅ عبّي السنوات (آخر 35 سنة تقريباً)
  if (UI.el.yearFilter && UI.el.yearFilter.options.length <= 1){
    const nowY = new Date().getFullYear();
    for (let y = nowY; y >= nowY - 35; y--){
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      UI.el.yearFilter.appendChild(opt);
    }
  }

  const sync = () => {
    const cat = (UI.el.catFilter?.value || "").trim();

    // السنة فقط للسيارات
    const showYear = (cat === "سيارات");
    if (UI.el.yearFilter) UI.el.yearFilter.style.display = showYear ? "block" : "none";

    // بيع/إيجار للسيارات + العقارات
    const showType = (cat === "سيارات" || cat === "عقارات" || cat === "");
    if (UI.el.typeFilter) UI.el.typeFilter.style.display = showType ? "block" : "none";

    // العقارات: نوع + غرف
    const showEstate = (cat === "عقارات");
    if (UI.el.estateKindFilter) UI.el.estateKindFilter.style.display = showEstate ? "block" : "none";
    if (UI.el.roomsFilter) UI.el.roomsFilter.style.display = showEstate ? "block" : "none";
  };

  const maybeReload = () => {
    // إذا الفلاتر مطبّقة → أي تغيير يعيد التحميل فوراً
    if (UI.state.filtersActive) UI.actions.loadListings(true);
  };

  UI.el.catFilter?.addEventListener("change", () => { sync(); maybeReload(); });

  // الفلاتر المتقدمة
  UI.el.typeFilter?.addEventListener("change", maybeReload);
  UI.el.yearFilter?.addEventListener("change", maybeReload);
  UI.el.estateKindFilter?.addEventListener("change", maybeReload);
  UI.el.roomsFilter?.addEventListener("change", maybeReload);

  UI.el.minPrice?.addEventListener("input", () => UI.state.filtersActive && maybeReload());
  UI.el.maxPrice?.addEventListener("input", () => UI.state.filtersActive && maybeReload());
  UI.el.currencyFilter?.addEventListener("change", maybeReload);
  UI.el.sortFilter?.addEventListener("change", maybeReload);

  sync();
}


export function initListings(){
  UI.actions.loadListings = loadListings;
  UI.actions.openDetails = openDetails;

  // ✅ حضّر فلاتر إضافية (بيع/إيجار/سنة/عقارات)
  ensureFilterControls();

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

    // ✅ زر الحذف يظهر فقط لصاحب الإعلان
    const me = auth.currentUser?.uid || "";
    const isMine = !!me && (data.ownerId === me);
    if (UI.el.btnDelete){
      UI.el.btnDelete.style.display = isMine ? "inline-flex" : "none";
      UI.el.btnDelete.onclick = async () => {
        if (!isMine) return;
        const ok = confirm("أكيد بدك تحذف هذا الإعلان نهائياً؟");
        if (!ok) return;
        try{
          await deleteDoc(doc(db, "listings", id));
          alert("تم حذف الإعلان ✅");
          UI.hide(UI.el.detailsPage);
          // ارجع للقائمة
          UI.actions.loadListings(true);
        }catch(e){
          alert(e?.message || "فشل حذف الإعلان");
        }
      };
    }


    UI.showDetailsPage();

    UI.renderGallery(data.images || []);
    UI.el.dTitle.textContent = data.title || "";
    UI.el.dMeta.textContent = `${data.city || ""} • ${data.category || ""}`;
    UI.el.dPrice.textContent = formatPrice(data.price, data.currency);
    UI.el.dDesc.textContent = data.description || "";

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
 * - نفلتر محلياً: isActive + keyword + (city/category/type/year/estateKind/rooms بعد تطبيق)
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

  const typeVal = useFilters ? ((UI.el.typeFilter?.value || "").trim()) : "";     // sale / rent
  const yearVal = useFilters ? ((UI.el.yearFilter?.value || "").toString().trim()) : ""; // سيارات

  const estateKindVal = useFilters ? ((UI.el.estateKindFilter?.value || "").trim()) : "";
  const roomsVal = useFilters ? Number(UI.el.roomsFilter?.value || 0) : 0;

  const minPriceVal = useFilters ? Number(UI.el.minPrice?.value || 0) : 0;
  const maxPriceVal = useFilters ? Number(UI.el.maxPrice?.value || 0) : 0;
  const currencyVal = useFilters ? ((UI.el.currencyFilter?.value || "").trim()) : "";
  const sortVal = useFilters ? ((UI.el.sortFilter?.value || "new").trim()) : "new";

  const rows = [];

  snap.forEach(ds=>{
    const data = ds.data();

    // ✅ فقط الفعّال
    if (data.isActive === false) return;

    // ✅ فلترة مدينة/صنف فقط بعد "تطبيق"
    if (cityVal && data.city !== cityVal) return;
    if (catVal && data.category !== catVal) return;

    // ✅ فلترة عملة + سعر
    if (currencyVal && (data.currency || "") !== currencyVal) return;

    const pNum = Number(data.price || 0);
    if (minPriceVal && pNum < minPriceVal) return;
    if (maxPriceVal && pNum > maxPriceVal) return;

    // ✅ فلترة بيع/إيجار (للسيارات + العقارات فقط)
    if (typeVal && (isCarsCategory(data) || isEstateCategory(data))){
      const t = getTypeId(data);
      if (t){
        const tNorm = (t === "بيع" ? "sale" : t === "ايجار" ? "rent" : t);
        if (tNorm !== typeVal) return;
      }
    }

    // ✅ فلترة سيارات: سنة
    if (yearVal && isCarsCategory(data)){
      const y = getCarYear(data);
      if (String(y) !== String(yearVal)) return;
    }

    // ✅ فلترة عقارات: نوع + غرف
    if (isEstateCategory(data)){
      if (estateKindVal){
        const k = getEstateKind(data);
        if (k !== estateKindVal) return;
      }
      if (roomsVal){
        const r = getEstateRooms(data);
        if (!r || Number(r) < roomsVal) return;
      }
    }

    // ✅ كلمة البحث (دايماً شغالة)
    const q = (UI.el.qSearch?.value || "").trim();
    if (q){
      const hay = `${data.title||""} ${data.description||""} ${data.city||""} ${data.category||""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return;
    }

    rows.push({ id: ds.id, data });
  });

  // ✅ ترتيب (السعر فقط إذا مختار عملة حتى ما نخرب المقارنة)
  if (currencyVal && (sortVal === "priceAsc" || sortVal === "priceDesc")){
    rows.sort((a,b)=>{
      const pa = Number(a.data.price || 0);
      const pb = Number(b.data.price || 0);
      return sortVal === "priceAsc" ? (pa - pb) : (pb - pa);
    });
  }

  rows.forEach(({id, data})=>{
    const img = (data.images && data.images[0]) ? data.images[0] : "https://placehold.co/600x400?text=Souq+Syria";
    const carMeta = isCarsCategory(data) ? carLine(data) : "";
    const estMeta = isEstateCategory(data) ? estateLine(data) : "";
    const extraMeta = carMeta || estMeta;

    const card = document.createElement("div");
    card.className = "cardItem";
    card.innerHTML = `
      <img src="${img}" alt="" />
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>

        ${extraMeta ? `<div class="carMeta">${escapeHtml(extraMeta)}</div>` : ``}

        <div class="m">${escapeHtml(data.city||"")} • ${escapeHtml(data.category||"")}</div>
        <div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>
      </div>
    `;

    // ✅ فتح التفاصيل عند الضغط على الصورة أو كامل الكارد (بدون زر)
    card.querySelector("img").onclick = () => openDetails(id, data);
    card.onclick = () => openDetails(id, data);

    UI.el.listings.appendChild(card);
  });

  UI.setEmptyState(UI.el.listings.children.length === 0);

}