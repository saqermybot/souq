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
  // ===== Theme load/save =====
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);

  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  // ===== Modal open/close =====
  UI.actions.openAuth = () => UI.show(UI.el.authModal);
  UI.actions.closeAuth = () => UI.hide(UI.el.authModal);

  // اغلاق عند الضغط خارج الكارد (احتياط)
  if (UI.el.authModal) {
    UI.el.authModal.addEventListener("click", (e) => {
      if (e.target === UI.el.authModal) UI.actions.closeAuth();
    });
  }

  // ===== Helpers =====
  const setBusy = (isBusy) => {
    UI.el.btnLogin.disabled = isBusy;
    UI.el.btnRegister.disabled = isBusy;
    UI.el.btnGoogle.disabled = isBusy;
  };

  // ===== Email/Password Login =====
  UI.el.btnLogin.onclick = async () => {
    try {
      const email = UI.el.email.value.trim();
      const pass = UI.el.password.value;

      if (!email || !pass) return alert("اكتب الإيميل والباسورد");

      setBusy(true);
      await signInWithEmailAndPassword(auth, email, pass);
      UI.actions.closeAuth();
    } catch (e) {
      alert(prettyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  // ===== Register =====
  UI.el.btnRegister.onclick = async () => {
    try {
      const email = UI.el.email.value.trim();
      const pass = UI.el.password.value;

      if (!email || !pass) return alert("اكتب الإيميل والباسورد");

      setBusy(true);
      await createUserWithEmailAndPassword(auth, email, pass);
      UI.actions.closeAuth();
    } catch (e) {
      alert(prettyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  // ===== Google Login (popup) =====
  UI.el.btnGoogle.onclick = async () => {
    try {
      setBusy(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      UI.actions.closeAuth();
    } catch (e) {
      alert(prettyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  // ===== Auth state =====
  onAuthStateChanged(auth, (user) => {
    renderTopbar(user);
  });

  // ===== Topbar render =====
  function renderTopbar(user) {
    const photo = user?.photoURL || "";
    const email = user?.email || "";

    // ملاحظة: الصندوق الأسود اللي كان عندك سببه عنصر بلا محتوى
    // هون منستبدله بأفاتار/حساب واضح.
    UI.renderAuthBar(`
      <button id="btnTheme" class="themeBtn" title="Theme">🌓</button>

      <button id="btnOpenAdd" class="secondary">+ إعلان جديد</button>

      ${
        user
          ? `
            <div class="userChip" id="btnAccount" title="${escapeAttr(email)}">
              ${photo ? `<img class="avatar" src="${escapeAttr(photo)}" alt="me"/>`
                      : `<div class="avatarPh">${(email[0] || "U").toUpperCase()}</div>`}
              <div class="userText">
                <div class="userEmail">${escapeHtml(email)}</div>
              </div>
            </div>

            <div id="accountMenu" class="menu hidden">
              <button id="btnMyAds" class="menuItem">إعلاناتي</button>
              <button id="btnLogout" class="menuItem danger">خروج</button>
            </div>
          `
          : `<button id="btnOpenAuth" class="ghost">دخول</button>`
      }
    `);

    // Theme
    document.getElementById("btnTheme").onclick = toggleTheme;

    // زر إضافة إعلان
    document.getElementById("btnOpenAdd").onclick = () => {
      if (!auth.currentUser) return UI.actions.openAuth();

      // ✅ fallback لو openAdd مش مربوط لأي سبب
      if (typeof UI.actions.openAdd === "function") UI.actions.openAdd();
      else UI.show(UI.el.addBox);
    };

    // إذا ما في user => زر دخول
    if (!user) {
      document.getElementById("btnOpenAuth").onclick = () => UI.actions.openAuth();
      return;
    }

    // قائمة الحساب
    const btnAccount = document.getElementById("btnAccount");
    const menu = document.getElementById("accountMenu");

    const closeMenu = () => menu.classList.add("hidden");
    const toggleMenu = () => menu.classList.toggle("hidden");

    btnAccount.onclick = (e) => {
      e.stopPropagation();
      toggleMenu();
    };

    document.addEventListener("click", closeMenu, { capture: true });

    // إعلاناتي (نستعمل فلتر بسيط)
    document.getElementById("btnMyAds").onclick = () => {
      closeMenu();

      // نحط الفلتر: "ownerId = current user"
      // إذا بتحب لاحقاً نعمل صفحة/تبويب خاص
      if (typeof UI.actions.loadListings === "function") {
        // نخزن فلتر داخلي بسيط
        UI.state.onlyMine = true;
        UI.actions.loadListings(true);
      } else {
        alert("ميزة إعلاناتي غير جاهزة بعد.");
      }
    };

    // خروج
    document.getElementById("btnLogout").onclick = async () => {
      closeMenu();
      UI.state.onlyMine = false;
      await signOut(auth);
    };
  }
}

export function requireAuth() {
  if (!auth.currentUser) {
    UI.actions.openAuth();
    throw new Error("AUTH_REQUIRED");
  }
}

// ===== Small utils (local) =====
function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function escapeAttr(s = "") {
  return String(s).replace(/"/g, "&quot;");
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

  if (code === "auth/popup-blocked") return "المتصفح حجب نافذة Google. جرّب Safari أو اسمح بالنوافذ المنبثقة.";
  if (code === "auth/popup-closed-by-user") return "سكرّت نافذة Google قبل ما تكمّل.";
  if (code === "auth/cancelled-popup-request") return "انلغت العملية. جرّب مرة ثانية.";

  return e?.message || "فشل تسجيل الدخول.";
}