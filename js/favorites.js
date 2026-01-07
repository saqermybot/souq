// favorites.js
// ✅ Guest favorites + global counters via API (no Firebase Auth required)

import { UI } from "./ui.js";
import { apiFetch, ensureGuest } from "./apiClient.js";

function toast(msg){
  try{
    if (typeof UI.toast === "function") return UI.toast(msg);
  }catch{}
  try{ alert(msg); }catch{}
}

// Called before any "identity" action
export async function requireUserForFav(){
  await ensureGuest();
  return true;
}

// Read favorites for a list of listing IDs (used to paint ❤️ states)
export async function getFavoriteSet(listingIds = []){
  const ids = Array.from(new Set((listingIds || []).filter(Boolean)));
  if (!ids.length) return new Set();

  try{
    await ensureGuest();
    const data = await apiFetch("/api/favorites/list", {
      method: "POST",
      body: JSON.stringify({ listingIds: ids })
    });
    return new Set((data?.favorites || []).filter(Boolean));
  }catch(e){
    console.warn("getFavoriteSet failed:", e);
    return new Set();
  }
}

// Toggle favorite (server updates Firestore favCount + stores per-device state)
export async function toggleFavorite(listingId){
  if (!listingId) return { ok:false };
  await requireUserForFav();

  try{
    const data = await apiFetch(`/api/listings/${encodeURIComponent(listingId)}/favorite`, {
      method: "POST",
      body: "{}"
    });

    return {
      ok: true,
      isFav: !!data?.isFav,
      favCount: Number(data?.favCount || 0) || 0
    };
  }catch(e){
    toast(e?.message || "تعذر تحديث المفضلة");
    return { ok:false };
  }
}

/* =========================
   ✅ Views counter (with client TTL)
========================= */

const VIEW_TTL_MS = 2 * 60 * 1000; // 2 minutes

function viewKey(listingId){
  return `viewed:${listingId}`;
}

export async function bumpViewCount(listingId){
  if (!listingId) return;

  // gate with localStorage to avoid spam
  try{
    const k = viewKey(listingId);
    const last = Number(localStorage.getItem(k) || 0) || 0;
    const now = Date.now();
    if (last && (now - last) < VIEW_TTL_MS) return;
    localStorage.setItem(k, String(now));
  }catch{}

  try{
    // No need to ensureGuest for views (optional), but do it to link abuse
    await ensureGuest();
    await apiFetch(`/api/listings/${encodeURIComponent(listingId)}/view`, {
      method: "POST",
      body: "{}"
    });
  }catch{}
}
