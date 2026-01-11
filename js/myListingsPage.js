import { getSupabase } from "./supabase.js";
import { getGuestId } from "./guest.js";
import { escapeHtml, formatPrice } from "./utils.js";

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
      <div class="favOverlay" title="مفضلة">♡</div>
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

  wrap.addEventListener("click", () => {
    location.href = `./index.html#listing=${encodeURIComponent(id)}`;
  });
  return wrap;
}

async function loadMyListings(){
  const listEl = document.getElementById("myList");
  const emptyEl = document.getElementById("myEmpty");
  if (!listEl) return;

  const sb = getSupabase();
  const guestId = getGuestId();

  try{
    // meta->>owner_guest_id equals guestId
    const { data: items, error } = await sb
      .from("listings")
      .select("*")
      .filter("meta->>owner_guest_id", "eq", guestId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    listEl.innerHTML = "";
    emptyEl && (emptyEl.style.display = (items?.length ? "none" : "block"));
    (items || []).forEach(it => listEl.appendChild(renderCard(it)));
  }catch(e){
    console.warn(e);
    toast("تعذر تحميل إعلاناتي");
  }
}

loadMyListings();
