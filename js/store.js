import { db } from "./firebase.js";
import { escapeHtml, formatPrice } from "./utils.js";

import {
  collection,
  getDocs,
  getDoc,
  doc,
  limit,
  orderBy,
  query,
  startAfter,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const grid = document.getElementById("grid");
const sellerTitle = document.getElementById("sellerTitle");

// ✅ عناصر الهيدر الجديدة (من store.html المعدّل)
const sellerMeta = document.getElementById("sellerMeta");
const sellerWhatsWrap = document.getElementById("sellerWhatsWrap");
const sellerWhatsMasked = document.getElementById("sellerWhatsMasked");
const btnRevealWhats = document.getElementById("btnRevealWhats");

// (fallback) لو ما عدّلت HTML لأي سبب
const sellerSub = document.getElementById("sellerSub");

const emptyBox = document.getElementById("emptyBox");
const btnMore = document.getElementById("btnMore");
const hint = document.getElementById("hint");
const countBadge = document.getElementById("countBadge");
const btnBackContext = document.getElementById("btnBackContext");

function getParam(name){
  return new URLSearchParams(location.search).get(name) || "";
}

const sellerUid = getParam("u").trim();
const retUrl = getParam("ret").trim();

// ✅ رجوع سياقي: إذا اجيت من الشات/إعلان ارجع لنفس المكان
try{
  if (btnBackContext){
    if (retUrl){
      btnBackContext.href = retUrl;
      btnBackContext.textContent = "رجوع";
    } else {
      btnBackContext.href = "./index.html";
      btnBackContext.textContent = "الرجوع للسوق";
    }
  }
}catch{}

let lastDoc = null;
let loading = false;
let totalShown = 0;

// fallback cache (بدون index)
let usingFallback = false;
let fallbackDocs = [];
let fallbackPos = 0;

const seenIds = new Set();

function showEmpty(show){
  emptyBox.classList.toggle("hidden", !show);
}

function setHint(msg=""){
  hint.textContent = msg;
}

function setCount(n){
  countBadge.textContent = String(n || 0);
}

function tsToMillis(v){
  try{
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v?.toMillis === "function") return v.toMillis();
    const d = new Date(v);
    const t = d.getTime();
    return Number.isFinite(t) ? t : 0;
  }catch{
    return 0;
  }
}

/* =========================
   ✅ Seller Profile (users/{uid})
========================= */

async function loadSellerProfile(uid){
  try{
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    return snap.data();
  }catch(e){
    console.warn("loadSellerProfile failed", e);
    return null;
  }
}

// ✅ تطبيع رقم واتساب (مثل listings.js)
function normalizeWhatsapp(raw){
  let num = String(raw || "").trim().replace(/[^\d+]/g, "");
  num = num.replace(/^\+/, "");
  if (num.startsWith("00")) num = num.slice(2);
  return num;
}

// ✅ تمويه ذكي: يعرض أول 2 + آخر 2 والباقي نجوم
function maskPhone(raw){
  const n = normalizeWhatsapp(raw);
  if (!n) return "";
  const len = n.length;

  // أرقام قصيرة: خبيها كلها تقريباً
  if (len <= 4) return "••••";

  const head = n.slice(0, 2);
  const tail = n.slice(-2);
  const stars = "•".repeat(Math.max(4, len - 4));
  return `${head}${stars}${tail}`;
}

function renderSellerHeader(profile){
  const name = (profile?.displayName || "").toString().trim();
  const city = (profile?.city || "").toString().trim();
  const whatsappRaw = (profile?.whatsapp || "").toString().trim();

  // العنوان
  sellerTitle.textContent = name ? `إعلانات ${name}` : "إعلانات البائع";

  // ✅ الميتا (بدون رقم كامل أبداً)
  const parts = [];
  if (city) parts.push(city);
  parts.push(`ID: ${sellerUid.slice(0, 8)}...`);

  // إذا عندك عناصر جديدة في الـ HTML
  if (sellerMeta){
    sellerMeta.textContent = parts.join(" • ");
  } else if (sellerSub) {
    // fallback لو HTML قديم
    sellerSub.textContent = parts.join(" • ");
  }

  // ✅ واتساب: نظهر سطر "مموّه" فقط (بدون الرقم الكامل)
  const masked = maskPhone(whatsappRaw);

  if (sellerWhatsWrap && sellerWhatsMasked && masked){
    sellerWhatsMasked.textContent = masked;
    sellerWhatsWrap.classList.remove("hidden");

    // زر "إظهار" مخفي افتراضياً (حتى ما نرجع نفضح الرقم)
    if (btnRevealWhats){
      btnRevealWhats.classList.add("hidden");
      btnRevealWhats.onclick = null;
    }
  } else {
    // ما في واتساب أو HTML قديم
    if (sellerWhatsWrap) sellerWhatsWrap.classList.add("hidden");
  }
}

/* =========================
   ✅ Cards
========================= */

function cardHtml(id, data){
  const img = (data.images && data.images[0]) ? data.images[0] : "";
  const city = escapeHtml(data.city || "");
  const kind = escapeHtml((data.detailsKindAr || "").toString().trim() || "");
  const kind2 = kind || escapeHtml((({"car":"سيارات","estate":"عقارات","electronics":"إلكترونيات","fashion":"ملابس"}[(data.detailsKind||"").toString().trim()] ) || ""));
  
  const title = escapeHtml(data.title || "بدون عنوان");
  const price = escapeHtml(formatPrice(data.price, data.currency));

  const url = `index.html#listing=${encodeURIComponent(id)}`;

  return `
    <div class="card" data-url="${url}">
      <img src="${img}" alt="" loading="lazy" />
      <div class="p">
        <div class="t">${title}</div>
        <div class="m">${city}${(city && kind2) ? " • " : ""}${kind2}</div>
        <div class="pr">${price}</div>
      </div>
    </div>
  `;
}

