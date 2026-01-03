import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { UI } from "./ui.js";

export function initAuth() {
  UI.actions.openAuth = () => UI.show(UI.el.authModal);
  UI.actions.closeAuth = () => UI.hide(UI.el.authModal);

  // ✅ عالج رجعة redirect (مهم جداً)
  getRedirectResult(auth).then((res)=>{
    if (res?.user) {
      UI.actions.closeAuth();
      toast("تم تسجيل الدخول ✅");
    }
  }).catch(()=>{});

  UI.el.btnLogin.onclick = async () => {
    try {
      const email = normalizeEmail(UI.el.email.value);
      const pass = UI.el.password.value;

      if (!email || !pass) return alert("اكتب الإيميل والباسورد");
      await signInWithEmailAndPassword(auth, email, pass);

      UI.actions.closeAuth();
      toast("تم تسجيل الدخول ✅");
    } catch (e) {
      alert(prettyAuthError(e));
    }
  };

  UI.el.btnRegister.onclick = async () => {
    try {
      const email = normalizeEmail(UI.el.email.value);
      const pass = UI.el.password.value;

      if (!email || !pass) return alert("اكتب الإيميل والباسورد");
      await createUserWithEmailAndPassword(auth, email, pass);

      UI.actions.closeAuth();
      toast("تم إنشاء الحساب ✅");
    } catch (e) {
      alert(prettyAuthError(e));
    }
  };

  UI.el.btnGoogle.onclick = async () => {
    const provider = new GoogleAuthProvider();

    try {
      // ✅ جرّب Popup أولاً
      await signInWithPopup(auth, provider);
      UI.actions.closeAuth();
      toast("تم تسجيل الدخول ✅");
    } catch (e) {
      // ✅ إذا انحجب popup على iOS، نروح Redirect تلقائياً
      const code = e?.code || "";
      if (
        code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment" ||
        code === "auth/web-storage-unsupported"
      ) {
        await signInWithRedirect(auth, provider);
        return;
      }
      alert(prettyAuthError(e));
    }
  };

  onAuthStateChanged(auth, (user) => {
    renderTopbar(user);
  });
}

function renderTopbar(user) {
  const label = user ? (user.email || "حساب") : "";
  UI.renderAuthBar(`
    <button id="btnOpenAdd" class="secondary">+ إعلان جديد</button>
    ${
      user
        ? `<span class="muted small" style="color:#fff;opacity:.85">${label}</span>
           <button id="btnLogout" class="ghost">خروج</button>`
        : `<button id="btnOpenAuth" class="ghost">دخول</button>`
    }
  `);

  document.getElementById("btnOpenAdd").onclick = () => {
    if (!auth.currentUser) return UI.actions.openAuth();
    UI.actions.openAdd(); // ✅ صار دايمًا موجود من addListing.js
  };

  if (!user) {
    document.getElementById("btnOpenAuth").onclick = () => UI.actions.openAuth();
    return;
  }

  document.getElementById("btnLogout").onclick = async () => {
    await signOut(auth);
    toast("تم تسجيل الخروج");
  };
}

export function requireAuth() {
  if (!auth.currentUser) {
    UI.actions.openAuth();
    throw new Error("AUTH_REQUIRED");
  }
}

function normalizeEmail(v){
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ""); // ✅ يشيل المسافات اللي بتجيب invalid-email
}

function toast(msg){
  // Toast بسيط بدون CSS إضافي
  try { console.log(msg); } catch {}
}

function prettyAuthError(e) {
  const code = e?.code || "";
  if (code === "auth/invalid-email") return "الإيميل غير صحيح.";
  if (code === "auth/missing-email") return "اكتب الإيميل.";
  if (code === "auth/missing-password") return "اكتب الباسورد.";
  if (code === "auth/wrong-password") return "الباسورد غلط.";
  if (code === "auth/user-not-found") return "ما في حساب بهالإيميل.";
  if (code === "auth/email-already-in-use") return "هذا الإيميل مسجل مسبقاً.";
  if (code === "auth/weak-password") return "الباسورد ضعيف (لازم 6 أحرف على الأقل).";
  if (code === "auth/popup-blocked") return "المتصفح حجب نافذة Google. رح نستخدم Redirect تلقائياً.";
  if (code === "auth/cancelled-popup-request") return "انلغت العملية. جرّب مرة ثانية.";
  if (code === "auth/popup-closed-by-user") return "سكرّت نافذة Google قبل ما تكمّل.";
  return e?.message || "فشل تسجيل الدخول.";
}