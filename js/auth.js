import { auth } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
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

let globalMenuCloserInstalled = false;

export function initAuth() {
  const avatar = document.getElementById("userAvatar");
const menu = document.getElementById("userMenu");

avatar?.addEventListener("click", (e) => {
  e.stopPropagation();
  menu.classList.toggle("hidden");
});

// إغلاق عند الضغط برا
document.addEventListener("click", () => {
  if (!menu.classList.contains("hidden")) {
    menu.classList.add("hidden");
  }
});

// أزرار القائمة
menu?.addEventListener("click", async (e) => {
  const act = e.target?.dataset?.act;
  if (!act) return;

  menu.classList.add("hidden");

  const uid = auth.currentUser?.uid || "";

  if (act === "myListings") {
    if (!uid) return alert("يجب تسجيل الدخول");
    location.href = `store.html?u=${uid}`;
  }

  if (act === "profile") {
    // صفحة بسيطة حالياً
    location.href = `profile.html`;
  }

  if (act === "logout") {
    await signOut(auth);
    location.reload();
  }
});

  // ✅ تثبيت الوضع الداكن دائماً
  document.documentElement.setAttribute("data-theme", "dark");
  try { localStorage.setItem("theme", "dark"); } catch {}

  // ===== Modal open/close =====
  UI.actions.openAuth = () => UI.show(UI.el.authModal);
  UI.actions.closeAuth = () => UI.hide(UI.el.authModal);

  if (UI.el.authModal) {
    UI.el.authModal.addEventListener("click", (e) => {
      if (e.target === UI.el.authModal) UI.actions.closeAuth();
    });
  }

  const setBusy = (isBusy) => {
    if (!UI.el.btnLogin) return;
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

  // ===== Google Login =====
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

    // ✅ شغّل inbox listener تلقائياً ليحدث الـ Badge بدون فتح صفحة الرسائل
    if (user && typeof UI.actions.loadInbox === "function") {
      UI.actions.loadInbox(); // موجودة عندك في chat.js وتعمل onSnapshot
    } else {
      // لو ما في user، أخفي الـ badge
      const badge = document.getElementById("inboxBadge");
      if (badge) badge.classList.add("hidden");
    }
  });

  // ✅ close menu globally (مرة واحدة فقط)
  if (!globalMenuCloserInstalled) {
    globalMenuCloserInstalled = true;
    document.addEventListener(
      "click",
      () => {
        const menu = document.getElementById("accountMenu");
        if (menu) menu.classList.add("hidden");
      },
      { capture: true }
    );
  }

  function renderTopbar(user) {
    const photo = user?.photoURL || "";
    const email = user?.email || "";

    UI.renderAuthBar(`
      <button id="btnInbox" class="iconBtn" title="الرسائل" aria-label="inbox">
        💬
        <!-- ✅ Badge أحمر (ستايله من CSS عبر #inboxBadge) -->
        <span id="inboxBadge" class="hidden">0</span>
      </button>

      <button id="btnOpenAdd" class="secondary">+ إعلان جديد</button>

      ${
        user
          ? `
            <button id="btnAccount" class="avatarBtn" title="${escapeAttr(email)}" aria-label="account">
              ${
                photo
                  ? `<img src="${escapeAttr(photo)}" alt="me" />`
                  : `<span class="avatarLetter">${escapeHtml((email[0] || "U").toUpperCase())}</span>`
              }
            </button>

            <div id="accountMenu" class="menu hidden">
              <button id="btnMyAds" class="menuItem">إعلاناتي</button>
              <button id="btnLogout" class="menuItem danger">خروج</button>
            </div>
          `
          : `<button id="btnOpenAuth" class="ghost">دخول</button>`
      }
    `);

    // ✅ Inbox
    document.getElementById("btnInbox").onclick = (e) => {
      e.stopPropagation();
      if (!auth.currentUser) return UI.actions.openAuth();
      if (typeof UI.actions.openInbox === "function") UI.actions.openInbox();
      else alert("صفحة الرسائل غير جاهزة بعد.");
    };

    // ✅ إضافة إعلان
    document.getElementById("btnOpenAdd").onclick = () => {
      if (!auth.currentUser) return UI.actions.openAuth();
      if (typeof UI.actions.openAdd === "function") UI.actions.openAdd();
      else UI.show(UI.el.addBox);
    };

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

    // إعلاناتي
    document.getElementById("btnMyAds").onclick = (e) => {
      e.stopPropagation();
      closeMenu();
      UI.state.onlyMine = true;
      UI.state.filtersActive = false;
      UI.actions.loadListings(true);
    };

    // خروج
    document.getElementById("btnLogout").onclick = async (e) => {
      e.stopPropagation();
      closeMenu();
      UI.state.onlyMine = false;
      try { await signOut(auth); } catch {}

      // أخفي الـ badge بعد الخروج
      const badge = document.getElementById("inboxBadge");
      if (badge) badge.classList.add("hidden");
    };
  }
}

export function requireAuth() {
  if (!auth.currentUser) {
    UI.actions.openAuth();
    throw new Error("AUTH_REQUIRED");
  }
}

// ===== Small utils =====
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