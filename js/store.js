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

function showEmpty(show){
  emptyBox.classList.toggle("hidden", !show);
}

function setHint(msg=""){
  hint.textContent = msg;
}

function setCount(n){
  countBadge.textContent = String(n || 0);
}

function cardHtml(id, data){
  const img = (data.images && data.images[0]) ? data.images[0] : "";
  const city = escapeHtml(data.city || "");
  const cat  = escapeHtml(data.category || data.categoryNameAr || data.categoryId || "");
  const title = escapeHtml(data.title || "بدون عنوان");
  const price = escapeHtml(formatPrice(data.price, data.currency));

  // فتح تفاصيل الإعلان ضمن السوق (أخف من بناء تفاصيل هنا)
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

  // click opens listing in main page
  card.onclick = () => {
    const url = card.getAttribute("data-url");
    if (url) location.href = url;
  };

  grid.appendChild(card);
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
    setCount(0);
    showEmpty(false);
  }

  setHint("جاري تحميل الإعلانات...");

  try{
    // ✅ خفيف: نجلب من listings مباشرة (بدون users)
    // فقط active + ownerId == sellerUid
    let qy = query(
      collection(db, "listings"),
      where("ownerId", "==", sellerUid),
      orderBy("createdAt", "desc"),
      limit(12)
    );

    if (lastDoc){
      qy = query(
        collection(db, "listings"),
        where("ownerId", "==", sellerUid),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(12)
      );
    }

    const snap = await getDocs(qy);

    if (!snap.empty){
      lastDoc = snap.docs[snap.docs.length - 1];
    }

    // عرض الاسم من أول إعلان إن وجد (أخف من قراءة users)
    if (totalShown === 0){
      const first = snap.docs[0]?.data?.();
      const name = (first?.sellerName || "").toString().trim();
      sellerTitle.textContent = name ? `إعلانات ${name}` : "إعلانات البائع";
      sellerSub.textContent = `ID: ${sellerUid.slice(0, 8)}...`;
    }

    let added = 0;

    snap.forEach(ds=>{
      const data = ds.data();
      if (data.isActive === false) return;
      appendCard(ds.id, data);
      added++;
    });

    totalShown += added;
    setCount(totalShown);

    if (grid.children.length === 0){
      showEmpty(true);
      btnMore.style.display = "none";
      setHint("");
      return;
    }

    showEmpty(false);

    // إذا رجع أقل من 12 غالباً خلصت النتائج
    if (snap.docs.length < 12){
      btnMore.style.display = "none";
      setHint("");
    }else{
      btnMore.style.display = "inline-flex";
      setHint("");
    }

  }catch(e){
    console.error(e);
    setHint("فشل تحميل الإعلانات. جرّب تحديث الصفحة.");
  }finally{
    loading = false;
    btnMore.disabled = false;
  }
}

btnMore.onclick = () => loadMore(false);

// أول تحميل
loadMore(true);
