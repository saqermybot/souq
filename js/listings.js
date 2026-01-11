// listings.js (Supabase)
// - Home cards (تصميم قديم) + تفاصيل + معرض صور
// - Counters: view_count / fav_count on listings + toggle via RPC

import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";
import { getSupabase } from "./supabase.js";
import { getGuestId } from "./guest.js";

const LIST_PAGE_SIZE = 12;
const VIEW_TTL_MS = 2 * 60 * 1000; // 2 minutes

function el(id){ return document.getElementById(id); }

function getCatMaps(){ return globalThis.__CATS || null; }

function expandCategoryFilter(catId){
  const maps = getCatMaps();
  if (!maps || !catId) return [catId];
  const children = maps.getChildren(catId) || [];
  const ids = [catId, ...children.map(c => c.id)];
  return [...new Set(ids.filter(Boolean))];
}

function viewKey(listingId){ return `viewed:${listingId}`; }

async function bumpViewCount(listingId){
  if (!listingId) return;
  try{
    const last = Number(localStorage.getItem(viewKey(listingId)) || 0) || 0;
    const now = Date.now();
    if (last && (now - last) < VIEW_TTL_MS) return;
    localStorage.setItem(viewKey(listingId), String(now));
  }catch{}

  const sb = getSupabase();
  // Atomic increment via RPC (security definer)
  try{ await sb.rpc("listing_inc_view", { p_id: listingId }); }catch{}
}

async function toggleFavorite(listingId){
  const sb = getSupabase();
  const guestId = getGuestId();
  const { data, error } = await sb.rpc("listing_toggle_fav", { p_id: listingId, p_guest: guestId });
  if (error) throw error;
  // data is an array with 1 row in PostgREST
  const row = Array.isArray(data) ? data[0] : data;
  return {
    isFav: !!row?.is_fav,
    favCount: Number(row?.fav_count || 0) || 0,
  };
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

  query = query.eq("is_active", true);
  if (city) query = query.eq("city", city);
  if (cat){
    const ids = expandCategoryFilter(cat);
    query = query.in("category_id", ids);
  }
  if (q){
    const safe = q.replace(/[%_]/g, "\\$&");
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  UI.state.lastDoc = offset + (data?.length || 0);
  const hasMore = (UI.state.lastDoc || 0) < (count || 0);
  return { items: data || [], hasMore, count: count || 0 };
}

function renderListings(items, { append = false } = {}){
  const wrap = UI.el.listings || el("listings");
  if (!wrap) return;
  if (!append) wrap.innerHTML = "";

  const frag = document.createDocumentFragment();
  for (const it of items) frag.appendChild(renderCard(it));
  wrap.appendChild(frag);

  UI.setEmptyState?.((!wrap.children.length));
}

function renderCard(it){
  const card = document.createElement("div");
  card.className = "cardItem";

  const id = it.id;
  const title = escapeHtml(it.title || "");
  const city = escapeHtml(it.city || "");
  const price = (it.price != null && it.price !== "") ? formatPrice(it.price, it.currency) : "";
  const img = (it.images && Array.isArray(it.images) && it.images[0]) ? it.images[0] : "";
  const viewCount = Number(it.view_count || 0) || 0;
  const favCount = Number(it.fav_count || 0) || 0;

  card.innerHTML = `
    <div class="cardMedia">
      ${img ? `<img src="${escapeHtml(img)}" alt="">` : `<img src="" alt="" style="display:none">`}
      <div class="favOverlay" data-fav="${escapeHtml(String(id))}" title="مفضلة">♡</div>
    </div>
    <div class="p">
      <div class="t">${title || "بدون عنوان"}</div>
      <div class="m">${city || ""}</div>
      <div class="pr">${price || ""}</div>
      <div class="cardStats">
        <span>👁 ${viewCount}</span>
        <span>❤ ${favCount}</span>
      </div>
    </div>
  `;

  // Favorite button
  const favBtn = card.querySelector(".favOverlay");
  favBtn?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    try{
      const { isFav, favCount: n } = await toggleFavorite(id);
      favBtn.classList.toggle("isFav", isFav);
      favBtn.textContent = isFav ? "❤" : "♡";
      const stat = card.querySelector(".cardStats span:nth-child(2)");
      if (stat) stat.textContent = `❤ ${n}`;
    }catch(e){
      console.warn(e);
      UI.toast?.("تعذر تحديث المفضلة");
    }
  });

  // Open details
  card.addEventListener("click", () => {
    UI.actions.openDetails?.(id);
  });

  return card;
}

async function openDetails(listingId){
  if (!listingId) return;
  const sb = getSupabase();

  try{
    // Fetch item
    const { data, error } = await sb
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .maybeSingle();
    if (error) throw error;
    const it = data;
    if (!it) throw new Error("NOT_FOUND");

    // bump views (best-effort)
    bumpViewCount(listingId);

    // Render details UI
    UI.showDetailsPage?.();
    if (UI.el.dTitle) UI.el.dTitle.textContent = it.title || "بدون عنوان";
    if (UI.el.dPrice) UI.el.dPrice.textContent = (it.price != null && it.price !== "") ? formatPrice(it.price, it.currency) : "";
    if (UI.el.dDesc) UI.el.dDesc.textContent = it.description || "";

    const metaParts = [];
    if (it.city) metaParts.push(it.city);
    if (it.category_id) metaParts.push(it.category_id);
    if (UI.el.dMeta) UI.el.dMeta.textContent = metaParts.join(" • ");

    const views = Number(it.view_count || 0) || 0;
    const favs = Number(it.fav_count || 0) || 0;
    if (UI.el.dStats) UI.el.dStats.innerHTML = `<span>👁 ${views}</span> <span>❤ ${favs}</span>`;

    const imgs = (it.images && Array.isArray(it.images)) ? it.images.filter(Boolean) : [];
    UI.renderGallery?.(imgs);

    // hash for share/back
    try{ location.hash = `#listing=${encodeURIComponent(listingId)}`; }catch{}
  }catch(e){
    console.warn(e);
    UI.toast?.("تعذر فتح الإعلان");
  }
}

async function loadListings(reset = true){
  const btn = UI.el.btnMore || el("btnMore");
  if (reset){
    UI.state.lastDoc = 0;
    if (btn){ btn.disabled = true; btn.classList.add("hidden"); }
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
    if (btn){ btn.disabled = true; btn.classList.add("hidden"); }
  }
}

export function initListings(){
  UI.el.listings = UI.el.listings || el("listings");
  UI.el.btnMore = UI.el.btnMore || el("btnMore");

  // expose actions
  UI.actions.openDetails = openDetails;

  loadListings(true);

  if (UI.el.btnMore){
    UI.el.btnMore.addEventListener("click", () => loadListings(false));
  }

  const reload = () => loadListings(true);
  el("cityFilter")?.addEventListener("change", reload);
  el("catFilter")?.addEventListener("change", reload);
  el("qSearch")?.addEventListener("input", () => {
    clearTimeout(globalThis.__qT);
    globalThis.__qT = setTimeout(reload, 300);
  });

  el("btnResetFilters")?.addEventListener("click", () => {
    const q = el("qSearch"); if (q) q.value = "";
    const c = el("cityFilter"); if (c) c.value = "";
    const cat = el("catFilter"); if (cat) cat.value = "";
    reload();
  });
}
