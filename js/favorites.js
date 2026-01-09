// favorites.js
// ✅ Per-user favorites + global counters (favCount + viewCount)
//
// IMPORTANT:
// - Counters live ONLY in: listingStats/{listingId}
// - NEVER do setDoc({favCount:0, viewCount:0}, {merge:true}) on every action
//   because that resets counters and causes unstable numbers.

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { ensureUser } from "./auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  runTransaction,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   ✅ Toast (fallback)
========================= */
function toast(msg){
  try{
    if (typeof UI.toast === "function") return UI.toast(msg);
  }catch{}
  try{ alert(msg); }catch{}
}

/* =========================
   ✅ Refs
========================= */
function favDocRef(uid, listingId){
  return doc(db, "users", uid, "favorites", listingId);
}

function statsRef(listingId){
  return doc(db, "listingStats", listingId);
}

/* =========================
   ✅ Stats read
========================= */
export async function getListingStats(listingId){
  if (!listingId) return { favCount: 0, viewCount: 0 };
  try{
    const snap = await getDoc(statsRef(listingId));
    const data = snap.exists() ? (snap.data() || {}) : {};
    return {
      favCount: Number(data.favCount || 0) || 0,
      viewCount: Number(data.viewCount || 0) || 0,
    };
  }catch{
    return { favCount: 0, viewCount: 0 };
  }
}

/* =========================
   ✅ Auth helper for guests
========================= */
export async function requireUserForFav(){
  try{ await ensureUser(); return true; }catch{ return false; }
}

/* =========================
   ✅ Read favorites for a list of listings (12-24 is fine)
========================= */
export async function getFavoriteSet(listingIds = []){
  const uid = auth.currentUser?.uid || "";
  const ids = Array.from(new Set((listingIds || []).filter(Boolean)));
  if (!uid || !ids.length) return new Set();

  const results = await Promise.all(
    ids.map(async (id) => {
      try{
        const snap = await getDoc(favDocRef(uid, id));
        return snap.exists() ? id : null;
      }catch{
        return null;
      }
    })
  );

  return new Set(results.filter(Boolean));
}

/* =========================
   ✅ Toggle favorite
   - per-user doc: users/{uid}/favorites/{listingId}
   - global counter: listingStats/{listingId}.favCount
   - transaction-safe
========================= */
export async function toggleFavorite(listingId){
  if (!listingId) return { ok:false };
  if (!(await requireUserForFav())) return { ok:false, needAuth:true };

  const uid = auth.currentUser.uid;
  const favRef = favDocRef(uid, listingId);
  const sRef = statsRef(listingId);

  try{
    return await runTransaction(db, async (tx) => {
      const favSnap = await tx.get(favRef);
      const sSnap = await tx.get(sRef);

      const wasFav = favSnap.exists();
      const delta = wasFav ? -1 : 1;

      // 1) toggle per-user favorite
      if (wasFav) {
        tx.delete(favRef);
      } else {
        tx.set(favRef, { listingId, createdAt: serverTimestamp() }, { merge: true });
      }

      // 2) update global favCount (do NOT reset viewCount)
      const prev = Number(sSnap.data()?.favCount || 0) || 0;
      const next = Math.max(0, prev + delta);

      if (sSnap.exists()) {
        tx.set(sRef, { favCount: next, updatedAt: Date.now() }, { merge: true });
      } else {
        // seed viewCount once (optional)
        tx.set(sRef, { favCount: next, viewCount: 0, updatedAt: Date.now() }, { merge: true });
      }

      return { ok:true, isFav: !wasFav, favCount: next };
    });
  }catch(e){
    console.warn("toggleFavorite failed", e);
    toast("تعذر تحديث المفضلة. جرّب مرة ثانية.");
    return { ok:false, error: e?.message || String(e) };
  }
}

/* =========================
   ✅ Views counter (increment on details open)
========================= */
const VIEW_TTL_MS = 2 * 60 * 1000; // 2 minutes

function viewKey(listingId){
  return `viewed:${listingId}`;
}

export async function bumpViewCount(listingId){
  if (!listingId) return;

  // Ensure we have a guest session; rules require signedIn() for listingStats writes.
  try{ await ensureUser(); }catch{}

  // gate with localStorage
  try{
    const k = viewKey(listingId);
    const last = Number(localStorage.getItem(k) || 0) || 0;
    const now = Date.now();
    if (last && (now - last) < VIEW_TTL_MS) return;
    localStorage.setItem(k, String(now));
  }catch{}

  try{
    // setDoc+increment works even if the document doesn't exist (merge will create it)
    await setDoc(
      statsRef(listingId),
      { viewCount: increment(1), updatedAt: Date.now() },
      { merge: true }
    );
  }catch(e){
    console.warn("bumpViewCount failed", e);
  }
}
