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
  btnLogout: document.getElementById("btnLogout")
};

function toast(msg){
  if (!el.status) return;
  el.status.textContent = String(msg || "");
  el.status.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    try { el.status.classList.add("hidden"); } catch {}
  }, 1600);
}

const guestId = getGuestId();
const key = `souq_profile:${guestId}`;

function loadProfile(){
  try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; }
  catch { return {}; }
}
function saveProfile(p){
  try { localStorage.setItem(key, JSON.stringify(p || {})); } catch {}
}

const p = loadProfile();

// Populate UI
if (el.email) el.email.textContent = p.email || "زائر";
if (el.displayName) el.displayName.value = p.displayName || "";
if (el.photoURL) el.photoURL.value = p.photoURL || "";
if (el.city) el.city.value = p.city || "";
if (el.whatsapp) el.whatsapp.value = p.whatsapp || "";
if (el.bio) el.bio.value = p.bio || "";

function refreshAvatar(){
  const url = (el.photoURL?.value || p.photoURL || "").trim();
  if (el.avatar){
    if (url) el.avatar.src = url;
    else el.avatar.removeAttribute("src");
  }
}
refreshAvatar();
el.photoURL?.addEventListener("input", refreshAvatar);

// Save
el.btnSave?.addEventListener("click", () => {
  const next = {
    displayName: (el.displayName?.value || "").trim(),
    photoURL: (el.photoURL?.value || "").trim(),
    city: (el.city?.value || "").trim(),
    whatsapp: (el.whatsapp?.value || "").trim(),
    bio: (el.bio?.value || "").trim(),
    email: (p.email || "زائر")
  };
  saveProfile(next);
  toast("تم الحفظ");
});

// My store (uses guest mode for now)
el.btnMyStore?.addEventListener("click", () => {
  location.href = "./my-listings.html";
});

// Logout in guest mode: clear local profile only
el.btnLogout?.addEventListener("click", () => {
  localStorage.removeItem(key);
  toast("تم الخروج");
  setTimeout(() => location.href = "./index.html", 300);
});
