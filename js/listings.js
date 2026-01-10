// listings.js (Supabase minimal)
// هدف هذا الملف: عرض الإعلانات + فلترة أساسية + تحميل المزيد
// ملاحظة: تم إلغاء الاعتماد على Firebase/Firestore لتجنب مشاكل الوصول في سوريا.

import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";
import { getSupabase } from "./supabase.js";

const LIST_PAGE_SIZE = 12;

function el(id){ return document.getElementById(id); }

function getCatMaps(){
  return globalThis.__CATS || null;
}

function expandCategoryFilter(catId){
  const maps = getCatMaps();
  if (!maps || !catId) return [catId];
  const children = maps.getChildren(catId) || [];
  const ids = [catId, ...children.map(c => c.id)];
  // remove duplicates
  return [...new Set(ids)];
}

async function fetchListings({ reset = true } = {}){
  const sb = getSupabase();

  const q = (el("qSearch")?.value || "").trim();
  const city = (el("cityFilter")?.value || "").trim();
  const cat = (el("catFilter")?.value || "").trim();

  const offset = reset ? 0 : Number(UI.state.lastDoc || 0);
  const to = offset + LIST_PAGE_SIZE - 1;

  let query = sb
    .from("listings")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, to);

  // public active
  query = query.eq("is_active", true);

  if (city) query = query.eq("city", city);

  if (cat){
    const ids = expandCategoryFilter(cat);
    // in() expects array
    query = query.in("category_id", ids);
  }

  // بحث بسيط: على العنوان (إن توفر) + الوصف
  if (q){
    // ilike يحتاج PostgREST؛ نستخدم OR
    const safe = q.replace(/[%_]/g, "\\$&");
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  // next offset
  UI.state.lastDoc = offset + (data?.length || 0);
  const hasMore = (UI.state.lastDoc || 0) < (count || 0);

  return { items: data || [], hasMore, count: count || 0 };
}

function renderListings(items, { append = false } = {}){
  const wrap = UI.el.listings || el("listings");
  if (!wrap) return;

  if (!append) wrap.innerHTML = "";

  const frag = document.createDocumentFragment();

  for (const it of items){
    frag.appendChild(renderCard(it));
  }

  wrap.appendChild(frag);
}

function renderCard(it){
  const card = document.createElement("div");
  card.className = "listingCard";

  const title = escapeHtml(it.title || "");
  const city = escapeHtml(it.city || "");
  const price = (it.price != null && it.price !== "") ? formatPrice(it.price) : "";
  const category = escapeHtml(it.category_id || "");
  const img = (it.images && Array.isArray(it.images) && it.images[0]) ? it.images[0] : "";

  card.innerHTML = `
    <div class="lcImg">${img ? `<img src="${escapeHtml(img)}" alt="">` : ""}</div>
    <div class="lcBody">
      <div class="lcTitle">${title || "بدون عنوان"}</div>
      <div class="lcMeta">
        ${city ? `<span>${city}</span>` : ""}
        ${category ? `<span>•</span><span>${category}</span>` : ""}
      </div>
      <div class="lcPrice">${price}</div>
    </div>
  `;

  // open details (simple)
  card.addEventListener("click", () => {
    UI.toast?.(title || "إعلان") || alert(title || "إعلان");
  });

  return card;
}

async function loadListings(reset = true){
  const btn = UI.el.btnMore || el("btnMore");
  if (reset){
    UI.state.lastDoc = 0;
    if (btn){
      btn.disabled = true;
      btn.classList.add("hidden");
    }
  }

  try{
    const { items, hasMore } = await fetchListings({ reset });
    renderListings(items, { append: !reset });

    if (btn){
      btn.disabled = !hasMore;
      btn.classList.toggle("hidden", !hasMore);
    }
  }catch(e){
    console.error(e);
    UI.toast?.("تعذر تحميل الإعلانات") || alert("تعذر تحميل الإعلانات");
    if (btn){
      btn.disabled = true;
      btn.classList.add("hidden");
    }
  }
}

export function initListings(){
  // cache elements
  UI.el.listings = UI.el.listings || el("listings");
  UI.el.btnMore = UI.el.btnMore || el("btnMore");

  // initial load
  loadListings(true);

  // More
  if (UI.el.btnMore){
    UI.el.btnMore.addEventListener("click", () => loadListings(false));
  }

  // Filters triggers
  const reload = () => loadListings(true);
  el("cityFilter")?.addEventListener("change", reload);
  el("catFilter")?.addEventListener("change", reload);
  el("qSearch")?.addEventListener("input", () => {
    clearTimeout(globalThis.__qT);
    globalThis.__qT = setTimeout(reload, 300);
  });

  // Reset button if exists
  el("btnResetFilters")?.addEventListener("click", () => {
    const q = el("qSearch"); if (q) q.value = "";
    const c = el("cityFilter"); if (c) c.value = "";
    const cat = el("catFilter"); if (cat) cat.value = "";
    reload();
  });
}
