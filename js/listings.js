 
// listings.js (Deluxe: typeFilter hidden + yearFrom/yearTo + عقارات + ميتا + مراسلة/Inbox + WhatsApp + Report)

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";
import { getFavoriteSet, toggleFavorite, bumpViewCount, getListingStats, requireUserForFav } from "./favorites.js";
import { ADMIN_UIDS, ADMIN_EMAILS } from "./config.js";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// =========================
// Location helpers (approx + distance)
// =========================
function readMyLoc(){
  try {
    const raw = localStorage.getItem("my_loc");
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j.lat !== "number" || typeof j.lng !== "number") return null;
    return j;
  } catch { return null; }
}

function getPlaceLabel(data){
  try{
    const t = String(data?.placeText || "").trim();
    if (t) return t;
    const l = data?.location && data.location.label ? String(data.location.label).trim() : "";
    if (l) return l;
    const c = String(data?.city || "").trim();
    return c;
  }catch{
    return "";
  }
}

// ✅ Avoid duplicate location like "دمشق دمشق" on cards.
// We show the full place (city - area) once with the pin.
// The small meta line shows the city only when it's different from the full place label.
function getCityLabel(data){
  try{
    let c = String(data?.city || "").trim();
    const p = getPlaceLabel(data);

    // If city is missing, derive it from place label (before dash/comma)
    if (!c && p) c = (p.split(/[-–—,،]/)[0] || "").trim();

    // If legacy data stored the full place inside `city`, normalize it
    if (c && p && c.includes("-") && p && !p.includes("-") ){
      // keep as-is; not enough info
    }
    if (c && c.includes("-") ){
      c = (c.split(/[-–—,،]/)[0] || "").trim();
    }
    return c;
  }catch{
    return "";
  }
}

function getCardLocationParts(data){
  const place = String(getPlaceLabel(data) || "").trim();
  const city  = String(getCityLabel(data) || "").trim();
  const showCityInMeta = !!(city && place && city !== place);
  return { place, city, showCityInMeta };
}

