// favorites.js
// ✅ Per-user favorites + global counters (favCount + viewsCount)
// ✅ NO increment() and NO merge on counters (to pass Firestore Rules safely)

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";

import {
  doc,
  getDoc,
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

function viewDocRef(uid, listingId){
  return doc(db, "listings", listingId, "views", uid);
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
   ✅ Toggle favorite (transaction-safe)
   - write favorite doc (create/delete)
   - update listing favCount as a plain integer (no increment)
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

    // ✅ favorites doc: create/delete فقط (بدون merge)
    if (wasFav) {
      tx.delete(favRef);
    } else {
      tx.set(favRef, { listingId, createdAt: serverTimestamp() });
    }

    // ✅ listing counter: رقم صريح
    const prev = Number(lSnap.data()?.favCount || 0) || 0;
    const next = Math.max(0, prev + delta);

    // نستخدم update لأن وثيقة الإعلان موجودة أكيد
    tx.update(lRef, { favCount: next });

    return { ok:true, isFav: !wasFav, favCount: next };
  });
}

/* =========================
   ✅ Views counter ("ضغطة حقيقية")
   - يزيد عند فتح صفحة التفاصيل
   - للمسجّلين فقط
   - مرة واحدة لكل مستخدم (لأن وثيقة views/{uid} تمنع التكرار)
   - TTL فقط لراحة الواجهة (يعني ما يعمل محاولة كل مرة بسرعة)
========================= */
const VIEW_TTL_MS = 2 * 60 * 1000; // 2 minutes

function viewKey(listingId){
  return `viewed:${listingId}`;
}

export async function bumpViewCount(listingId){
  if (!listingId) return { bumped:false };

  // ✅ Views للمسجّلين فقط
  const uid = auth.currentUser?.uid;
  if (!uid) return { bumped:false, needAuth:true };

  // gate with localStorage (UI comfort)
  try{
    const k = viewKey(listingId);
    const last = Number(localStorage.getItem(k) || 0) || 0;
    const now = Date.now();
    if (last && (now - last) < VIEW_TTL_MS) return { bumped:false };
    localStorage.setItem(k, String(now));
  }catch{}

  try{
    const lRef = listingRef(listingId);
    const vRef = viewDocRef(uid, listingId);

    await runTransaction(db, async (tx) => {
      const vSnap = await tx.get(vRef);
      if (vSnap.exists()) return; // counted قبل

      const lSnap = await tx.get(lRef);
      if (!lSnap.exists()) return;

      // ✅ create view doc (no merge)
      tx.set(vRef, { createdAt: serverTimestamp() });

      // ✅ update viewsCount as plain integer
      const prevViews = Number(lSnap.data()?.viewsCount || 0) || 0;
      const nextViews = prevViews + 1;

      tx.update(lRef, { viewsCount: nextViews });
    });

    return { bumped:true };
  }catch{
    return { bumped:false };
  }
}