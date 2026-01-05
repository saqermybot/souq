import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  updateProfile,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

function setStatus(msg=""){
  if (el.status) el.status.textContent = msg;
}

function esc(s=""){
  return String(s).replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function renderAvatar(user, photoUrlOverride=""){
  const photo = (photoUrlOverride || user?.photoURL || "").trim();
  if (photo){
    el.avatar.innerHTML = `<img src="${esc(photo)}" alt="me" />`;
    return;
  }
  const letter = (user?.email?.[0] || "U").toUpperCase();
  el.avatar.textContent = letter;
}

async function loadProfile(uid){
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

async function saveProfile(uid, data){
  const ref = doc(db, "users", uid);
  await setDoc(ref, {
    ...data,
    uid,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

onAuthStateChanged(auth, async (user) => {
  if (!user){
    // إذا ما في تسجيل دخول
    alert("يجب تسجيل الدخول أولاً");
    location.href = "./index.html";
    return;
  }

  el.email.textContent = user.email || "";

  setStatus("جاري التحميل...");
  el.btnSave.disabled = true;

  try{
    // حمّل من Firestore
    const profile = await loadProfile(user.uid);

    const name = (profile?.displayName || user.displayName || "").trim();
    const photo = (profile?.photoURL || user.photoURL || "").trim();

    el.displayName.value = name;
    el.photoURL.value = photo;
    el.city.value = (profile?.city || "").trim();
    el.whatsapp.value = (profile?.whatsapp || "").trim();
    el.bio.value = (profile?.bio || "").trim();

    renderAvatar(user, photo);

    setStatus("");
  }catch(e){
    console.error(e);
    setStatus("فشل تحميل البروفايل");
  }finally{
    el.btnSave.disabled = false;
  }

  // زر إعلاناتي
  el.btnMyStore.onclick = () => {
    location.href = `./store.html?u=${encodeURIComponent(user.uid)}`;
  };

  // خروج
  el.btnLogout.onclick = async () => {
    try { await signOut(auth); } catch {}
    location.href = "./index.html";
  };

  // حفظ
  el.btnSave.onclick = async () => {
    const displayName = (el.displayName.value || "").trim();
    const photoURL = (el.photoURL.value || "").trim();
    const city = (el.city.value || "").trim();
    const whatsapp = (el.whatsapp.value || "").trim();
    const bio = (el.bio.value || "").trim();

    if (displayName && displayName.length < 2) return alert("اسم العرض قصير جداً");

    el.btnSave.disabled = true;
    setStatus("جاري الحفظ...");

    try{
      // خزّن بفايرستور
      await saveProfile(user.uid, { displayName, photoURL, city, whatsapp, bio });

      // حدّث Auth displayName/photoURL (اختياري لكن مفيد)
      // (ملاحظة: إذا photoURL فاضي ما نغيّرها)
      const patch = {};
      if (displayName) patch.displayName = displayName;
      if (photoURL) patch.photoURL = photoURL;

      if (Object.keys(patch).length){
        try { await updateProfile(user, patch); } catch {}
      }

      renderAvatar(user, photoURL);
      setStatus("تم الحفظ ✅");
      setTimeout(()=>setStatus(""), 1200);
    }catch(e){
      console.error(e);
      alert(e?.message || "فشل الحفظ");
      setStatus("");
    }finally{
      el.btnSave.disabled = false;
    }
  };
});
