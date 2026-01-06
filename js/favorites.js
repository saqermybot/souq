// favorites.js
// ✅ Per-user favorites stored at: users/{uid}/favorites/{listingId}
// ✅ Also maintains listing.favCount and listing.viewsCount (client-side, best effort)

import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml, formatPrice } from "./utils.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  increment,
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   Helpers
========================= */

function toast(msg){
  try{
    if (typeof UI.toast === "function") return UI.toast(msg);
  }catch{}
  try{ alert(msg); }catch{}
}

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
   Read favorites state (for cards)
========================= */

export async function getFavoriteSet(listingIds = []){
  const uid = auth.currentUser?.uid || "";
  const ids = Array.from(new Set((listingIds || []).filter(Boolean)));

  const set = new Set();
  if (!uid || ids.length === 0) return set;

  // Parallel getDoc (ok for small pages)
  const snaps = await Promise.all(ids.map((id) => getDoc(favDocRef(uid, id)).catch(() => null)));
  snaps.forEach((s, i) => {
    if (s && s.exists()) set.add(ids[i]);
  });
  return set;
}

/* =========================
   Toggle favorite (transaction) + return new count
========================= */

export async function toggleFavorite(listingId){
  const uid = auth.currentUser?.uid;
  if (!uid) return { ok:false };

  const favRef = favDocRef(uid, listingId);
  const listRef = listingRef(listingId);

  const result = await runTransaction(db, async (tx) => {
    const favSnap = await tx.get(favRef);
    const listSnap = await tx.get(listRef);

    const cur = Number(listSnap.exists() ? (listSnap.data().favCount || 0) : 0) || 0;

    if (favSnap.exists()){
      // remove
      tx.delete(favRef);
      tx.set(listRef, { favCount: increment(-1) }, { merge:true });

      const next = Math.max(0, cur - 1);
      return { ok:true, isFav:false, favCount: next };
    } else {
      // add
      tx.set(favRef, { createdAt: serverTimestamp() }, { merge:true });
      tx.set(listRef, { favCount: increment(1) }, { merge:true });

      const next = cur + 1;
      return { ok:true, isFav:true, favCount: next };
    }
  });

  return result;
}

/* =========================
   Views count (localStorage TTL to avoid spam)
========================= */

const VIEW_TTL_MS = 60 * 60 * 1000; // 1h

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

/* =========================
   Favorites modal (UI)
========================= */

async function getFavoriteIds(){
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const col = collection(db, "users", uid, "favorites");
  const q = query(col, orderBy("createdAt", "desc"), limit(200));
  const snap = await getDocs(q);

  return snap.docs.map(d => d.id);
}

export async function loadFavoritesModal(){
  if (!requireUserForFav()) return;

  const grid = UI.el.favGrid;
  const empty = UI.el.favEmpty;
  if (!grid) return;

  grid.innerHTML = "";
  if (empty) empty.style.display = "none";

  const ids = await getFavoriteIds();
  if (!ids.length){
    if (empty) empty.style.display = "block";
    return;
  }

  // Fetch listing docs
  const listingSnaps = await Promise.all(ids.map(id => getDoc(listingRef(id)).catch(() => null)));

  const items = [];
  listingSnaps.forEach((s, i) => {
    if (!s || !s.exists()) return;
    items.push({ id: ids[i], data: s.data() });
  });

  if (!items.length){
    if (empty) empty.style.display = "block";
    return;
  }

  for (const it of items){
    const data = it.data || {};
    const img = (data.images && data.images[0]) ? data.images[0] : "./img/placeholder.jpg";
    const favC = Number(data.favCount || 0) || 0;
    const viewsC = Number(data.viewsCount || 0) || 0;

    const card = document.createElement("article");
    card.className = "card listingCard";
    card.innerHTML = `
      <div class="cardMedia">
        <img src="${img}" alt="" />
        <button class="favBtn favOverlay isFav" type="button" aria-label="إزالة من المفضلة">♥</button>
      </div>
      <div class="p">
        <div class="t">${escapeHtml(data.title || "بدون عنوان")}</div>
        <div class="m">${escapeHtml(data.city || "")}</div>
        <div class="pr">${escapeHtml(formatPrice(data.price, data.currency))}</div>
        <div class="cardStats">
          <span class="muted">♥ <span class="favCount">${favC}</span></span>
          <span class="muted">👁️ ${viewsC}</span>
        </div>
      </div>
    `;

    card.onclick = () => UI.actions.openDetails?.(it.id);

    const favBtn = card.querySelector(".favOverlay");
    if (favBtn){
      favBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        favBtn.disabled = true;
        try{
          const res = await toggleFavorite(it.id);
          if (res?.ok && !res.isFav){
            // remove card from modal
            card.remove();
            if (!grid.querySelector(".listingCard") && empty) empty.style.display = "block";
          }
        }finally{
          favBtn.disabled = false;
        }
      });
    }

    grid.appendChild(card);
  }
}
