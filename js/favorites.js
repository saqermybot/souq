// favorites.js
// ✅ Per-user favorites + global counters (favCount + viewsCount)

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";

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

function listingRef(listingId){
  return doc(db, "listings", listingId);
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
  const lRef = listingRef(listingId);

  return await runTransaction(db, async (tx) => {
    const favSnap = await tx.get(favRef);
    const lSnap = await tx.get(lRef);

    if (!lSnap.exists()) throw new Error("الإعلان غير موجود");

    const wasFav = favSnap.exists();
    const delta = wasFav ? -1 : 1;

    if (wasFav) tx.delete(favRef);
    else tx.set(favRef, { listingId, createdAt: serverTimestamp() }, { merge: true });

    tx.set(lRef, { favCount: increment(delta) }, { merge: true });

    const prev = Number(lSnap.data()?.favCount || 0) || 0;
    const next = Math.max(0, prev + delta);

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
    await setDoc(listingRef(listingId), { viewsCount: increment(1) }, { merge: true });
  }catch{}
}
