import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { UI } from "./ui.js";

export function initAuth() {
  // Theme load
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);

  function toggleTheme(){
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  // modal open/close
  UI.actions.openAuth = () => UI.show(UI.el.authModal);
  UI.actions.closeAuth = () => UI.hide(UI.el.authModal);

  // Email/Password
  UI.el.btnLogin.onclick = async () => {
    try {
      const email = UI.el.email.value.trim();
      const pass = UI.el.password.value;
      if (!email || !pass) return alert("اكتب الإيميل والباسورد");
      await signInWithEmailAndPassword(auth, email, pass);
      UI.actions.closeAuth();
    } catch (e) {
      alert(prettyAuthError(e));
    }
  };

  UI.el.btnRegister.onclick = async () => {
    try {
      const email = UI.el.email.value.trim();
      const pass = UI.el.password.value;
      if (!email || !pass) return alert("اكتب الإيميل والباسورد");
      await createUserWithEmailAndPassword(auth, email, pass);
      UI.actions.closeAuth();
    } catch (e) {
      alert(prettyAuthError(e));
    }
  };

  // Google popup
  UI.el.btnGoogle.onclick = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      UI.actions.closeAuth();
    } catch (e) {
      alert(prettyAuthError(e));
    }
  };

  onAuthStateChanged(auth, (user) => {
    renderTopbar(user);
  });

  function renderTopbar(user) {
    UI.renderAuthBar(`
      <button id="btnTheme" class="themeBtn">🌓</button>
      <button id="btnOpenAdd" class="secondary">+ إعلان جديد</button>
      ${
        user
          ? `<button id="btnLogout" class="ghost">خروج</button>`
          : `<button id="btnOpenAuth" class="ghost">دخول</button>`
      }
    `);

    document.getElementById("btnTheme").onclick = toggleTheme;

    document.getElementById("btnOpenAdd").onclick = () => {
      if (!auth.currentUser) return UI.actions.openAuth();
      UI.actions.openAdd();
    };

    if (!user) {
      document.getElementById("btnOpenAuth").onclick = () => UI.actions.openAuth();
      return;
    }

    document.getElementById("btnLogout").onclick = () => signOut(auth);
  }
}

export function requireAuth() {
  if (!auth.currentUser) {
    UI.actions.openAuth();
    throw new Error("AUTH_REQUIRED");
  }
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
  if (code === "auth/popup-blocked") return "المتصفح حجب نافذة Google. جرّب مرة ثانية.";
  if (code === "auth/popup-closed-by-user") return "سكرّت نافذة Google قبل ما تكمّل.";
  return e?.message || "فشل تسجيل الدخول.";
}