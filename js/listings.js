// listings.js (Deluxe: typeFilter hidden + yearFrom/yearTo + عقارات + ميتا + مراسلة/Inbox + WhatsApp + Report)

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";
import { getFavoriteSet, toggleFavorite, bumpViewCount, requireUserForFav, loadFavoritesModal } from "./favorites.js";

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


function showListError(e){
  try{
    const msg = (e && (e.message || e.code)) ? (e.message || e.code) : String(e);
    const box = document.createElement("div");
    box.className = "boot-error";
    box.style.position = "relative";
    box.style.top = "0";
    box.style.left = "0";
    box.style.right = "0";
    box.style.margin = "12px 0";
    box.textContent = "⚠️ تعذّر تحميل الإعلانات: " + msg;
    UI.el.listings && UI.el.listings.prepend(box);
  }catch{}
}

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

  // ✅ Favorites
  UI.actions.openFavorites = async () => {
    if (!requireUserForFav()) return;
    UI.show(UI.el.favModal);
    await loadFavoritesModal();
  };
  UI.actions.closeFavorites = () => UI.hide(UI.el.favModal);

  if (UI.el.btnCloseFav) UI.el.btnCloseFav.onclick = UI.actions.closeFavorites;


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
    if (UI.el.descContent){
      UI.el.descContent.textContent = data.description || "";
      // reset collapsed/expanded
      UI.el.descContent.classList.remove("expanded");
      UI.el.descContent.classList.add("collapsed");
    }
    if (UI.el.descToggle){
      const txt = data.description || "";
      UI.el.descToggle.style.display = (txt && txt.length > 160) ? "inline-block" : "none";
      UI.el.descToggle.textContent = "قراءة المزيد";
      UI.el.descToggle.onclick = () => {
        const expanded = UI.el.descContent.classList.toggle("expanded");
        UI.el.descContent.classList.toggle("collapsed", !expanded);
        UI.el.descToggle.textContent = expanded ? "إخفاء" : "قراءة المزيد";
      };
    }

    // ✅ Views counter (ضغطة حقيقية)
    bumpViewCount(id);

    // ✅ Stats line (views + favs)
    const viewsNow = Number(data.viewsCount || 0) || 0;
    const favNow = Number(data.favCount || 0) || 0;
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
        if (!requireUserForFav()) return;

        UI.el.btnFav.disabled = true;
        try{
          const res = await toggleFavorite(id);
          if (!res?.ok) return;

          UI.el.btnFav.classList.toggle("isFav", !!res.isFav);
          if (UI.el.dFavCount) UI.el.dFavCount.textContent = String(res.favCount ?? 0);
          if (UI.el.dStats) UI.el.dStats.textContent = `👁️ ${viewsNow} • ❤️ ${res.favCount ?? 0}`;

          if (UI.state.currentListing && UI.state.currentListing.id === id){
            UI.state.currentListing.favCount = res.favCount ?? 0;
          }
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

    // 4) Delete button only for owner
    const me = auth.currentUser?.uid || "";
    const isOwner = !!(me && ownerId && me === ownerId);

    UI.el.btnDeleteListing?.classList.toggle("hidden", !isOwner);
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
   ✅ Load listings
========================= */

let _loadSeq = 0;

async function loadListings(reset = true){
  const mySeq = ++_loadSeq;

  if (!UI.el.listings) return;

  if (reset){
    UI.el.listings.innerHTML = "";
    UI.state.lastDoc = null;
    if (UI.el.btnMore) UI.el.btnMore.disabled = false;
  }

  let qy = query(collection(db, "listings"), orderBy("createdAt", "desc"), limit(12));
  if (UI.state.lastDoc){
    qy = query(collection(db, "listings"), orderBy("createdAt", "desc"), startAfter(UI.state.lastDoc), limit(12));
  }

  let snap;
  try{
    snap = await getDocs(qy);
  }catch(e){
    showListError(e);
    return;
  }

  if (mySeq !== _loadSeq) return;

  if (snap.docs.length){
    UI.state.lastDoc = snap.docs[snap.docs.length - 1];
  }else{
    if (!reset && UI.el.btnMore) UI.el.btnMore.disabled = true;
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
          <span class="muted">👁️ ${viewsC}</span>
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
          const countEl = card.querySelector(".favCount");
          if (countEl) countEl.textContent = String(res.favCount ?? 0);
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