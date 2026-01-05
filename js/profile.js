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

function setStatus(msg = ""){
  if (el.status) el.status.textContent = msg;
}

function esc(s = ""){
  return String(s).replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function renderAvatar(user, photoUrlOverride=""){
  if (!el.avatar) return;

  const photo = (photoUrlOverride || user?.photoURL || "").trim();
  if (photo){
    el.avatar.innerHTML = `<img src="${esc(photo)}" alt="me" />`;
    return;
  }
  const letter = (user?.email?.[0] || "U").toUpperCase();
  el.avatar.textContent = letter;
}

/**
 * ✅ Normalize WhatsApp number for wa.me
 * - keep digits and +
 * - remove leading +
 * - if starts with 00 => remove it (0031... -> 31...)
 * - optional سوريا: 09xxxxxxxx -> 9639xxxxxxx (فعّلها إذا بدك)
 */
function normalizeWhatsapp(raw){
  let num = String(raw || "").trim();
  if (!num) return "";

  num = num.replace(/[^\d+]/g, "");   // digits and +
  num = num.replace(/^\+/, "");       // remove +
  if (num.startsWith("00")) num = num.slice(2); // remove 00 prefix

  // ✅ OPTIONAL: Syria local
  // if (num.startsWith("09")) num = "963" + num.slice(1);

  // لازم يكون رقم فعلي (7 خانات+ كحد أدنى)
  if (!/^\d{7,}$/.test(num)) return "";
  return num;
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

function lockUI(locked){
  if (el.btnSave) el.btnSave.disabled = !!locked;
  if (el.btnMyStore) el.btnMyStore.disabled = !!locked;
  if (el.btnLogout) el.btnLogout.disabled = !!locked;
}

onAuthStateChanged(auth, async (user) => {
  if (!user){
    alert("يجب تسجيل الدخول أولاً");
    location.href = "./index.html";
    return;
  }

  if (el.email) el.email.textContent = user.email || "";

  setStatus("جاري التحميل...");
  lockUI(true);

  try{
    const profile = await loadProfile(user.uid);

    const name  = (profile?.displayName || user.displayName || "").trim();
    const photo = (profile?.photoURL || user.photoURL || "").trim();

    if (el.displayName) el.displayName.value = name;
    if (el.photoURL) el.photoURL.value = photo;
    if (el.city) el.city.value = (profile?.city || "").trim();
    if (el.whatsapp) el.whatsapp.value = (profile?.whatsapp || "").trim();
    if (el.bio) el.bio.value = (profile?.bio || "").trim();

    renderAvatar(user, photo);
    setStatus("");
  }catch(e){
    console.error(e);
    setStatus("فشل تحميل البروفايل");
  }finally{
    lockUI(false);
  }

  // ✅ Enter = حفظ (بدون submit)
  const onEnterSave = (e) => {
    if (e.key === "Enter"){
      // بالـ textarea ما بدنا Enter يعمل حفظ
      if (e.target && e.target.tagName === "TEXTAREA") return;
      e.preventDefault();
      el.btnSave?.click();
    }
  };
  document.addEventListener("keydown", onEnterSave);

  // زر إعلاناتي
  if (el.btnMyStore){
    el.btnMyStore.onclick = () => {
      location.href = `./store.html?u=${encodeURIComponent(user.uid)}`;
    };
  }

  // خروج
  if (el.btnLogout){
    el.btnLogout.onclick = async () => {
      try { await signOut(auth); } catch {}
      location.href = "./index.html";
    };
  }

  // حفظ
  if (el.btnSave){
    el.btnSave.onclick = async () => {
      const displayName = (el.displayName?.value || "").trim();
      const photoURL    = (el.photoURL?.value || "").trim();
      const city        = (el.city?.value || "").trim();
      const whatsappRaw = (el.whatsapp?.value || "").trim();
      const bio         = (el.bio?.value || "").trim();

      if (displayName && displayName.length < 2) return alert("اسم العرض قصير جداً");

      // ✅ normalize whatsapp
      const whatsapp = normalizeWhatsapp(whatsappRaw);

      // إذا كتب شي مو رقم صالح
      if (whatsappRaw && !whatsapp){
        return alert("رقم واتساب غير صالح. اكتب مثل: +9639xxxxxxx أو 0031xxxxxxxx أو رقم دولي بدون فراغات.");
      }

      lockUI(true);
      setStatus("جاري الحفظ...");

      try{
        // ✅ خزّن بفايرستور
        await saveProfile(user.uid, { displayName, photoURL, city, whatsapp, bio });

        // ✅ حدّث Auth displayName/photoURL (اختياري)
        const patch = {};
        if (displayName) patch.displayName = displayName;
        if (photoURL) patch.photoURL = photoURL;

        if (Object.keys(patch).length){
          try { await updateProfile(user, patch); } catch {}
        }

        renderAvatar(user, photoURL);

        // ✅ نجاح واضح + تحويل تلقائي
        setStatus("تم الحفظ ✅ سيتم تحويلك للسوق...");
        setTimeout(() => {
          // الافتراضي: رجّع للسوق
          location.href = "./index.html";
          // إذا بدك بعد الحفظ يروح على إعلاناتي بدل السوق:
          // location.href = `./store.html?u=${encodeURIComponent(user.uid)}`;
        }, 650);

      }catch(e){
        console.error(e);
        alert(e?.message || "فشل الحفظ");
        setStatus("");
        lockUI(false);
      }
    };
  }
});