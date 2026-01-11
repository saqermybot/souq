import { getSupabase } from "./supabase.js";
import { getGuestId } from "./guest.js";
import { escapeHtml, formatPrice } from "./utils.js";


function favStoreKey(){ return `souq_favs:${getGuestId()}`; }
function loadFavIdsLocal(){
  try{
    const raw = localStorage.getItem(favStoreKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  }catch{ return []; }
}

function toast(msg){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = String(msg || "");
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { try{ el.classList.add("hidden"); }catch{} }, 1800);
}

function renderCard(it){
  const id = it.id;
  const title = escapeHtml(it.title || "");
  const city = escapeHtml(it.city || "");
  const price = (it.price != null && it.price !== "") ? formatPrice(it.price, it.currency) : "";
  const img = (it.images && Array.isArray(it.images) && it.images[0]) ? it.images[0] : "";
  const viewCount = Number(it.view_count || 0) || 0;
  const favCount = Number(it.fav_count || 0) || 0;

  const wrap = document.createElement("div");
  wrap.className = "cardItem";
  wrap.innerHTML = `
    <div class="cardMedia">
      ${img ? `<img src="${escapeHtml(img)}" alt="">` : `<img src="" alt="" style="display:none">`}
      <div class="favOverlay isFav" title="مفضلة"><span class="heartIcon" aria-hidden="true">♥</span></div>
    </div>
    <div class="p">
      <div class="t">${title || "بدون عنوان"}</div>
      <div class="m">${city || ""}</div>
      <div class="pr">${price || ""}</div>
      <div class="cardStats">
        <span>👁 ${viewCount}</span>
        <span><span class="heartIcon" aria-hidden="true">♥</span> ${favCount}</span>
      </div>
    </div>
  `;

  wrap.addEventListener("click", () => {
    // Open details in home page
    location.href = `./index.html#listing=${encodeURIComponent(id)}`;
  });

  return wrap;
}

async function loadFavorites(){
  const listEl = document.getElementById("favList");
  const emptyEl = document.getElementById("favEmpty");
  if (!listEl) return;

  const sb = getSupabase();
  const guestId = getGuestId();

  try{
    // 1) get favorite listing ids for this guest
    const { data: favRows, error: favErr } = await sb
      .from("listing_favorites")
      .select("listing_id")
      .eq("guest_id", guestId)
      .order("created_at", { ascending: false });
    if (favErr) throw favErr;

    const ids = (favRows || []).map(r => r.listing_id).filter(Boolean);
    if (!ids.length){
      listEl.innerHTML = "";
      emptyEl && (emptyEl.style.display = "block");
      return;
    }

    // 2) fetch listings
    const { data: items, error: itemsErr } = await sb
      .from("listings")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (itemsErr) throw itemsErr;

    listEl.innerHTML = "";
    emptyEl && (emptyEl.style.display = (items?.length ? "none" : "block"));
    (items || []).forEach(it => listEl.appendChild(renderCard(it)));
  }catch(e){
    console.warn(e);
    const idsLocal = loadFavIdsLocal();
    if (idsLocal.length){
      try{
        const { data: items, error: itemsErr } = await sb
          .from("listings")
          .select("*")
          .in("id", idsLocal)
          .order("created_at", { ascending: false });
        if (!itemsErr){
          listEl.innerHTML = "";
          emptyEl && (emptyEl.style.display = (items?.length ? "none" : "block"));
          (items || []).forEach(it => listEl.appendChild(renderCard(it)));
          return;
        }
      }catch{}
    }
    toast("تعذر تحميل المفضلة");
  }
}

loadFavorites();
