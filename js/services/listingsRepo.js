import { db, auth } from "../core/firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const LISTINGS = "listings";

export async function fetchListingsPage({ lastDoc = null, pageSize = 12 } = {}) {
  let qy = query(
    collection(db, LISTINGS),
    orderBy("createdAt", "desc"),
    limit(pageSize)
  );

  if (lastDoc) {
    qy = query(
      collection(db, LISTINGS),
      orderBy("createdAt", "desc"),
      startAfter(lastDoc),
      limit(pageSize)
    );
  }

  const snap = await getDocs(qy);
  const docs = snap.docs;
  const newLastDoc = docs.length ? docs[docs.length - 1] : null;

  return { docs, lastDoc: newLastDoc };
}

export async function fetchListingById(id) {
  const ref = doc(db, LISTINGS, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ✅ Soft-delete: نخلي الإعلان غير فعّال بدل الحذف النهائي
export async function softDeleteListing(id) {
  const me = auth.currentUser?.uid;
  if (!me) throw new Error("يجب تسجيل الدخول أولاً");

  const ref = doc(db, LISTINGS, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("الإعلان غير موجود");

  const data = snap.data();
  const ownerId = data.ownerId || null;
  if (!ownerId || ownerId !== me) throw new Error("لا تملك صلاحية حذف هذا الإعلان");

  await updateDoc(ref, {
    isActive: false,
    deletedAt: serverTimestamp(),
    deletedBy: me
  });
}
