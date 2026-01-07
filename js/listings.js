// listings.js (API version)
// ✅ نسخة مبسطة وسريعة تعمل بسوريا بدون Firebase/Auth
// - تحميل الإعلانات + فلترة
// - صفحة تفاصيل + WhatsApp
// - قلب (مفضلة) + تبليغ (عبر API)

import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";
import { ensureGuest } from "./guest.js";
import { API } from "./apiClient.js";

// =========================
// Helpers
// =========================
function $id(id){ return document.getElementById(id); }

function normalizeCat(v){
  const s = (v || "").toString().trim();
  return s;
}

function getFilters(){
  const keyword = (UI.el.qSearch?.value || "").trim();
  const useFilters = !!UI.state.filtersActive;
  return {
    q: keyword,
    city: useFilters ? (UI.el.cityFilter?.value || "") : "",
    cat:  useFilters ? normalizeCat(UI.el.catFilter?.value || "") : ""
  };
}

function listingCardHtml(x, isFav){
  const img = (x.images && x.images[0]) ? x.images[0] : "";
  const cityTxt = escapeHtml(x.city || "");
  const catTxt  = escapeHtml(x.categoryNameAr || x.categoryId || "");
  const sellerName = escapeHtml(x.sellerName || "مستخدم");
  const viewsC = Number(x.viewsCount || 0) || 0;
  const favC = Number(x.favCount || 0) || 0;

  return `
    <div class="cardMedia">
      <img src="${img}" alt="" />
      <button class="favBtn favOverlay ${isFav ? "isFav" : ""}" type="button" aria-label="مفضلة">♥</button>
    </div>
    <div class="p">
      <div class="t">${escapeHtml(x.title || "بدون عنوان")}</div>
      <div class="m">${cityTxt}${(cityTxt && catTxt) ? " • " : ""}${catTxt}</div>
      <div class="sellerLine">البائع: <span class="sellerName">${sellerName}</span></div>
      <div class="priceRow">
        <div class="price">${escapeHtml(formatPrice(x.price || 0, x.currency || "SYP"))}</div>
        <div class="stats">👁️ ${viewsC} • ❤️ <span class="favCount">${favC}</span></div>
      </div>
    </div>
  `;
}

// =========================
// Init
// =========================
export function initListings(){
  // actions
  UI.actions.loadListings = loadListings;
  UI.actions.openDetails = openDetails;

  if (UI.el.btnMore){
    UI.el.btnMore.onclick = () => loadListings(false);
  }

  // Filters live
  const trigger = () => {
    UI.state.filtersActive = true;
    loadListings(true);
  };
  if (UI.el.qSearch) UI.el.qSearch.addEventListener("input", () => trigger());
  if (UI.el.cityFilter) UI.el.cityFilter.addEventListener("change", () => trigger());
  if (UI.el.catFilter) UI.el.catFilter.addEventListener("change", () => trigger());
}

let _cursor = null;
let _loading = false;

async function loadListings(reset = true){
  if (!UI.el.listings || _loading) return;
  _loading = true;

  try{
    if (reset){
      UI.el.listings.innerHTML = "";
      _cursor = null;
      if (UI.el.btnMore){
        UI.el.btnMore.disabled = false;
        UI.el.btnMore.classList.add("hidden");
      }
    }

    const { q, city, cat } = getFilters();
    const res = await API.listings({
      limit: 12,
      cursor: _cursor || "",
      q,
      city,
      cat
    });

    const items = Array.isArray(res?.items) ? res.items : [];
    _cursor = res?.nextCursor || null;

    // favorites state for these items (server)
    let favSet = new Set();
    try{
      const ids = items.map(x => x.id);
      if (ids.length){
        const s = await API.favSet(ids);
        favSet = new Set((s?.ids || []));
      }
    }catch{}

    const frag = document.createDocumentFragment();
    for (const x of items){
      if (x.isActive === false) continue;
      const card = document.createElement("div");
      card.className = "cardItem";
      card.innerHTML = listingCardHtml(x, favSet.has(x.id));

      // open details
      card.addEventListener("click", (e) => {
        const t = e.target;
        if (t && t.classList && t.classList.contains("favBtn")) return;
        openDetails(x.id, x, false);
      });

      // fav
      const favBtn = card.querySelector(".favBtn");
      if (favBtn){
        favBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try{
            await ensureGuest();
            favBtn.disabled = true;
            const on = !favBtn.classList.contains("isFav");
            const out = await API.fav(x.id, on);
            favBtn.classList.toggle("isFav", !!out.isFav);
            const fc = card.querySelector(".favCount");
            if (fc) fc.textContent = String(out.favCount ?? 0);
          }catch(err){
            alert(err?.message || "فشل تحديث المفضلة");
          }finally{
            favBtn.disabled = false;
          }
        };
      }

      frag.appendChild(card);
    }

    UI.el.listings.appendChild(frag);
    UI.setEmptyState(UI.el.listings.children.length === 0);

    if (UI.el.btnMore){
      UI.el.btnMore.classList.toggle("hidden", !_cursor);
      UI.el.btnMore.disabled = !_cursor;
    }
  }catch(e){
    console.error(e);
    UI.toast("تعذر تحميل الإعلانات. جرّب مرة ثانية");
  }finally{
    _loading = false;
  }
}

