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
  const catFilter = UI.el.catFilter;
  if (!catFilter) return;

  // إذا موجودين قبل لا نكرر
  if (document.getElementById("typeFilter")) return;

  const row = document.createElement("div");
  row.className = "filtersRow";
  row.innerHTML = `
    <select id="typeFilter">
      <option value="">كل الأنواع (بيع/إيجار)</option>
      <option value="sale">بيع</option>
      <option value="rent">إيجار</option>
    </select>

    <input id="yearFilter" type="number" min="1950" max="2035" placeholder="سنة (سيارات)" />

    <select id="estateKindFilter" class="hidden">
      <option value="">كل أنواع العقارات</option>
      <option value="شقة">شقة</option>
      <option value="محل">محل</option>
      <option value="أرض">أرض</option>
      <option value="بيت">بيت</option>
    </select>

    <input id="roomsFilter" class="hidden" type="number" min="0" max="20" placeholder="غرف (عقارات)" />
  `;

  // حطها تحت catFilter مباشرة
  catFilter.parentElement?.insertBefore(row, catFilter.nextSibling);

  // خزّنهم في UI.el لو حبيت
  UI.el.typeFilter = document.getElementById("typeFilter");
  UI.el.yearFilter = document.getElementById("yearFilter");
  UI.el.estateKindFilter = document.getElementById("estateKindFilter");
  UI.el.roomsFilter = document.getElementById("roomsFilter");

  const sync = () => {
    const cat = (UI.el.catFilter?.value || "").trim();

    // السنة فقط للسيارات
    if (UI.el.yearFilter){
      UI.el.yearFilter.style.display = (cat === "سيارات" || cat === "" ? "block" : "none");
    }

    // العقارات: نوع + غرف
    const showEstate = (cat === "عقارات");
    UI.el.estateKindFilter?.classList.toggle("hidden", !showEstate);
    UI.el.roomsFilter?.classList.toggle("hidden", !showEstate);
  };

  // أي تغيير على الفلاتر => إذا الفلاتر مفعّلة نحمّل فوراً
  const maybeReload = () => {
    if (UI.state.filtersActive) UI.actions.loadListings(true);
  };

  UI.el.catFilter?.addEventListener("change", () => { sync(); maybeReload(); });
  UI.el.typeFilter?.addEventListener("change", maybeReload);
  UI.el.yearFilter?.addEventListener("input", maybeReload);
  UI.el.estateKindFilter?.addEventListener("change", maybeReload);
  UI.el.roomsFilter?.addEventListener("input", maybeReload);

  sync();
}

/* ========================= */

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

  snap.forEach(ds=>{
    const data = ds.data();

    // ✅ فقط الفعّال
    if (data.isActive === false) return;

    // ✅ فلترة مدينة/صنف فقط بعد "تطبيق"
    if (cityVal && data.city !== cityVal) return;
    if (catVal && data.category !== catVal) return;

    // ✅ فلترة بيع/إيجار (للسيارات + العقارات فقط)
    if (typeVal){
      const t = getTypeId(data); // ممكن يكون sale/rent أو عربي
      const tNorm = (t === "بيع" ? "sale" : t === "إيجار" ? "rent" : t);
      if (isCarsCategory(data) || isEstateCategory(data)){
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
        const rr = Number(data.rooms || data.bedrooms || 0);
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
    card.querySelector("img").onclick = () => openDetails(ds.id, data);
    card.onclick = (e) => {
      // إذا ضغط على صورة رح يجي هون كمان، ما مشكلة
      // بس إذا كان داخل الكارد عناصر تانية لاحقاً منمنعها هنا
      openDetails(ds.id, data);
    };

    UI.el.listings.appendChild(card);
  });

  UI.setEmptyState(UI.el.listings.children.length === 0);
}