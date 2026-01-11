// profile.js (Guest-first)
// - لا يعتمد على Firebase ولا Auth.
// - يخزن بيانات البروفايل محلياً حسب guest_id.
// - لاحقاً يمكن إضافة ربط حساب (Email) للتاجر.

import { getGuestId } from "./guest.js";

const el = {
  status: document.getElementById("pStatus"),
  avatar: document.getElementById("pAvatar"),
  email: document.getElementById("pEmail"),

  displayName: document.getElementById("displayName"),
  photoURL: document.getElementById("photoURL"),
  city: document.getElementById("city"),
  whatsapp: document.getElementById("whatsapp"),
  bio: document.getElementById("bio"),

  btnSave: document.getElementById("btnSave"),
  btnMyStore: document.getElementById("btnMyStore"),
  btnLogout: document.getElementById("btnLogout"),
};

function setStatus(msg = ""){
  if (el.status) el.status.textContent = msg;
}

function esc(s = ""){
  return String(s).replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function renderAvatar(profile){
  if (!el.avatar) return;
  const photo = (profile.photoURL || "").trim();
  if (photo){
    el.avatar.innerHTML = `<img src="${esc(photo)}" alt="me" />`;
    return;
  }
  const letter = (profile.displayName?.[0] || "U").toUpperCase();
  el.avatar.textContent = letter;
}

function normalizeWhatsapp(raw){
  let num = String(raw || "").trim();
  if (!num) return "";
  num = num.replace(/[^\d+]/g, "");
  num = num.replace(/^\+/, "");
  if (num.startsWith("00")) num = num.slice(2);
  if (!/^\d{7,}$/.test(num)) return "";
  return num;
}

function key(){ return `souq_profile:${getGuestId()}`; }

function loadProfile(){
  try{ return JSON.parse(localStorage.getItem(key()) || "{}") || {}; }
  catch{ return {}; }
}

function saveProfile(p){
  try{ localStorage.setItem(key(), JSON.stringify(p || {})); }catch{}
}

function lockUI(locked){
  if (el.btnSave) el.btnSave.disabled = !!locked;
  if (el.btnMyStore) el.btnMyStore.disabled = !!locked;
  if (el.btnLogout) el.btnLogout.disabled = !!locked;
}

// init
const profile = loadProfile();
if (el.email) el.email.textContent = "زائر";
if (el.displayName) el.displayName.value = profile.displayName || "";
if (el.photoURL) el.photoURL.value = profile.photoURL || "";
if (el.city) el.city.value = profile.city || "";
if (el.whatsapp) el.whatsapp.value = profile.whatsapp || "";
if (el.bio) el.bio.value = profile.bio || "";

renderAvatar(profile);
setStatus("");

// Enter = حفظ (بدون submit)
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter"){
    if (e.target && e.target.tagName === "TEXTAREA") return;
    e.preventDefault();
    el.btnSave?.click();
  }
});

if (el.btnMyStore){
  el.btnMyStore.onclick = () => {
    location.href = "./my-listings.html";
  };
}

if (el.btnLogout){
  el.btnLogout.onclick = () => {
    // خروج للزائر: مسح بيانات البروفايل فقط (لا نمسح guest_id لتبقى المفضلات)
    try{ localStorage.removeItem(key()); }catch{}
    location.href = "./index.html";
  };
}

if (el.btnSave){
  el.btnSave.onclick = async () => {
    const displayName = (el.displayName?.value || "").trim();
    const photoURL    = (el.photoURL?.value || "").trim();
    const city        = (el.city?.value || "").trim();
    const whatsappRaw = (el.whatsapp?.value || "").trim();
    const bio         = (el.bio?.value || "").trim();

    if (displayName && displayName.length < 2) return alert("اسم العرض قصير جداً");

    const whatsapp = normalizeWhatsapp(whatsappRaw);
    if (whatsappRaw && !whatsapp){
      return alert("رقم واتساب غير صالح. اكتب مثل: +9639xxxxxxx أو 0031xxxxxxxx أو رقم دولي بدون فراغات.");
    }

    lockUI(true);
    setStatus("جاري الحفظ...");

    const next = { displayName, photoURL, city, whatsapp, bio, updatedAt: Date.now() };
    saveProfile(next);
    renderAvatar(next);

    setStatus("تم الحفظ ✅");
    setTimeout(() => setStatus(""), 900);
    lockUI(false);
  };
}