function kmBetween(lat1, lng1, lat2, lng2){
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function prettyDistanceAr(km){
  if (!isFinite(km)) return "";
  if (km < 1) return `${Math.round(km*1000)} م`;
  if (km < 10) return `${km.toFixed(1)} كم`;
  return `${Math.round(km)} كم`;
}

function getDistanceTextForListing(listing){
  const my = readMyLoc();
  const loc = listing?.location;
  if (!my || !loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return "";
  const km = kmBetween(my.lat, my.lng, loc.lat, loc.lng);
  const dist = prettyDistanceAr(km);
  return dist ? `يبعد عنك ${dist}` : "";
}

// ✅ Performance tuning
const LIST_PAGE_SIZE = 12;
const FAV_PAGE_SIZE = 30;

// ✅ Stats cache (favCount + viewCount) so numbers don't jump up/down
// We never update listings/{id} counters; all counters live in listingStats/{listingId}.
// Cache is filled lazily for rendered cards only (page size ≈ 12) to keep reads low.
//
// Important:
// - We protect against race conditions:
//   A slow `getListingStats()` response should NOT overwrite a newer value that
//   came from a user action (like/unlike or open-details view bump).
const STATS_CACHE = new Map(); // listingId -> { favCount, viewCount, _ts }

async function getStatsCached(listingId){
  if (!listingId) return { favCount: 0, viewCount: 0, _ts: 0 };

  const cur = STATS_CACHE.get(listingId);
  if (cur) return cur;

  const startedAt = Date.now();
  const s = await getListingStats(listingId);
  const fetched = {
    favCount: Number(s.favCount || 0) || 0,
    viewCount: Number(s.viewCount || 0) || 0,
    _ts: startedAt,
  };

  const existing = STATS_CACHE.get(listingId);
  if (existing && (existing._ts || 0) > startedAt){
    // A newer local update happened while we were fetching; keep the newer value.
    return existing;
  }

  STATS_CACHE.set(listingId, fetched);
  return fetched;
}

function setStatsCached(listingId, patch){
  if (!listingId) return { favCount: 0, viewCount: 0, _ts: 0 };

  const cur = STATS_CACHE.get(listingId) || { favCount: 0, viewCount: 0, _ts: 0 };
  const next = {
    favCount: Number(patch.favCount ?? cur.favCount) || 0,
    viewCount: Number(patch.viewCount ?? cur.viewCount) || 0,
    _ts: Date.now(),
  };

  STATS_CACHE.set(listingId, next);
  return next;
}

function cssEsc(s){
  try{ return CSS && CSS.escape ? CSS.escape(String(s)) : String(s); }
  catch{ return String(s).replace(/"/g, '\\"'); }
}

function updateCardStatsDOM(listingId, stats){
  if (!listingId) return;
  const idSel = cssEsc(listingId);
  const cards = document.querySelectorAll(`.cardItem[data-id="${idSel}"]`);
  cards.forEach((card) => {
    const favEl = card.querySelector('.favCount');
    const viewEl = card.querySelector('.viewCount');
    if (favEl) favEl.textContent = String(Number(stats?.favCount || 0) || 0);
    if (viewEl) viewEl.textContent = String(Number(stats?.viewCount || 0) || 0);
  });
}

/* =========================
   ✅ Helpers
========================= */

function $id(id){ return document.getElementById(id); }

// ✅ Report reasons (for listing report)
const REPORT_REASONS = [
  { key: "bad_ad", label: "🚫 إعلان مخالف" },
  { key: "personal", label: "🧍 إساءة / محتوى شخصي" },
  { key: "fake_phone", label: "📞 رقم كاذب أو غير صحيح" }
];

function askReportReason(){
  const r = prompt(
`سبب التبليغ:
1 - إعلان مخالف
2 - إساءة / محتوى شخصي
3 - رقم كاذب أو غير صحيح

اكتب رقم السبب:`
  );
  const map = { "1":"bad_ad", "2":"personal", "3":"fake_phone" };
  return map[String(r || "").trim()] || null;
}

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
  return s;
}

function getCatId(data){
  const raw = data.categoryId || data.categoryNameAr || data.category || "";
  return normalizeCat(raw);
}

function getTypeId(data){
  return (data.typeId ?? data.car?.typeId ?? data.estate?.typeId ?? data.type ?? "").toString().trim();
}

/* =========================
   ✅ Helpers
   - Smart truncate for cards
========================= */
function truncate(text, max = 140){
  if(!text) return "";
  const s = String(text);
  if(s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function formatListingDate(ts){
  try{
    let d = null;
    if (!ts) return "";
    if (typeof ts.toDate === "function") d = ts.toDate();
    else if (typeof ts.seconds === "number") d = new Date(ts.seconds * 1000);
    else if (typeof ts === "number") d = new Date(ts);
    if (!d || isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }catch{ return ""; }
}

function renderInfoCards(data){
  const box = UI.el.dInfo || $id("dInfo");
  if (!box) return;

  const catTxt = (data.category || data.categoryNameAr || data.categoryId || "").toString().trim();
  const typeTxt = typeToAr(getTypeId(data)) || "";
  const created = formatListingDate(data.createdAt);
  // ✅ Counters come from listingStats/{id} (viewCount / favCount).
  // Keep backward-compat for any old field names.
  const views = Number(data.viewCount ?? data.viewsCount ?? 0) || 0;
  const favs  = Number(data.favCount ?? data.favsCount ?? 0) || 0;

  const cards = [];

  // أساسي
  const placeTxt = getPlaceLabel(data);
  if (placeTxt) cards.push({ icon:"📍", label:"الموقع", value: String(placeTxt) });
  if (catTxt)   cards.push({ icon:"🏷️", label:"القسم", value: catTxt });
  if (typeTxt)  cards.push({ icon:"🤝", label:"النوع", value: typeTxt });
  if (created)  cards.push({ icon:"🗓️", label:"تاريخ النشر", value: created });

  // سيارات
  if (isCarsCategory(data)){
    const model = getCarModel(data);
    const year  = getCarYearRaw(data);
    if (model) cards.push({ icon:"🚗", label:"الموديل", value: model });
    if (year)  cards.push({ icon:"📅", label:"السنة", value: year });
  }

  // عقارات
  if (isEstateCategory(data)){
    const kind  = getEstateKind(data);
    const rooms = getRoomsNum(data);
    if (kind) cards.push({ icon:"🏠", label:"النوع العقاري", value: kind });
    if (rooms) cards.push({ icon:"🛏️", label:"الغرف", value: `${rooms}` });
  }
  // إحصائيات (تُعرض أعلى الإعلان)
box.innerHTML = cards.map(c => `
    <div class="infoCard">
      <div class="infoIcon" aria-hidden="true">${escapeHtml(c.icon)}</div>
      <div class="infoText">
        <div class="infoLabel">${escapeHtml(c.label)}</div>
        <div class="infoValue" title="${escapeHtml(c.value)}">${escapeHtml(c.value)}</div>
      </div>
    </div>
  `).join("");
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

// ---- Electronics ----
function isElectronicsCategory(data){ return getCatId(data) === "electronics"; }

function getElectKind(data){
  return (data.elect?.kind ?? data.electKind ?? data.electronicsKind ?? data.kind ?? "").toString().trim();
}

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
  const urlType = typeToAr(getTypeId(data));
  const kind = getEstateKind(data);
  const rooms = getRoomsNum(data);
  const roomsTxt = rooms ? `${rooms} غرف` : "";
  return [urlType, kind, roomsTxt].filter(Boolean).join(" • ");
}

// ---- Seller helpers ----
function getSellerNameFallback(listingData){
  const n = (listingData?.sellerName || "").toString().trim();
  if (n) return n;

  const em = (listingData?.sellerEmail || "").toString().trim();
  if (em && em.includes("@")) return em.split("@")[0];

  return "صاحب الإعلان";
}

function getSellerUid(listingData){
  return (listingData?.ownerId || listingData?.uid || "").toString().trim();
}

function buildStoreUrl(uid){
  return `store.html?u=${encodeURIComponent(uid)}`;
}

/**
 * ✅ WhatsApp normalize:
 */
function normalizeWhatsapp(raw){
  let num = String(raw || "").trim().replace(/[^\d+]/g, "");
  num = num.replace(/^\+/, "");
  if (num.startsWith("00")) num = num.slice(2);
  return num;
}

/* =========================
   ✅ Profile cache (users/{uid}) with TTL + force refresh
========================= */

const _userCache = new Map(); // uid -> { data, ts }
const USER_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

async function getUserProfile(uid, opts = {}){
  const force = !!opts.force;
  if (!uid) return null;

  const cached = _userCache.get(uid);
  const now = Date.now();
  const fresh = cached && (now - cached.ts) < USER_CACHE_TTL_MS;

  if (!force && fresh) return cached.data;

  try{
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? snap.data() : null;
    _userCache.set(uid, { data, ts: now });
    return data;
  }catch{
    _userCache.set(uid, { data: null, ts: now });
    return null;
  }
}

function pickBestSellerName(listingData, profile){
  const pName = (profile?.displayName || "").toString().trim();
  if (pName) return pName;

  const lName = (listingData?.sellerName || "").toString().trim();
  if (lName) return lName;

  return getSellerNameFallback(listingData);
}

/* =========================
   ✅ Filters (قراءة فقط - الربط في ui.js)
========================= */

function readTypeFilter(){
  const hidden = $id("typeFilter");
  if (hidden && typeof hidden.value === "string") return hidden.value.trim();
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
  UI.actions.openFavorites = openFavorites;

  // ✅ زر مراسلة من صفحة التفاصيل (ممنوع للزائر)
  if (UI.el.btnChat){
    UI.el.btnChat.onclick = () => {
      const l = UI.state.currentListing;
      if (!l) return;

      // ✅ لازم يكون مسجل دخول
      if (!auth.currentUser){
        UI.actions.openAuth?.();
        return;
      }

      const me = auth.currentUser?.uid || "";
      const ownerId = l.ownerId || l.uid || "";

      // إذا الإعلان إلك -> افتح Inbox
      if (me && ownerId && me === ownerId) {
        if (typeof UI.actions.openInbox === "function") return UI.actions.openInbox(l.id);
        return alert("Inbox غير جاهز بعد.");
      }

      // إذا مو إلك -> افتح الشات
      // ✅ سياق: فتحت الدردشة من صفحة الإعلان
      UI.state.chatReturnTo = { from: "details", listingId: l.id };
      UI.actions.openChat(l.id, l.title || "إعلان", ownerId);
    };
  }

  // ✅ زر حذف الإعلان
  if (UI.el.btnDeleteListing){
    UI.el.btnDeleteListing.onclick = () => deleteCurrentListing();
  }
}

/* =========================
   ✅ Favorites view (simple)
   - shows user's favorite listings inside the same grid
========================= */

async function openFavorites(){
  if (!auth.currentUser) return UI.actions.openAuth?.();

  // reset UI (keep it simple)
  try{ if (UI.el.qSearch) UI.el.qSearch.value = ""; }catch{}
  UI.state.filtersActive = false;

  await loadFavorites();
}

async function loadFavorites(){
  const uid = auth.currentUser?.uid || "";
  if (!uid || !UI.el.listings) return;

  UI.el.listings.innerHTML = "";
  UI.state.lastDoc = null;
  UI.el.btnMore?.classList.add("hidden");

  // ✅ Read favorites list
  const favQ = query(collection(db, "users", uid, "favorites"), orderBy("createdAt", "desc"), limit(FAV_PAGE_SIZE));
  const favSnap = await getDocs(favQ);
  const favIds = favSnap.docs.map(d => d.id).filter(Boolean);

  // empty
  if (!favIds.length){
    if (UI.el.emptyState){
      UI.el.emptyState.style.display = "block";
      UI.el.emptyState.textContent = "لا يوجد مفضلات حالياً";
    }
    return;
  }

  if (UI.el.emptyState) UI.el.emptyState.style.display = "none";

  // ✅ Fetch listings docs (best-effort)
  const docs = await Promise.all(
    favIds.map(async (id) => {
      try{
        const s = await getDoc(doc(db, "listings", id));
        return s.exists() ? { id, data: s.data() } : null;
      }catch{
        return null;
      }
    })
  );

  const frag = document.createDocumentFragment();

  // We already know all are favorites
  const favSet = new Set(favIds);

  docs.filter(Boolean).forEach(({ id, data }) => {
    if (!data || data.isActive === false) return;

    const img = (data.images && data.images[0]) ? data.images[0] : "";

    const extraMeta =
      isCarsCategory(data) ? carLine(data) :
      isEstateCategory(data) ? estateLine(data) :
      "";

    const { place, city, showCityInMeta } = getCardLocationParts(data);
    const cityTxt = escapeHtml(city || "");
    const catTxt  = escapeHtml(data.category || data.categoryNameAr || data.categoryId || "");

    const distTxt = escapeHtml(getDistanceTextForListing(data));
    const placeLabel = escapeHtml(place || "");

    const sellerUid = getSellerUid(data);
    const sellerName = escapeHtml(getSellerNameFallback(data));
    const sellerHtml = sellerUid
      ? `<div class="sellerLine">البائع: <a class="sellerLink" href="${buildStoreUrl(sellerUid)}">${sellerName}</a></div>`
      : `<div class="sellerLine">البائع: <span class="sellerName">${sellerName}</span></div>`;

    const card = document.createElement("div");
    card.className = "cardItem";

    // ✅ counts from listingStats (cached) — keep stable even if listings/{id} has old numbers
    const cached = STATS_CACHE.get(id) || { favCount: 0, viewCount: 0 };
    const viewsC = Number(cached.viewCount || 0) || 0;
    const favC = Number(cached.favCount || 0) || 0;
    const isFav = favSet.has(id);

    card.innerHTML = `
      <div class="cardMedia">
        <img src="${img}" alt="" />
        <button class="favBtn favOverlay ${isFav ? "isFav" : ""}" type="button" aria-label="مفضلة">♥</button>
      </div>
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>
        ${extraMeta ? `<div class="carMeta">${escapeHtml(extraMeta)}</div>` : ``}
        <div class="m">${showCityInMeta ? cityTxt : ""}${(showCityInMeta && catTxt) ? " • " : ""}${catTxt}</div>
        ${(distTxt || placeLabel) ? `<div class="m muted small">${distTxt ? `📏 ${distTxt}` : ""}${(distTxt && placeLabel) ? " • " : ""}${placeLabel ? `📍 ${placeLabel}` : ""}</div>` : ""}
        ${sellerHtml}
        <div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>
        <div class="cardStats">
          <span class="muted">♥ <span class="favCount">${favC}</span></span>
          <span class="muted">👁️ ${viewsC}</span>
        </div>
      </div>
    `;

    // ✅ lazy fetch stats for this card (1 getDoc) to avoid jumping numbers
    // (only for cards that passed filters)
    getStatsCached(id).then(st => {
      try{
        // إذا في قيمة أحدث بالكاش (مثلاً بعد كبسة ♥) لا نرجّع الرقم لورا
        const latest = (STATS_CACHE.get(id) || st || {});
        const countEl = card.querySelector(".favCount");
        if (countEl) countEl.textContent = String(latest.favCount || 0);
        const vEl = card.querySelector(".cardStats .muted:last-child");
        if (vEl) vEl.textContent = `👁️ ${latest.viewCount || 0}`;
      }catch{}
    });

    card.onclick = () => openDetails(id, data);

    const favBtn = card.querySelector(".favOverlay");
    if (favBtn){
      favBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!(await requireUserForFav())) return;
        favBtn.disabled = true;
        try{
          const res = await toggleFavorite(id);
          if (res?.ok && !res.isFav){
            // remove card from favorites view
            card.remove();
          }
        }finally{
          favBtn.disabled = false;
        }
      });
    }

    frag.appendChild(card);
  });

  UI.el.listings.appendChild(frag);
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

    if (!me) return alert("لا يمكن حذف الإعلان بدون تسجيل حالياً. (النشر متاح للجميع)\nإذا هذا إعلانك وتريد حذفه: تواصل معنا عبر الشات.");
    const isOwner = !!(ownerId && ownerId === me);
    const isAdmin = document.body.classList.contains("is-admin");

    if (!isOwner && !isAdmin) return alert("لا يمكنك حذف هذا الإعلان");
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

/* =========================
   ✅ Details
========================= */

async function openDetails(id, data = null, fromHash = false){
  try{
    // 1) Load listing if not provided
    if (!data){
      const snap = await getDoc(doc(db, "listings", id));
      if (!snap.exists()) return alert("الإعلان غير موجود أو تم حذفه.");
      data = snap.data();
    }

    // 2) Show page + basic render
    UI.state.currentListing = { id, ...data };
    UI.showDetailsPage();

    UI.renderGallery(data.images || []);
    UI.el.dTitle && (UI.el.dTitle.textContent = data.title || "");

    const catTxt = (data.category || data.categoryNameAr || data.categoryId || "").toString().trim();
    const { place, city } = getCardLocationParts(data);
    const baseMeta = `${city || ""}${(city && catTxt) ? " • " : ""}${catTxt}`.trim();

    const extraMeta =
      isCarsCategory(data) ? carLine(data) :
      isEstateCategory(data) ? estateLine(data) :
      "";

    // ✅ Distance + approximate location (if available)
    const distInfo = getDistanceTextForListing(data);
    const placeLabel = String(place || "");

    let metaLine = extraMeta ? `${baseMeta} • ${extraMeta}` : baseMeta;
    if (distInfo) metaLine = `${metaLine} • ${distInfo}`;
    UI.el.dMeta && (UI.el.dMeta.textContent = metaLine);

    // show approximate label near seller (does not override city)
    // Only show the pinned location if it's NOT identical to the city already shown in meta
    if (UI.el.dSeller && placeLabel && placeLabel !== (city || "")) {
      const line = document.createElement("div");
      line.className = "muted small";
      line.textContent = `📍 ${placeLabel}`;
      // avoid duplicates
      const exists = UI.el.dSeller.querySelector(".muted.small[data-loc='1']");
      if (!exists){
        line.setAttribute("data-loc","1");
        UI.el.dSeller.appendChild(line);
      }
    }

    UI.el.dPrice && (UI.el.dPrice.textContent = formatPrice(data.price, data.currency));

    // ✅ C) Info cards (Marketplace-like)
    renderInfoCards(data);

    // ✅ Description: show limited + "Read more"
    renderDescriptionWithReadMore(data.description || "");

    // ✅ Views counter + stats (stored in listingStats, not in listings)
    await bumpViewCount(id);
    const statsNow = await getListingStats(id);
    const viewsNow = Number(statsNow.viewCount || 0) || 0;
    const favNow = Number(statsNow.favCount || 0) || 0;
    // ✅ keep list-page stats stable by caching
    setStatsCached(id, { viewCount: viewsNow, favCount: favNow });
    if (UI.el.dStats) UI.el.dStats.textContent = `👁️ ${viewsNow} • ❤️ ${favNow}`;
    if (UI.el.dFavCount) UI.el.dFavCount.textContent = String(favNow);

    // ✅ Favorite button (details)
    if (UI.el.btnFav){
      UI.el.btnFav.disabled = false;
      UI.el.btnFav.classList.remove("isFav");

      let isFav = false;
      try{
        const favSet = await getFavoriteSet([id]);
        isFav = favSet.has(id);
      }catch{}

      UI.el.btnFav.classList.toggle("isFav", isFav);

      UI.el.btnFav.onclick = async () => {
        if (!(await requireUserForFav())) return;

        UI.el.btnFav.disabled = true;
        UI.el.btnFav.classList.remove("pulse");
        // force reflow for restart animation
        void UI.el.btnFav.offsetWidth;
        UI.el.btnFav.classList.add("pulse");
        try{
          const res = await toggleFavorite(id);
          if (!res?.ok) return;

          UI.el.btnFav.classList.toggle("isFav", !!res.isFav);
          if (UI.el.dFavCount) UI.el.dFavCount.textContent = String(res.favCount ?? 0);
          if (UI.el.dStats) UI.el.dStats.textContent = `👁️ ${viewsNow} • ❤️ ${res.favCount ?? 0}`;

          // ✅ update cache so list cards don't jump back to old numbers
          setStatsCached(id, { favCount: (res.favCount ?? 0), viewCount: viewsNow });

          if (UI.state.currentListing && UI.state.currentListing.id === id){
            UI.state.currentListing.favCount = res.favCount ?? 0;
          }

          // ✅ تحديث كروت المعلومات (المفضلة/المشاهدات من listingStats)
          renderInfoCards({ ...data, favCount: (res.favCount ?? 0), viewsCount: viewsNow });
        }catch(e){
          alert(e?.message || "فشل تحديث المفضلة");
        }finally{
          UI.el.btnFav.disabled = false;
        }
      };
    }

    // 3) Seller + WhatsApp + Report
    const ownerId = getSellerUid(data);

    let prof = ownerId ? await getUserProfile(ownerId) : null;
    const waTry = (prof?.whatsapp || "").toString().trim();
    if (ownerId && !waTry){
      prof = await getUserProfile(ownerId, { force: true });
    }

    // Seller line
    if (UI.el.dSeller){
      if (!ownerId){
        UI.el.dSeller.classList.add("hidden");
        UI.el.dSeller.innerHTML = "";
      } else {
        const sellerName = escapeHtml(pickBestSellerName(data, prof));
        UI.el.dSeller.innerHTML =
          `البائع: <a class="sellerLink" href="${buildStoreUrl(ownerId)}">${sellerName}</a>`;
        UI.el.dSeller.classList.remove("hidden");
      }
    }

    const waBtn = UI.el.btnWhatsapp || $id("btnWhatsapp");
    const reportListingBtn = UI.el.btnReportListing || $id("btnReportListing");
    const reportBtn = UI.el.btnReportWhatsapp || $id("btnReportWhatsapp");

    const waRaw = (prof?.whatsapp || "").toString().trim();
    const waNum = normalizeWhatsapp(waRaw);

    const listingUrl = location.href.split("#")[0] + `#listing=${encodeURIComponent(id)}`;

    // ==== Report listing (reasons) ====
    if (reportListingBtn){
      reportListingBtn.onclick = async () => {
        // بلاغ فقط للمسجل (حتى نعرف مين)
        if (!auth.currentUser){
          UI.actions.openAuth?.();
          return;
        }

        const reasonKey = askReportReason();
        if (!reasonKey) return;
        const reasonLabel = (REPORT_REASONS.find(x => x.key === reasonKey)?.label) || reasonKey;

        reportListingBtn.disabled = true;
        try{
          // ✅ منع تكرار البلاغ من نفس المستخدم على نفس الإعلان
          const qy = query(
            collection(db, "reports"),
            where("type", "==", "listing_report"),
            where("listingId", "==", id),
            where("reporterUid", "==", auth.currentUser.uid),
            limit(1)
          );
          const ex = await getDocs(qy);
          if (!ex.empty){
            alert("سبق وأرسلت بلاغاً لهذا الإعلان ✅");
            return;
          }

          await addDoc(collection(db, "reports"), {
            type: "listing_report",
            listingId: id,
            listingTitle: (data.title || "").toString().trim(),
            listingOwnerId: ownerId || null,
            reason: reasonKey,
            reasonLabel,
            reporterUid: auth.currentUser.uid,
            reporterEmail: auth.currentUser.email || null,
            createdAt: serverTimestamp(),
            url: listingUrl
          });

          alert("تم إرسال البلاغ ✅ شكراً لك");
        }catch(e){
          alert(e?.message || "فشل إرسال البلاغ");
        }finally{
          reportListingBtn.disabled = false;
        }
      };
    }

    // ==== WhatsApp button (ممنوع للزائر) ====
    if (waBtn){
      waBtn.classList.add("hidden");
      waBtn.removeAttribute("href");
      waBtn.textContent = "واتساب"; // خلي النص ثابت

      // لو ما في رقم: ضل مخفي
      if (ownerId && waNum){
        const msg = encodeURIComponent(
`مرحباً 👋
أنا مهتم بالإعلان:

📌 ${data.title || ""}
🆔 رقم الإعلان: ${id}

رابط الإعلان:
${listingUrl}

⚠️ تنبيه:
إذا لم تكن أنت صاحب هذا الإعلان أو وصلتك الرسالة بالخطأ، يرجى تجاهلها.
للمراسلة الرسمية استخدم زر "مراسلة" داخل الموقع.`
        );

        const href = `https://wa.me/${waNum}?text=${msg}`;
        waBtn.href = href;
        waBtn.classList.remove("hidden");

        // ✅ منع الفتح للزائر حتى لو ضغط
        waBtn.onclick = (e) => {
          if (!auth.currentUser){
            e.preventDefault();
            e.stopPropagation();
            UI.actions.openAuth?.();
            return false;
          }
          // مسجل: خليه يفتح طبيعي
          return true;
        };
      } else {
        // ما في رقم: خليه مخفي وما في onclick
        waBtn.onclick = null;
      }
    }

    // ==== Report Listing (واضح داخل صفحة الإعلان) ====
    if (reportListingBtn){
      reportListingBtn.classList.remove("hidden");
      reportListingBtn.disabled = false;

      reportListingBtn.onclick = async () => {
        if (!auth.currentUser){
          UI.actions.openAuth?.();
          return;
        }

        const reasonKey = askReportReason();
        if (!reasonKey) return;

        const reasonLabel = (REPORT_REASONS.find(r => r.key === reasonKey)?.label) || reasonKey;

        reportListingBtn.disabled = true;
        try{
          // ✅ prevent duplicate report by same user for same listing
          const qy = query(
            collection(db, "reports"),
            where("type", "==", "listing_report"),
            where("listingId", "==", id),
            where("reporterUid", "==", (auth.currentUser.uid || "")),
            limit(1)
          );
          const ex = await getDocs(qy);
          if (!ex.empty){
            alert("سبق وأن أرسلت بلاغاً عن هذا الإعلان ✅");
            return;
          }

          await addDoc(collection(db, "reports"), {
            type: "listing_report",
            listingId: id,
            listingTitle: (data.title || "").toString().trim(),
            listingOwnerId: ownerId || null,
            reason: reasonKey,
            reasonLabel,
            reporterUid: auth.currentUser?.uid || null,
            reporterEmail: auth.currentUser?.email || null,
            createdAt: serverTimestamp(),
            source: location.hostname || "web"
          });

          alert("تم إرسال البلاغ ✅ شكراً لمساعدتك");
        }catch(e){
          alert(e?.message || "فشل إرسال البلاغ");
        }finally{
          reportListingBtn.disabled = false;
        }
      };
    }

    // ==== Report (يُفضّل يكون أيضاً لمستخدم مسجل حتى نعرف مين بلّغ) ====
    if (reportBtn){
      reportBtn.classList.add("hidden");
      reportBtn.onclick = null;

      if (ownerId && waNum){
        reportBtn.classList.remove("hidden");

        reportBtn.onclick = async () => {
          // ✅ بلاغ فقط للمسجل
          if (!auth.currentUser){
            UI.actions.openAuth?.();
            return;
          }

          const ok = confirm("هل تريد الإبلاغ أن رقم واتساب هذا غير صحيح أو يسبب إزعاج؟");
          if (!ok) return;

          reportBtn.disabled = true;

          try{
            await addDoc(collection(db, "reports"), {
              type: "wrong_whatsapp",
              listingId: id,
              listingTitle: (data.title || "").toString().trim(),
              listingOwnerId: ownerId,
              whatsapp: waNum,
              reporterUid: auth.currentUser?.uid || null,
              reporterEmail: auth.currentUser?.email || null,
              createdAt: serverTimestamp()
            });

            alert("تم إرسال البلاغ ✅ شكراً لمساعدتك");
          }catch(e){
            alert(e?.message || "فشل إرسال البلاغ");
          }finally{
            reportBtn.disabled = false;
          }
        };
      }
    }

    // 4) Delete button for owner OR admin
    const me = auth.currentUser?.uid || "";
    const isOwner = !!(me && ownerId && me === ownerId);
    const isAdmin = document.body.classList.contains("is-admin");

    UI.el.btnDeleteListing?.classList.toggle("hidden", !(isOwner || isAdmin));
if (UI.el.btnDeleteListing) UI.el.btnDeleteListing.disabled = false;

    // 5) Update hash
    if (!fromHash){
      const newHash = `#listing=${encodeURIComponent(id)}`;
      if (location.hash !== newHash) history.replaceState(null, "", newHash);
    }

  }catch(e){
    console.error(e);
    alert(e?.message || "فشل فتح الإعلان");
  }
}

/* =========================
   ✅ Description (Read more)
========================= */

function renderDescriptionWithReadMore(text){
  const el = UI.el.dDesc;
  const btn = UI.el.btnReadMore;
  if (!el) return;

  const full = String(text || "").trim();
  // reset
  el.dataset.full = full;
  el.dataset.expanded = "0";

  // ✅ always keep full text (preserve new lines) and use CSS clamp for collapse
  el.textContent = full;
  el.classList.add("collapsed");

  const setBtn = (expanded) => {
    if (!btn) return;
    btn.textContent = expanded ? "إخفاء ⌃" : "قراءة المزيد ⌄";
  };

  const setCollapsed = () => {
    el.classList.add("collapsed");
    el.dataset.expanded = "0";
    setBtn(false);
  };

  const setExpanded = () => {
    el.classList.remove("collapsed");
    el.dataset.expanded = "1";
    setBtn(true);
  };

  // ✅ decide whether button is needed (only if text overflows when collapsed)
  const updateBtnVisibility = () => {
    if (!btn) return;
    // must be collapsed for correct measurement
    el.classList.add("collapsed");
    requestAnimationFrame(() => {
      const needs = el.scrollHeight > el.clientHeight + 2;
      btn.classList.toggle("hidden", !needs);
      // keep correct label
      setBtn(el.dataset.expanded === "1");
      // restore state
      if (el.dataset.expanded === "1") el.classList.remove("collapsed");
    });
  };

  // initial
  setCollapsed();
  updateBtnVisibility();

  if (btn){
    btn.onclick = () => {
      const expanded = el.dataset.expanded === "1";
      if (expanded) setCollapsed();
      else setExpanded();
      // after toggle, keep visibility consistent
      updateBtnVisibility();
    };
  }
}

/* =========================
   ✅ Load listings
========================= */

let _loadSeq = 0;

async function loadListings(reset = true){
  const mySeq = ++_loadSeq;

  if (!UI.el.listings) return;

  if (reset){
    UI.el.listings.innerHTML = "";
    UI.state.lastDoc = null;
    if (UI.el.btnMore){
      UI.el.btnMore.disabled = false;
      UI.el.btnMore.classList.add("hidden"); // ✅ نخليه مخفي افتراضياً
    }
  }

  let qy = query(collection(db, "listings"), orderBy("createdAt", "desc"), limit(LIST_PAGE_SIZE));
  if (UI.state.lastDoc){
    qy = query(collection(db, "listings"), orderBy("createdAt", "desc"), startAfter(UI.state.lastDoc), limit(LIST_PAGE_SIZE));
  }

  const snap = await getDocs(qy);

  if (mySeq !== _loadSeq) return;

  if (snap.docs.length){
    UI.state.lastDoc = snap.docs[snap.docs.length - 1];

    // ✅ زر "تحميل المزيد" يظهر فقط إذا في احتمال صفحات إضافية
    // (إذا رجع أقل من limit غالباً ما في المزيد)
    if (UI.el.btnMore){
      const hasMoreLikely = snap.docs.length >= 12;
      UI.el.btnMore.classList.toggle("hidden", !hasMoreLikely);
    }
  }else{
    if (!reset && UI.el.btnMore){
      UI.el.btnMore.disabled = true;
      UI.el.btnMore.classList.add("hidden");
    }
  }

  const keyword = (UI.el.qSearch?.value || "").trim().toLowerCase();
  const useFilters = !!UI.state.filtersActive;

  const cityVal = useFilters ? (UI.el.cityFilter?.value || "") : "";
  const catVal  = useFilters ? normalizeCat(UI.el.catFilter?.value || "") : "";

  const typeVal = useFilters ? readTypeFilter() : "";
  const { from: yearFrom, to: yearTo } = useFilters ? readYearRange() : { from: 0, to: 0 };

  const estateKindVal = useFilters ? (($id("estateKindFilter")?.value || "").toString().trim()) : "";
  const roomsVal = useFilters ? Number(($id("roomsFilter")?.value || "").toString().trim() || 0) : 0;
  const electKindVal = useFilters ? (($id("electKindFilter")?.value || "").toString().trim()) : "";

  const frag = document.createDocumentFragment();

  // ✅ favorites for this page (only if logged)
  let favSet = new Set();
  if (auth.currentUser){
    try{
      const ids = snap.docs.map(d => d.id);
      favSet = await getFavoriteSet(ids);
    }catch{}
  }

  snap.forEach(ds=>{
    const data = ds.data();

    if (data.isActive === false) return;
    if (cityVal && data.city !== cityVal) return;

    if (catVal){
      const docCat = getCatId(data);
      if (docCat !== catVal) return;
    }

    if (typeVal){
      const t = normalizeTypeId(getTypeId(data));
      if ((isCarsCategory(data) || isEstateCategory(data)) && t !== typeVal) return;
    }

    if ((yearFrom || yearTo) && isCarsCategory(data)){
      const y = getCarYearNum(data);
      if (!y) return;
      if (yearFrom && y < yearFrom) return;
      if (yearTo && y > yearTo) return;
    }

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

    // ✅ فلاتر الإلكترونيات
    if (isElectronicsCategory(data)){
      if (electKindVal){
        const ek = getElectKind(data);
        if (ek !== electKindVal) return;
      }
    }

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

	    const { place, city, showCityInMeta } = getCardLocationParts(data);
	    const cityTxt = escapeHtml(city || "");
	    const catTxt  = escapeHtml(data.category || data.categoryNameAr || data.categoryId || "");

	    const distTxt = escapeHtml(getDistanceTextForListing(data));
	    const placeLabel = escapeHtml(place || "");

	    const sellerUid = getSellerUid(data);
    const sellerName = escapeHtml(getSellerNameFallback(data));
    const sellerHtml = sellerUid
      ? `<div class="sellerLine">البائع: <a class="sellerLink" href="${buildStoreUrl(sellerUid)}">${sellerName}</a></div>`
      : `<div class="sellerLine">البائع: <span class="sellerName">${sellerName}</span></div>`;

    const card = document.createElement("div");
    card.className = "cardItem";

    // ✅ Start with cached stats (if any). We'll refresh from listingStats lazily.
    const cachedStats = STATS_CACHE.get(ds.id) || { favCount: 0, viewCount: 0 };
    const viewsC = Number(cachedStats.viewCount || 0) || 0;
    const favC = Number(cachedStats.favCount || 0) || 0;
    const isFav = favSet.has(ds.id);
    card.innerHTML = `
      <div class="cardMedia">
        <img src="${img}" alt="" />
        <button class="favBtn favOverlay ${isFav ? "isFav" : ""}" type="button" aria-label="مفضلة">♥</button>
      </div>
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>
        ${extraMeta ? `<div class="carMeta">${escapeHtml(extraMeta)}</div>` : ``}
        <div class="m">${showCityInMeta ? cityTxt : ""}${(showCityInMeta && catTxt) ? " • " : ""}${catTxt}</div>
        ${(distTxt || placeLabel) ? `<div class="m muted small">${distTxt ? `📏 ${distTxt}` : ""}${(distTxt && placeLabel) ? " • " : ""}${placeLabel ? `📍 ${placeLabel}` : ""}</div>` : ""}
        ${sellerHtml}
        
        
<div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>

        <div class="cardStats">
          <span class="muted">♥ <span class="favCount">${favC}</span></span>
          <span class="muted">👁️ <span class="viewCount">${viewsC}</span></span>
        </div>
      </div>
    `;

    // ✅ Refresh stats from Firestore (listingStats) once per rendered card
    // This keeps numbers stable and avoids using stale counters inside listings/{id}.
    getStatsCached(ds.id).then((st) => {
      try{
        const favEl = card.querySelector('.favCount');
        const viewEl = card.querySelector('.viewCount');
        if (favEl) favEl.textContent = String(st.favCount ?? 0);
        if (viewEl) viewEl.textContent = String(st.viewCount ?? 0);
      }catch{}
    });

    // card click => open details
    card.onclick = () => openDetails(ds.id, data);

    // ✅ favorite button (stop propagation)
    const favBtn = card.querySelector(".favOverlay");
    if (favBtn){
      favBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!(await requireUserForFav())) return;

        favBtn.disabled = true;
        try{
          const res = await toggleFavorite(ds.id);
          if (!res?.ok) return;
          favBtn.classList.toggle("isFav", !!res.isFav);
          const countEl = card.querySelector(".favCount");
          if (countEl) countEl.textContent = String(res.favCount ?? 0);
          // ✅ cache for stability
          setStatsCached(ds.id, { favCount: (res.favCount ?? 0) });
        }catch(err){
          alert(err?.message || "فشل تحديث المفضلة");
        }finally{
          favBtn.disabled = false;
        }
      });
    }


    // ✅ "قراءة المزيد" (stop propagation)
    const rmBtn = card.querySelector(".readMoreBtn");
    if (rmBtn){
      rmBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDetails(ds.id, data);
      });
    }

    const sellerLinkEl = card.querySelector(".sellerLink");
    if (sellerLinkEl){
      sellerLinkEl.addEventListener("click", (e) => e.stopPropagation());
    }

    const imgEl = card.querySelector("img");
    if (imgEl){
      imgEl.onclick = (e) => { e.stopPropagation(); openDetails(ds.id, data); };
    }

    frag.appendChild(card);
  });

  UI.el.listings.appendChild(frag);
  UI.setEmptyState(UI.el.listings.children.length === 0);
}