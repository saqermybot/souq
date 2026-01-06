// listings.js (Deluxe: typeFilter hidden + yearFrom/yearTo + عقارات + ميتا + مراسلة/Inbox + WhatsApp + Report)

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";
import { getFavoriteSet, toggleFavorite, bumpViewCount, requireUserForFav } from "./favorites.js";
import { ADMIN_UIDS, ADMIN_EMAILS } from "./config.js";

import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  deleteDoc,
  limit,
  orderBy,
  query,
  startAfter,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   ✅ Admin helper
========================= */
function isAdminUser(user){
  if (!user) return false;
  const uid = user.uid || "";
  const email = (user.email || "").toLowerCase().trim();

  const byUid = Array.isArray(ADMIN_UIDS) && ADMIN_UIDS.includes(uid);
  const byEmail = Array.isArray(ADMIN_EMAILS) && ADMIN_EMAILS.map(x => (x||"").toLowerCase().trim()).includes(email);

  return !!(byUid || byEmail);
}


/* =========================
   ✅ Helpers
========================= */

function $id(id){ return document.getElementById(id); }

// ✅ تحديث بطاقة إعلان أينما كانت موجودة (قائمة / مفضلة)
function updateCardStats(listingId, patch = {}){
  try{
    const id = String(listingId || "").trim();
    if (!id) return;

    const cards = document.querySelectorAll(`.cardItem[data-id="${CSS.escape(id)}"]`);
    if (!cards || !cards.length) return;

    cards.forEach((card) => {
      if (patch.favCount != null){
        const el = card.querySelector(".favCount");
        if (el) el.textContent = String(Math.max(0, Number(patch.favCount) || 0));
      }
      if (patch.viewsCount != null){
        const el = card.querySelector(".viewsCount");
        if (el) el.textContent = String(Math.max(0, Number(patch.viewsCount) || 0));
      }
      if (patch.isFav != null){
        const btn = card.querySelector(".favOverlay");
        if (btn) btn.classList.toggle("isFav", !!patch.isFav);
      }
    });
  }catch{}
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
  const views = Number(data.viewsCount || 0) || 0;
  const favs  = Number(data.favCount || 0) || 0;

  const cards = [];

  // أساسي
  if (data.city) cards.push({ icon:"📍", label:"المدينة", value: String(data.city) });
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

  // إحصائيات
  cards.push({ icon:"👁️", label:"المشاهدات", value: `${views}` });
  cards.push({ icon:"❤️", label:"المفضلة", value: `${favs}` });

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
  const favQ = query(collection(db, "users", uid, "favorites"), orderBy("createdAt", "desc"), limit(120));
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

    const cityTxt = escapeHtml(data.city || "");
    const catTxt  = escapeHtml(data.category || data.categoryNameAr || data.categoryId || "");

    const sellerUid = getSellerUid(data);
    const sellerName = escapeHtml(getSellerNameFallback(data));
    const sellerHtml = sellerUid
      ? `<div class="sellerLine">البائع: <a class="sellerLink" href="${buildStoreUrl(sellerUid)}">${sellerName}</a></div>`
      : `<div class="sellerLine">البائع: <span class="sellerName">${sellerName}</span></div>`;

    const card = document.createElement("div");
    card.className = "cardItem";
    card.setAttribute("data-id", id);
    const viewsC = Number(data.viewsCount || 0) || 0;
    const favC = Number(data.favCount || 0) || 0;
    const isFav = favSet.has(id);

    card.innerHTML = `
      <div class="cardMedia">
        <img src="${img}" alt="" />
        <button class="favBtn favOverlay ${isFav ? "isFav" : ""}" type="button" aria-label="مفضلة">♥</button>
      </div>
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>
        ${extraMeta ? `<div class="carMeta">${escapeHtml(extraMeta)}</div>` : ``}
        <div class="m">${cityTxt}${(cityTxt && catTxt) ? " • " : ""}${catTxt}</div>
        ${sellerHtml}
        <div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>
        <div class="cardStats">
          <span class="muted">♥ <span class="favCount">${favC}</span></span>
          <span class="muted">👁️ <span class="viewsCount">${viewsC}</span></span>
        </div>
      </div>
    `;

    card.onclick = () => openDetails(id, data);

    const favBtn = card.querySelector(".favOverlay");
    if (favBtn){
      favBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!requireUserForFav()) return;
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

    if (!me) return alert("يجب تسجيل الدخول أولاً");
    const isOwner = !!(ownerId && ownerId === me);
    const isAdmin = isAdminUser(auth.currentUser);

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
    const baseMeta = `${data.city || ""}${(data.city && catTxt) ? " • " : ""}${catTxt}`.trim();

    const extraMeta =
      isCarsCategory(data) ? carLine(data) :
      isEstateCategory(data) ? estateLine(data) :
      "";

    UI.el.dMeta && (UI.el.dMeta.textContent = extraMeta ? `${baseMeta} • ${extraMeta}` : baseMeta);

    UI.el.dPrice && (UI.el.dPrice.textContent = formatPrice(data.price, data.currency));

    // ✅ C) Info cards (Marketplace-like)
    renderInfoCards(data);

    // ✅ Description: show limited + "Read more"
    renderDescriptionWithReadMore(data.description || "");

    // ✅ Stats line (views + favs) + تحديث ديناميكي
    let viewsNow = Number(data.viewsCount || 0) || 0;
    let favNow = Number(data.favCount || 0) || 0;

    // ✅ Views counter (ضغطة حقيقية) (مع TTL)
    try{
      const r = await bumpViewCount(id);
      if (r?.bumped){
        viewsNow += 1; // تحديث فوري بالواجهة
        if (UI.state.currentListing && UI.state.currentListing.id === id){
          UI.state.currentListing.viewsCount = viewsNow;
        }
        updateCardStats(id, { viewsCount: viewsNow });
      }
    }catch{}

    if (UI.el.dStats) UI.el.dStats.textContent = `👁️ ${viewsNow} • ❤️ ${favNow}`;
    if (UI.el.dFavCount) UI.el.dFavCount.textContent = String(favNow);
    updateCardStats(id, { favCount: favNow });

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
        if (!requireUserForFav()) return;

        UI.el.btnFav.disabled = true;
        try{
          const res = await toggleFavorite(id);
          if (!res?.ok) return;

          UI.el.btnFav.classList.toggle("isFav", !!res.isFav);
          const newFav = Math.max(0, Number(res.favCount ?? 0) || 0);
          favNow = newFav;
          if (UI.el.dFavCount) UI.el.dFavCount.textContent = String(newFav);
          if (UI.el.dStats) UI.el.dStats.textContent = `👁️ ${viewsNow} • ❤️ ${newFav}`;

          if (UI.state.currentListing && UI.state.currentListing.id === id){
            UI.state.currentListing.favCount = res.favCount ?? 0;
          }

          // ✅ تحديث البطاقة بالواجهة (قائمة/مفضلة)
          updateCardStats(id, { favCount: newFav, isFav: !!res.isFav });

          // ✅ تحديث كروت المعلومات (المفضلة)
          renderInfoCards({ ...data, favCount: newFav, viewsCount: viewsNow });
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
    const reportBtn = UI.el.btnReportWhatsapp || $id("btnReportWhatsapp");

    const waRaw = (prof?.whatsapp || "").toString().trim();
    const waNum = normalizeWhatsapp(waRaw);

    const listingUrl = location.href.split("#")[0] + `#listing=${encodeURIComponent(id)}`;

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
    const isAdmin = isAdminUser(auth.currentUser);

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

  let qy = query(collection(db, "listings"), orderBy("createdAt", "desc"), limit(12));
  if (UI.state.lastDoc){
    qy = query(collection(db, "listings"), orderBy("createdAt", "desc"), startAfter(UI.state.lastDoc), limit(12));
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

    const sellerUid = getSellerUid(data);
    const sellerName = escapeHtml(getSellerNameFallback(data));
    const sellerHtml = sellerUid
      ? `<div class="sellerLine">البائع: <a class="sellerLink" href="${buildStoreUrl(sellerUid)}">${sellerName}</a></div>`
      : `<div class="sellerLine">البائع: <span class="sellerName">${sellerName}</span></div>`;

    const card = document.createElement("div");
    card.className = "cardItem";
    card.setAttribute("data-id", ds.id);
    const viewsC = Number(data.viewsCount || 0) || 0;
    const favC = Number(data.favCount || 0) || 0;
    const isFav = favSet.has(ds.id);
    card.innerHTML = `
      <div class="cardMedia">
        <img src="${img}" alt="" />
        <button class="favBtn favOverlay ${isFav ? "isFav" : ""}" type="button" aria-label="مفضلة">♥</button>
      </div>
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>
        ${extraMeta ? `<div class="carMeta">${escapeHtml(extraMeta)}</div>` : ``}
        <div class="m">${cityTxt}${(cityTxt && catTxt) ? " • " : ""}${catTxt}</div>
        ${sellerHtml}
        
        
<div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>

        <div class="cardStats">
          <span class="muted">♥ <span class="favCount">${favC}</span></span>
          <span class="muted">👁️ <span class="viewsCount">${viewsC}</span></span>
        </div>
      </div>
    `;

    // card click => open details
    card.onclick = () => openDetails(ds.id, data);

    // ✅ favorite button (stop propagation)
    const favBtn = card.querySelector(".favOverlay");
    if (favBtn){
      favBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!requireUserForFav()) return;

        favBtn.disabled = true;
        try{
          const res = await toggleFavorite(ds.id);
          if (!res?.ok) return;
          favBtn.classList.toggle("isFav", !!res.isFav);
          updateCardStats(ds.id, { favCount: res.favCount ?? 0, isFav: !!res.isFav });
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