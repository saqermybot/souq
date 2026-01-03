import { db } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";
import {
  collection, getDocs, limit, orderBy, query, startAfter, where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * سلوك مثل Marktplaats:
 * - الافتراضي: كل الإعلانات (بدون فلترة مدينة/صنف)
 * - البحث: فلترة محلية على النتائج
 * - زر "تطبيق": يفعّل فلترة city/category
 */
let filtersApplied = false;

export function initListings(){
  UI.actions.loadListings = loadListings;
  UI.actions.openAdd = openAdd;
  UI.actions.openDetails = openDetails;

  // زر تطبيق = تفعيل فلترة المدينة/الصنف
  const oldApply = UI.el.btnApply.onclick;
  UI.el.btnApply.onclick = () => {
    filtersApplied = true;
    UI.actions.loadListings(true);
    if (oldApply && oldApply !== UI.el.btnApply.onclick) oldApply();
  };

  // زر مسح = رجوع للعرض العام + مسح البحث
  const oldReset = UI.el.btnReset.onclick;
  UI.el.btnReset.onclick = () => {
    filtersApplied = false;
    UI.el.cityFilter.value = "";
    UI.el.catFilter.value = "";
    UI.el.qSearch.value = "";
    UI.actions.loadListings(true);
    if (oldReset && oldReset !== UI.el.btnReset.onclick) oldReset();
  };

  // زر المراسلة من التفاصيل
  UI.el.btnChat.onclick = () => {
    if (!UI.state.currentListing) return;
    UI.actions.openChat(UI.state.currentListing.id, UI.state.currentListing.title);
  };

  // أول ما يفتح الموقع: عرض عام
  filtersApplied = false;
}

function openAdd(){
  UI.resetOverlays();
  UI.show(UI.el.addBox);
  UI.el.uploadStatus.textContent = "";
  UI.el.imgPreview.innerHTML = "";
}

function openDetails(id, data){
  UI.resetOverlays();
  UI.show(UI.el.details);

  UI.state.currentListing = { id, ...data };

  UI.renderGallery(data.images || []);
  UI.el.dTitle.textContent = data.title || "";
  UI.el.dMeta.textContent = `${data.city || ""} • ${data.category || ""}`;
  UI.el.dPrice.textContent = formatPrice(data.price, data.currency);
  UI.el.dDesc.textContent = data.description || "";
}

async function loadListings(reset=true){
  if (reset){
    UI.el.listings.innerHTML = "";
    UI.state.lastDoc = null;
    UI.el.btnMore.disabled = false;
  }

  // ✅ الافتراضي: كل الإعلانات (فقط isActive + orderBy createdAt)
  const wh = [ where("isActive","==",true) ];

  // ✅ لا نضيف فلترة city/category إلا إذا المستخدم ضغط "تطبيق"
  if (filtersApplied){
    if (UI.el.cityFilter.value) wh.push(where("city","==", UI.el.cityFilter.value));
    if (UI.el.catFilter.value) wh.push(where("category","==", UI.el.catFilter.value));
  }

  let qy = query(collection(db,"listings"), ...wh, orderBy("createdAt","desc"), limit(10));
  if (UI.state.lastDoc){
    qy = query(collection(db,"listings"), ...wh, orderBy("createdAt","desc"), startAfter(UI.state.lastDoc), limit(10));
  }

  const snap = await getDocs(qy);
  if (snap.docs.length) UI.state.lastDoc = snap.docs[snap.docs.length-1];

  const keyword = (UI.el.qSearch.value || "").trim().toLowerCase();
  let addedNow = 0;

  snap.forEach(ds=>{
    const data = ds.data();

    // ✅ البحث يبقى محلي فقط
    if (keyword){
      const t = String(data.title || "").toLowerCase();
      const d = String(data.description || "").toLowerCase();
      if (!t.includes(keyword) && !d.includes(keyword)) return;
    }

    const imgs = Array.isArray(data.images) ? data.images : [];
    const img0 = imgs[0] || "";

    const card = document.createElement("div");
    card.className = "cardItem";

    // كرت بسيط + صورة أولى (الأسهم بس رح نعملها بالتفاصيل)
    card.innerHTML = `
      <img src="${img0}" alt="" />
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>
        <div class="m">${escapeHtml(data.city||"")} • ${escapeHtml(data.category||"")}</div>
        <div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>
        <button class="secondary">عرض الإعلان</button>
      </div>
    `;

    // ✅ فتح التفاصيل عند الضغط على الزر أو على الكرت
    const open = () => openDetails(ds.id, data);
    card.querySelector("button").onclick = (e) => { e.stopPropagation(); open(); };
    card.onclick = open;

    UI.el.listings.appendChild(card);
    addedNow++;
  });

  UI.setEmptyState(UI.el.listings.children.length === 0);

  // زر المزيد
  if (!snap.docs.length && !reset) UI.el.btnMore.disabled = true;
}