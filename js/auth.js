// auth.js (clean)
// - Users browse/publish/chat as anonymous guests (no visible login)
// - Admin login via Email/Password only (for moderation tools later)

import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { UI } from "./ui.js";
import { Notify } from "./notify.js";

// ✅ Admin email (must match your firestore.rules isAdmin())
const ADMIN_EMAIL = "alhossiniabdulhalim2@gmail.com";

// -------------------------
// Helpers
// -------------------------
function emailLower(user){
  try { return (user?.email || "").toLowerCase(); } catch { return ""; }
}
function isAdminUser(user){
  return !!user && !user.isAnonymous && emailLower(user) === ADMIN_EMAIL.toLowerCase();
}

function setBodyFlags(user){
  const guest = !!user && user.isAnonymous === true;
  const admin = isAdminUser(user);
  document.body.classList.toggle("is-guest", guest);
  document.body.classList.toggle("is-admin", admin);
}

function renderAuthBar(user){
  if (!UI.el.authBar) return;

  // Minimal, no confusion for users
  if (!user) {
    UI.el.authBar.innerHTML = "";
    return;
  }
  if (isAdminUser(user)) {
    UI.el.authBar.innerHTML = `<button class="ghost sm" type="button" id="btnOpenAuth">لوحة الأدمن</button>`;
  } else {
    UI.el.authBar.innerHTML = `<span class="muted small">زائر</span>`;
  }

  // bind button if exists
  const btn = document.getElementById("btnOpenAuth");
  if (btn) btn.onclick = () => UI.actions.openAuth?.();
}

function initUserMenuUI(){
  const wrap = document.getElementById("userMenuWrap");
  const avatar = document.getElementById("userAvatar");
  const menu = document.getElementById("userMenu");
  if (!wrap || !avatar || !menu) return;

  // show menu for everyone (guest + admin)
  wrap.style.display = "";

  const toggleMenu = () => {
    menu.classList.toggle("hidden");
  };
  avatar.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  };

  // one global outside-click to close
  if (!window.__souqMenuOutsideClickInstalled) {
    window.__souqMenuOutsideClickInstalled = true;
    document.addEventListener("click", () => {
      try { menu.classList.add("hidden"); } catch {}
    });
  }

  // menu actions (if UI actions exist)
  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    menu.classList.add("hidden");

    if (act === "logout") {
      // handled in initAuth() below
      return;
    }
    if (act === "myListings") UI.actions.openMyListings?.();
    if (act === "favorites") UI.actions.openFavorites?.();
    if (act === "profile") UI.actions.openProfile?.();
  });
}

// -------------------------
// Public API
// -------------------------
export async function ensureUser(){
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export function initAuth(){
  // Ensure we have a guest user ASAP
  ensureUser().catch((e) => {
    console.warn("Anonymous auth failed:", e);
  });

  // Modal open/close (admin only)
  UI.actions.openAuth = () => UI.show(UI.el.authModal);
  UI.actions.closeAuth = () => UI.hide(UI.el.authModal);

  if (UI.el.btnCloseAuth) UI.el.btnCloseAuth.onclick = () => UI.actions.closeAuth?.();
  if (UI.el.authModal) {
    UI.el.authModal.addEventListener("click", (e) => {
      if (e.target === UI.el.authModal) UI.actions.closeAuth?.();
    });
  }

  // Admin login
  if (UI.el.btnLogin) {
    UI.el.btnLogin.onclick = async () => {
      const email = (UI.el.email?.value || "").trim();
      const password = (UI.el.password?.value || "").trim();
      if (!email || !password) {
        Notify.toast("أدخل الإيميل وكلمة السر.");
        return;
      }
      UI.el.btnLogin.disabled = true;
      try {
        await signInWithEmailAndPassword(auth, email, password);
        UI.actions.closeAuth?.();
        Notify.toast("تم تسجيل دخول الأدمن.");
      } catch (e) {
        console.warn(e);
        Notify.toast("فشل تسجيل الدخول. تأكد من البيانات.");
      } finally {
        UI.el.btnLogin.disabled = false;
      }
    };
  }

  // Logout button: admin only. Guests should NOT lose their UID.
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const user = auth.currentUser;
      if (!isAdminUser(user)) {
        // Guests: no-op
        Notify.toast("هذا الخيار مخصص للإدارة فقط.");
        return;
      }

      try {
        await signOut(auth);
        Notify.toast("تم تسجيل الخروج.");
      } catch (err) {
        console.warn(err);
      } finally {
        // Always go back to guest session
        try { await ensureUser(); } catch {}
      }
    };
  }

  initUserMenuUI();

  // Keep UI flags in sync
  onAuthStateChanged(auth, (user) => {
    setBodyFlags(user);
    renderAuthBar(user);
    // Safety for late-rendered elements
    setTimeout(() => setBodyFlags(auth.currentUser), 250);
  });
}
