// favorites.js
// ✅ Per-user favorites + global counters (favCount + viewsCount)
// IMPORTANT FIX (2026-01):
// - We DO NOT update fields inside /listings/{id} anymore.
//   Because many Firestore rules allow edits only for the owner/admin.
//   That was causing normal users to fail when they press ❤️ or open a listing.
// - We store counters in /listingStats/{listingId} instead (favCount, viewsCount).

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   ✅ Toast (دبلوماسي)
========================= */

function toast(msg){
  try{
    if (typeof UI.toast === "function") return UI.toast(msg);
  }catch{}
  try{ alert(msg); }catch{}
}

/* =========================
   ✅ Helpers
========================= */

function favDocRef(uid, listingId){
  return doc(db, "users", uid, "favorites", listingId);
}

function listingRef(listingId){
  return doc(db, "listings", listingId);
}

// ✅ Public stats doc (NOT owned by seller)
function statsRef(listingId){
  return doc(db, "listingStats", listingId);
}

// ✅ Unique view marker (prevents counting the same person twice)
function viewMarkerRef(listingId, fp){
  return doc(db, "views", `${listingId}_${fp}`);
}

function getFingerprint(){
  // userId if logged in
  const uid = auth.currentUser?.uid;
  if (uid) return uid;
  // otherwise stable random id stored in localStorage
  try{
    let fp = localStorage.getItem("souq_fp");
    if (!fp){
      fp = (crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
      localStorage.setItem("souq_fp", fp);
    }
    return fp;
  }catch{
    // worst case: fallback to time-based (may count more than once, but still works)
    return "guest_" + Date.now();
  }
}

export function requireUserForFav(){
  if (auth.currentUser) return true;
  toast("سجّل دخول لتضيف الإعلان للمفضلة ❤️");
  UI.actions.openAuth?.();
  return false;
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
   ✅ Toggle favorite (transaction-safe, updates global favCount)
========================= */

export async function toggleFavorite(listingId){
  if (!listingId) return { ok:false };
  if (!requireUserForFav()) return { ok:false, needAuth:true };

  const uid = auth.currentUser.uid;
  const favRef = favDocRef(uid, listingId);
  const lRef = listingRef(listingId); // read-only (exists check)
  const sRef = statsRef(listingId);

  return await runTransaction(db, async (tx) => {
    const favSnap = await tx.get(favRef);
    const lSnap = await tx.get(lRef);
    const sSnap = await tx.get(sRef);

    if (!lSnap.exists()) throw new Error("الإعلان غير موجود");

    const wasFav = favSnap.exists();
    const delta = wasFav ? -1 : 1;

    if (wasFav) tx.delete(favRef);
    else tx.set(favRef, { listingId, createdAt: serverTimestamp() }, { merge: true });

    // ✅ Update public stats instead of /listings (avoids permission issues for normal users)
    tx.set(sRef, { favCount: increment(delta) }, { merge: true });

    const prev = Number(sSnap.exists() ? (sSnap.data()?.favCount || 0) : 0) || 0;
    const next = Math.max(0, prev + delta);

    return { ok:true, isFav: !wasFav, favCount: next };
  });
}

/* =========================
   ✅ Views counter ("ضغطة حقيقية")
   - يزيد عند فتح صفحة التفاصيل
   - يمنع الزيادة المتكررة السريعة لنفس الإعلان (TTL)
========================= */

export async function bumpViewCount(listingId){
  if (!listingId) return;

  // ✅ count only once per fingerprint (userId or guest fp)
  const fp = getFingerprint();
  const marker = viewMarkerRef(listingId, fp);
  const sRef = statsRef(listingId);

  try{
    const snap = await getDoc(marker);
    if (snap.exists()) return;

    // create marker + increment stats (best effort)
    await setDoc(marker, { listingId, fp, createdAt: serverTimestamp() }, { merge: true });
    await setDoc(sRef, { viewsCount: increment(1) }, { merge: true });
  }catch{}
}

/* =========================
   ✅ Read stats (helpers)
========================= */

export async function getListingStats(listingId){
  try{
    const s = await getDoc(statsRef(listingId));
    if (!s.exists()) return { viewsCount: 0, favCount: 0 };
    const d = s.data() || {};
    return {
      viewsCount: Number(d.viewsCount || 0) || 0,
      favCount: Number(d.favCount || 0) || 0
    };
  }catch{
    return { viewsCount: 0, favCount: 0 };
  }
}