function appendCard(id, data){
  if (seenIds.has(id)) return;
  seenIds.add(id);

  const wrap = document.createElement("div");
  wrap.innerHTML = cardHtml(id, data);
  const card = wrap.firstElementChild;

  card.onclick = () => {
    const url = card.getAttribute("data-url");
    if (url) location.href = url;
  };

  grid.appendChild(card);
}

/* =========================
   ✅ Queries
========================= */

async function queryWithIndex(pageSize){
  let qy = query(
    collection(db, "listings"),
    where("ownerId", "==", sellerUid),
    orderBy("createdAt", "desc"),
    limit(pageSize)
  );

  if (lastDoc){
    qy = query(
      collection(db, "listings"),
      where("ownerId", "==", sellerUid),
      orderBy("createdAt", "desc"),
      startAfter(lastDoc),
      limit(pageSize)
    );
  }

  return await getDocs(qy);
}

async function loadFallbackCache(){
  // بدون orderBy لتجنب الـ index
  const qy = query(
    collection(db, "listings"),
    where("ownerId", "==", sellerUid),
    limit(200)
  );

  const snap = await getDocs(qy);

  // ترتيب محلي
  fallbackDocs = snap.docs
    .map(d => ({ id: d.id, data: d.data() }))
    .filter(x => x.data?.isActive !== false)
    .sort((a,b) => tsToMillis(b.data?.createdAt) - tsToMillis(a.data?.createdAt));

  fallbackPos = 0;
}

function takeFallbackPage(pageSize){
  const slice = fallbackDocs.slice(fallbackPos, fallbackPos + pageSize);
  fallbackPos += slice.length;
  return slice;
}

/* =========================
   ✅ Load
========================= */

async function loadMore(reset=false){
  if (!sellerUid) {
    sellerTitle.textContent = "خطأ";
    if (sellerMeta) sellerMeta.textContent = "لا يوجد معرف بائع في الرابط (u=...)";
    else if (sellerSub) sellerSub.textContent = "لا يوجد معرف بائع في الرابط (u=...)";

    btnMore.style.display = "none";
    showEmpty(true);
    setHint("");
    return;
  }

  if (loading) return;
  loading = true;
  btnMore.disabled = true;

  if (reset){
    grid.innerHTML = "";
    lastDoc = null;
    totalShown = 0;
    usingFallback = false;
    fallbackDocs = [];
    fallbackPos = 0;
    seenIds.clear();
    setCount(0);
    showEmpty(false);
    btnMore.style.display = "inline-flex";
  }

  setHint("جاري تحميل الإعلانات...");

  try{
    // ✅ هيدر البائع: مرة واحدة فقط عند أول تحميل
    if (reset){
      const profile = await loadSellerProfile(sellerUid);
      renderSellerHeader(profile);
    }

    if (!usingFallback){
      // ✅ الاستعلام السريع (يتطلب index)
      const snap = await queryWithIndex(12);

      if (snap.empty){
        showEmpty(true);
        btnMore.style.display = "none";
        setHint("");
        return;
      }

      let added = 0;
      snap.docs.forEach(ds=>{
        const data = ds.data();
        if (data.isActive === false) return;
        appendCard(ds.id, data);
        added++;
      });

      totalShown += added;
      setCount(totalShown);

      lastDoc = snap.docs[snap.docs.length - 1];

      showEmpty(grid.children.length === 0);

      if (snap.docs.length < 12){
        btnMore.style.display = "none";
      } else {
        btnMore.style.display = "inline-flex";
      }

      setHint("");
      return;
    }

    // ✅ Fallback mode (بدون index)
    if (!fallbackDocs.length){
      await loadFallbackCache();
    }

    if (!fallbackDocs.length){
      showEmpty(true);
      btnMore.style.display = "none";
      setHint("");
      return;
    }

    const page = takeFallbackPage(12);
    page.forEach(x => appendCard(x.id, x.data));

    totalShown = grid.children.length;
    setCount(totalShown);

    showEmpty(totalShown === 0);

    if (fallbackPos >= fallbackDocs.length){
      btnMore.style.display = "none";
    } else {
      btnMore.style.display = "inline-flex";
    }

    setHint("");

  }catch(e){
    console.error(e);

    const msg = String(e?.message || "").toLowerCase();

    // ✅ لو المشكلة Index => فعل fallback
    if (msg.includes("index") || msg.includes("failed-precondition")){
      usingFallback = true;
      setHint("تم تفعيل وضع التوافق. (يفضل إنشاء Index في Firebase لسرعة أفضل)");
      loading = false;
      btnMore.disabled = false;
      return loadMore(true);
    }

    setHint("فشل تحميل الإعلانات. جرّب تحديث الصفحة.");
    showEmpty(true);
    btnMore.style.display = "none";
  }finally{
    loading = false;
    btnMore.disabled = false;
  }
}

const btnShare = document.getElementById("btnShareStore");

if (btnShare) {
  btnShare.onclick = async () => {
    const title = document.getElementById("sellerTitle")?.textContent || "إعلانات بائع";
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `شوف ${title} على سوق سوريا`,
          url
        });
      } catch (e) {}
    } else {
      await navigator.clipboard.writeText(url);
      alert("تم نسخ رابط صفحة التاجر 📋");
    }
  };
}
btnMore.onclick = () => loadMore(false);
loadMore(true);