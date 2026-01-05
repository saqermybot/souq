import { db } from "./firebase.js";
import { escapeHtml, formatPrice } from "./utils.js";

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const grid = document.getElementById("grid");
const sellerTitle = document.getElementById("sellerTitle");
const sellerSub = document.getElementById("sellerSub");
const emptyBox = document.getElementById("emptyBox");
const btnMore = document.getElementById("btnMore");
const hint = document.getElementById("hint");
const countBadge = document.getElementById("countBadge");

function getParam(name){
  return new URLSearchParams(location.search).get(name) || "";
}

const sellerUid = getParam("u").trim();

let lastDoc = null;
let loading = false;
let totalShown = 0;
let usingFallback = false;

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
  // Firestore Timestamp or Date or number
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

function cardHtml(id, data){
  const img = (data.images && data.images[0]) ? data.images[0] : "";
  const city = escapeHtml(data.city || "");
  const cat  = escapeHtml(data.category || data.categoryNameAr || data.categoryId || "");
  const title = escapeHtml(data.title || "بدون عنوان");
  const price = escapeHtml(formatPrice(data.price, data.currency));

  const url = `index.html#listing=${encodeURIComponent(id)}`;

  return `
    <div class="card" data-url="${url}">
      <img src="${img}" alt="" loading="lazy" />
      <div class="p">
        <div class="t">${title}</div>
        <div class="m">${city}${(city && cat) ? " • " : ""}${cat}</div>
        <div class="pr">${price}</div>
      </div>
    </div>
  `;
}

function appendCard(id, data){
  const wrap = document.createElement("div");
  wrap.innerHTML = cardHtml(id, data);
  const card = wrap.firstElementChild;

  card.onclick = () => {
    const url = card.getAttribute("data-url");
    if (url) location.href = url;
  };

  grid.appendChild(card);
}

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

async function queryFallbackAll(limitCount){
  // بدون orderBy لتجنب الـ index
  const qy = query(
    collection(db, "listings"),
    where("ownerId", "==", sellerUid),
    limit(limitCount)
  );
  return await getDocs(qy);
}

async function loadMore(reset=false){
  if (!sellerUid) {
    sellerTitle.textContent = "خطأ";
    sellerSub.textContent = "لا يوجد معرف بائع في الرابط (u=...)";
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
    setCount(0);
    showEmpty(false);
  }

  setHint("جاري تحميل الإعلانات...");

  try{
    let snap;

    if (!usingFallback){
      // ✅ حاول الاستعلام السريع (يتطلب index)
      snap = await queryWithIndex(12);
    } else {
      // fallback: حمّل كتلة أكبر مرة وحدة (بدون pagination حقيقي)
      snap = await queryFallbackAll(80);
    }

    // لو فاضي
    if (snap.empty){
      if (totalShown === 0){
        sellerTitle.textContent = "إعلانات البائع";
        sellerSub.textContent = `ID: ${sellerUid.slice(0, 8)}...`;
      }
      showEmpty(true);
      btnMore.style.display = "none";
      setHint("");
      return;
    }

    // اسم البائع من أول إعلان
    if (totalShown === 0){
      const first = snap.docs[0]?.data?.();
      const name = (first?.sellerName || "").toString().trim();
      sellerTitle.textContent = name ? `إعلانات ${name}` : "إعلانات البائع";
      sellerSub.textContent = `ID: ${sellerUid.slice(0, 8)}...`;
    }

    let docs = snap.docs;

    // لو fallback: رتّب محلياً حسب createdAt
    if (usingFallback){
      docs = [...docs].sort((a,b) => {
        const ta = tsToMillis(a.data()?.createdAt);
        const tb = tsToMillis(b.data()?.createdAt);
        return tb - ta;
      });
    }

    let added = 0;

    docs.forEach(ds=>{
      const data = ds.data();
      if (data.isActive === false) return;
      // لو reset=false وبالـ fallback، ممكن تتكرر (لأننا نجيب كلهم مرة وحدة)
      // لتبسيط الأمور: نعرض فقط أول مرة
      if (usingFallback && totalShown > 0) return;

      appendCard(ds.id, data);
      added++;
    });

    totalShown += added;
    setCount(totalShown);

    showEmpty(grid.children.length === 0);

    if (!usingFallback){
      lastDoc = snap.docs[snap.docs.length - 1];

      if (snap.docs.length < 12){
        btnMore.style.display = "none";
      } else {
        btnMore.style.display = "inline-flex";
      }
      setHint("");
    } else {
      btnMore.style.display = "none";
      setHint(""); // fallback يعرض دفعة واحدة
    }

  }catch(e){
    console.error(e);

    // ✅ لو المشكلة Index
    const msg = String(e?.message || "");
    if (msg.toLowerCase().includes("index") || msg.toLowerCase().includes("failed-precondition")){
      usingFallback = true;
      setHint("تم تفعيل وضع التوافق. (يفضل إنشاء Index في Firebase لسرعة أفضل)");
      // جرّب مباشرة fallback
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

btnMore.onclick = () => loadMore(false);
loadMore(true);