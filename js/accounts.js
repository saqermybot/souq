// accounts.js - guest-first "upgrade to account" with PIN (no OTP, no Firebase Auth)
// Group 2: Upgrade/Recover account so user can restore after clearing browser.
//
// Data model (Firestore):
// accounts/{id} {
//   displayName, displayNameLower,
//   contact, contactLower,
//   pinHash,
//   linkedOwnerKeys: [guestId, ...],
//   createdAt, lastLoginAt
// }
//
// Listings ownership:
// listings/{id} gets ownerAccountId + ownerType + sellerName (display name)

import {
  collection, addDoc, query, where, limit, getDocs, serverTimestamp, updateDoc, doc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase.js";
import { getOrCreateGuest, getGuestId, getGuestDisplayName } from "./guest.js";

const ACCOUNT_KEY = "souq_account";

function safeJsonParse(s){ try { return JSON.parse(s); } catch { return null; } }

export function getLocalAccount(){
  return safeJsonParse(localStorage.getItem(ACCOUNT_KEY) || "null");
}

function setLocalAccount(acc){
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
}

export function clearLocalAccount(){
  localStorage.removeItem(ACCOUNT_KEY);
}

function $(id){ return document.getElementById(id); }

function setTopName(name){
  const el = $("userLabel");
  if (el) el.textContent = name || "مستخدم";
}

function toast(msg){
  // very lightweight toast using Notify if present
  try {
    const n = (globalThis.Notify || null);
    if (n?.toast) return n.toast(msg);
  } catch {}
  alert(msg);
}

async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

function normalizeContact(s){
  s = (s || "").trim();
  if (!s) return "";
  return s.toLowerCase();
}

function normalizePin(pin){
  return (pin || "").trim();
}

async function findAccountByIdentifier(identifier){
  const id = normalizeContact(identifier);
  if (!id) return null;

  const accCol = collection(db, "accounts");

  // Try contactLower first
  let q1 = query(accCol, where("contactLower", "==", id), limit(1));
  let snap = await getDocs(q1);
  if (!snap.empty) return snap.docs[0];

  // Fallback: by displayNameLower
  let q2 = query(accCol, where("displayNameLower", "==", id), limit(1));
  snap = await getDocs(q2);
  if (!snap.empty) return snap.docs[0];

  return null;
}

async function migrateGuestListingsToAccount(accountId, displayName){
  const guestId = getGuestId();
  if (!guestId) return;

  const ql = query(collection(db, "listings"), where("ownerKey", "==", guestId), limit(200));
  const snap = await getDocs(ql);
  if (snap.empty) return;

  const batch = writeBatch(db);
  let c = 0;
  snap.docs.forEach(d => {
    const ref = doc(db, "listings", d.id);
    batch.update(ref, {
      ownerType: "account",
      ownerAccountId: accountId,
      sellerName: displayName
    });
    c += 1;
  });
  await batch.commit();
}

function openModal(){
  const m = $("accountModal");
  if (m) m.classList.remove("hidden");
}
function closeModal(){
  const m = $("accountModal");
  if (m) m.classList.add("hidden");
}

function setTab(tab){
  const t1 = $("accTabUpgrade");
  const t2 = $("accTabRecover");
  const p1 = $("accPaneUpgrade");
  const p2 = $("accPaneRecover");
  if (!t1 || !t2 || !p1 || !p2) return;

  const upgrade = tab === "upgrade";
  t1.classList.toggle("active", upgrade);
  t2.classList.toggle("active", !upgrade);
  p1.style.display = upgrade ? "block" : "none";
  p2.style.display = upgrade ? "none" : "block";
}

async function handleUpgrade(){
  const displayName = ($("accDisplayName")?.value || "").trim();
  const contact = ($("accContact")?.value || "").trim();
  const pin = normalizePin($("accPin")?.value);

  if (!displayName) return toast("اكتب اسمك أو اسم المتجر.");
  if (!contact) return toast("اكتب رقم هاتف أو ايميل (مطلوب للاسترجاع).");
  if (!pin || pin.length < 5) return toast("PIN لازم يكون 5 أرقام على الأقل.");

  const pinHash = await sha256(pin);
  const guest = getOrCreateGuest();

  // Create account
  const docRef = await addDoc(collection(db, "accounts"), {
    displayName,
    displayNameLower: displayName.toLowerCase(),
    contact,
    contactLower: normalizeContact(contact),
    pinHash,
    linkedOwnerKeys: [guest.guestId],
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  });

  // Save local session
  setLocalAccount({ accountId: docRef.id, displayName, contact });

  // Update UI
  setTopName(displayName);

  // Migrate listings
  try { await migrateGuestListingsToAccount(docRef.id, displayName); } catch (e) { console.warn(e); }

  toast("✅ تم إنشاء الحساب وربط إعلاناتك.");
  closeModal();
}

async function handleRecover(){
  const identifier = ($("recIdentifier")?.value || "").trim();
  const pin = normalizePin($("recPin")?.value);

  if (!identifier) return toast("اكتب رقم الهاتف أو الإيميل أو اسم المتجر.");
  if (!pin) return toast("اكتب PIN.");

  const accDoc = await findAccountByIdentifier(identifier);
  if (!accDoc) return toast("ما لقينا حساب بهالمعلومات.");

  const data = accDoc.data();
  const pinHash = await sha256(pin);
  if (pinHash !== data.pinHash) return toast("PIN غير صحيح.");

  // Save session
  setLocalAccount({ accountId: accDoc.id, displayName: data.displayName, contact: data.contact || "" });

  // Link current guest key for convenience
  try {
    const guestId = getGuestId();
    if (guestId && Array.isArray(data.linkedOwnerKeys) && !data.linkedOwnerKeys.includes(guestId)){
      await updateDoc(doc(db, "accounts", accDoc.id), {
        linkedOwnerKeys: [...data.linkedOwnerKeys, guestId],
        lastLoginAt: serverTimestamp()
      });
    } else {
      await updateDoc(doc(db, "accounts", accDoc.id), { lastLoginAt: serverTimestamp() });
    }
  } catch (e) { console.warn(e); }

  // Update UI
  setTopName(data.displayName);

  toast("✅ تم استرجاع الحساب.");
  closeModal();
}

export function initAccountsUI(UI){
  // Fill defaults
  const guestName = getGuestDisplayName() || "مستخدم";
  const acc = getLocalAccount();
  if (acc?.displayName) setTopName(acc.displayName);

  // Wire modal controls
  const m = $("accountModal");
  if (m){
    m.addEventListener("click", (e) => {
      if (e.target === m) closeModal();
    });
  }
  $("btnCloseAccount")?.addEventListener("click", closeModal);

  $("accTabUpgrade")?.addEventListener("click", () => setTab("upgrade"));
  $("accTabRecover")?.addEventListener("click", () => setTab("recover"));

  // Prefill upgrade name from guest
  const dn = $("accDisplayName");
  if (dn && !dn.value) dn.value = guestName;

  $("btnDoUpgrade")?.addEventListener("click", handleUpgrade);
  $("btnDoRecover")?.addEventListener("click", handleRecover);

  // Expose actions for menu
  if (UI?.actions){
    UI.actions.openAccountUpgrade = () => { openModal(); setTab("upgrade"); };
    UI.actions.openAccountRecover = () => { openModal(); setTab("recover"); };
  }
}
