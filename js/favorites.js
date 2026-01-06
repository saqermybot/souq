// favorites.js
// ✅ Per-user favorites + global counters (favCount + viewsCount)
// ✅ Compatible with strict Firestore Rules (no FieldValue.increment in writes)

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  runTransaction
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

function toIntOr0(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
   - NO increment() to satisfy strict rules checks
========================= */

export async function toggleFavorite(listingId){
  if (!listingId) return { ok:false };
  if (!requireUserForFav()) return { ok:false, needAuth:true };

  const uid = auth.currentUser.uid;
  const favRef = favDocRef(uid, listingId);
  const lRef = listingRef(listingId);

  try{
    return await runTransaction(db, async (tx) => {
      const favSnap = await tx.get(favRef);
      const lSnap = await tx.get(lRef);

      if (!lSnap.exists()) throw new Error("الإعلان غير موجود");

      const lData = lSnap.data() || {};
      const prevFav = toIntOr0(lData.favCount);
      const prevViews = toIntOr0(lData.viewsCount);

      const wasFav = favSnap.exists();
      const delta = wasFav ? -1 : 1;

      if (wasFav){
        tx.delete(favRef);
      } else {
        tx.set(
          favRef,
          { listingId, createdAt: serverTimestamp() },
          { merge: true }
        );
      }

      const nextFav = Math.max(0, prevFav + delta);

      // ✅ Write explicit numbers only (favCount/viewsCount)
      tx.update(lRef, {
        favCount: nextFav,
        viewsCount: prevViews
      });

      return { ok:true, isFav: !wasFav, favCount: nextFav };
    });
  }catch(e){
    console.error("toggleFavorite failed:", e);
    toast(e?.message || "فشل تحديث المفضلة");
    return { ok:false, error: e?.message || "failed" };
  }
}

/* =========================
   ✅ Views counter ("ضغطة حقيقية")
   - يزيد عند فتح صفحة التفاصيل
   - يمنع الزيادة المتكررة السريعة لنفس الإعلان (TTL)
   - NO increment() to satisfy strict rules checks
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
    const lRef = listingRef(listingId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(lRef);
      if (!snap.exists()) return;

      const data = snap.data() || {};
      const prevViews = toIntOr0(data.viewsCount);
      const prevFav = toIntOr0(data.favCount);

      // ✅ Explicit numbers only
      tx.update(lRef, {
        viewsCount: prevViews + 1,
        favCount: prevFav
      });
    });
  }catch{
    // silent (views are non-critical)
  }
}