// =========================
// Details
// =========================
async function openDetails(id, data = null, fromHash = false){
  try{
    const x = data || await API.listing(id);
    UI.state.currentListing = x;
    UI.showDetailsPage();

    // update URL hash
    if (!fromHash) {
      try{ location.hash = `listing=${encodeURIComponent(id)}`; }catch{}
    }

    UI.renderGallery(x.images || []);
    if (UI.el.dTitle) UI.el.dTitle.textContent = x.title || "";
    if (UI.el.dMeta) UI.el.dMeta.textContent = `${x.city || ""}${(x.city && (x.categoryNameAr || x.categoryId)) ? " • " : ""}${(x.categoryNameAr || x.categoryId || "")}`;
    if (UI.el.dPrice) UI.el.dPrice.textContent = formatPrice(x.price || 0, x.currency || "SYP");

    // Description
    const descEl = UI.el.dDesc || $id("dDesc");
    if (descEl) descEl.textContent = x.description || "";

    // Seller line
    if (UI.el.dSeller){
      const sellerName = escapeHtml(x.sellerName || "مستخدم");
      UI.el.dSeller.innerHTML = `البائع: <span class="sellerName">${sellerName}</span>`;
      UI.el.dSeller.classList.remove("hidden");
    }

    // View count (best-effort)
    try{ await API.viewListing(id); }catch{}

    // Stats
    const viewsNow = Number(x.viewsCount || 0) || 0;
    const favNow = Number(x.favCount || 0) || 0;
    if (UI.el.dStats) UI.el.dStats.textContent = `👁️ ${viewsNow} • ❤️ ${favNow}`;
    if (UI.el.dFavCount) UI.el.dFavCount.textContent = String(favNow);

    // Details fav
    if (UI.el.btnFav){
      UI.el.btnFav.disabled = false;
      UI.el.btnFav.classList.toggle("isFav", !!x.isFav);

      UI.el.btnFav.onclick = async () => {
        try{
          await ensureGuest();
          UI.el.btnFav.disabled = true;
          const on = !UI.el.btnFav.classList.contains("isFav");
          const out = await API.fav(id, on);
          UI.el.btnFav.classList.toggle("isFav", !!out.isFav);
          if (UI.el.dFavCount) UI.el.dFavCount.textContent = String(out.favCount ?? 0);
        }catch(e){
          alert(e?.message || "فشل تحديث المفضلة");
        }finally{
          UI.el.btnFav.disabled = false;
        }
      };
    }

    // WhatsApp
    const waBtn = UI.el.btnWhatsapp || $id("btnWhatsapp");
    if (waBtn){
      const wa = (x.whatsapp || "").toString().trim();
      if (!wa){
        waBtn.classList.add("hidden");
      } else {
        waBtn.classList.remove("hidden");
        waBtn.onclick = () => {
          const url = `https://wa.me/${encodeURIComponent(wa)}?text=${encodeURIComponent(x.title || "")}`;
          window.open(url, "_blank");
        };
      }
    }

    // Report
    const reportBtn = UI.el.btnReportListing || $id("btnReportListing");
    if (reportBtn){
      reportBtn.onclick = async () => {
        try{
          await ensureGuest();
          const reason = prompt("سبب التبليغ (مثال: نصب / إعلان مخالف / رقم خطأ)") || "";
          if (!reason.trim()) return;
          reportBtn.disabled = true;
          await API.report({ listingId: id, reason: reason.trim() });
          UI.toast("تم إرسال التبليغ ✅");
        }catch(e){
          alert(e?.message || "فشل إرسال التبليغ");
        }finally{
          reportBtn.disabled = false;
        }
      };
    }

  }catch(e){
    alert("الإعلان غير موجود أو تم حذفه.");
  }
}
