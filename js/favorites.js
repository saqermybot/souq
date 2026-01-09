// favorites.js
// ✅ Per-user favorites + global counters (favCount + viewsCount)

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

function statsRef(listingId){
  return doc(db, "listingStats", listingId);
}

async function ensureStatsDoc(listingId){
  const ref = statsRef(listingId);
  try{
    // create doc with defaults if missing (merge keeps existing)
    await setDoc(ref, { favCount: 0, viewCount: 0, updatedAt: Date.now() }, { merge: true });
  }catch{}
  return ref;
}

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
   ✅ Toggle favorite (transaction-safe, updates global favCount)
========================= */

export async function toggleFavorite(listingId){
  if (!listingId) return { ok:false };
  if (!(await requireUserForFav())) return { ok:false, needAuth:true };

  const uid = auth.currentUser.uid;
  const favRef = favDocRef(uid, listingId);
  const sRef = await ensureStatsDoc(listingId);

  return await runTransaction(db, async (tx) => {
    const favSnap = await tx.get(favRef);
    const sSnap = await tx.get(sRef);

    const wasFav = favSnap.exists();
    const delta = wasFav ? -1 : 1;

    if (wasFav) tx.delete(favRef);
    else tx.set(favRef, { listingId, createdAt: serverTimestamp() }, { merge: true });

    const prev = Number(sSnap.data()?.favCount || 0) || 0;
    const next = Math.max(0, prev + delta);
    // ✅ global counter lives in listingStats (not in listings)
    tx.set(sRef, { favCount: next, updatedAt: Date.now() }, { merge: true });

    return { ok:true, isFav: !wasFav, favCount: next };
  });
}

/* =========================
   ✅ Views counter ("ضغطة حقيقية")
   - يزيد عند فتح صفحة التفاصيل
   - يمنع الزيادة المتكررة السريعة لنفس الإعلان (TTL)
========================= */

const VIEW_TTL_MS = 2 * 60 * 1000; // 2 minutes

function viewKey(listingId){
  return `viewed:${listingId}`;
}

export async function bumpViewCount(listingId){
  if (!listingId) return;

  // gate with localStorage
  try{
    const k = viewKey(listingId);
    const last = Number(localStorage.getItem(k) || 0) || 0;
    const now = Date.now();
    if (last && (now - last) < VIEW_TTL_MS) return;
    localStorage.setItem(k, String(now));
  }catch{}

  try{
    const ref = await ensureStatsDoc(listingId);
    await setDoc(ref, { viewCount: increment(1), updatedAt: Date.now() }, { merge: true });
  }catch{}
}
