// auth.js
import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { UI } from "./ui.js";

let globalOutsideClickInstalled = false;

export function initAuth() {
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
    if (UI.el.btnLogin) UI.el.btnLogin.disabled = isBusy;
    if (UI.el.btnRegister) UI.el.btnRegister.disabled = isBusy;
    if (UI.el.btnGoogle) UI.el.btnGoogle.disabled = isBusy;
  };

  // ===== Email/Password Login =====
  if (UI.el.btnLogin) {
    UI.el.btnLogin.onclick = async () => {
      try {
        const email = (UI.el.email?.value || "").trim();
        const pass = UI.el.password?.value || "";
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
  }

  // ===== Register =====
  if (UI.el.btnRegister) {
    UI.el.btnRegister.onclick = async () => {
      try {
        const email = (UI.el.email?.value || "").trim();
        const pass = UI.el.password?.value || "";
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
  }

  // ===== Google Login =====
  if (UI.el.btnGoogle) {
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
  }

  // ✅ close menu globally (مرة واحدة فقط) - بدون ما يسكر عند الضغط داخل المنيو
  if (!globalOutsideClickInstalled) {
    globalOutsideClickInstalled = true;
    document.addEventListener("click", (e) => {
      const menu = document.getElementById("userMenu");
      const wrap = document.getElementById("userMenuWrap");
      if (!menu || !wrap) return;

      const inside = e.target && (wrap.contains(e.target) || menu.contains(e.target));
      if (!inside) menu.classList.add("hidden");
    }, { capture: true });
  }

  // ===== Auth state =====
  onAuthStateChanged(auth, async (user) => {
    // ✅ إذا ما في مستخدم: سجّل دخول Anonymous للزوار (بدون إظهار أي UI)
    if (!user) {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        // لو فشل لأي سبب، نكمل بدون ما نكسر الصفحة
        console.warn("Anonymous sign-in failed:", e?.code || e);
      }
    }

    // بعد محاولة anonymous، استخدم المستخدم الحالي (قد يكون صار موجود)
    const u = auth.currentUser;

    renderTopbar(u);

    // ✅ تحديث القوائم لتحديث حالة المفضلة بعد تسجيل/خروج
    try { UI.actions.loadListings?.(true); } catch {}

    // ✅ شغّل inbox listener تلقائياً ليحدث الـ Badge بدون فتح صفحة الرسائل
    // ملاحظة: inbox غالباً ما بدك يشتغل للـ anonymous
    if (u && !u.isAnonymous && typeof UI.actions.loadInbox === "function") {
      UI.actions.loadInbox();
    } else {
      const badge = document.getElementById("inboxBadge");
      if (badge) badge.classList.add("hidden");
    }
  });
}

function renderTopbar(user) {
  const isAnon = !!user?.isAnonymous;

  // 1) authBar content (inbox + add + login لو مو داخل / أو anon)
  UI.renderAuthBar(`
    <button id="btnInbox" class="iconBtn" title="الرسائل" aria-label="inbox">
      💬 <span id="inboxBadge" class="hidden">0</span>
    </button>

    <button id="btnOpenAdd" class="secondary" type="button">+ إعلان جديد</button>

    ${(!user || isAnon) ? `<button id="btnOpenAuth" class="ghost" type="button">دخول</button>` : ""}
  `);

  // 2) Elements from HTML (userMenuWrap + userAvatar + userMenu)
  const wrap = document.getElementById("userMenuWrap");
  const avatar = document.getElementById("userAvatar");
  const menu = document.getElementById("userMenu");

  // ✅ Inbox
  const btnInbox = document.getElementById("btnInbox");
  if (btnInbox) {
    btnInbox.onclick = (e) => {
      e.stopPropagation();
      // للـ anonymous اعتبره غير مسجل دخول
      if (!auth.currentUser || auth.currentUser.isAnonymous) return UI.actions.openAuth();
      if (typeof UI.actions.openInbox === "function") UI.actions.openInbox();
      else alert("صفحة الرسائل غير جاهزة بعد.");
    };
  }

  // ✅ إضافة إعلان
  const btnOpenAdd = document.getElementById("btnOpenAdd");
  if (btnOpenAdd) {
    btnOpenAdd.onclick = () => {
      // للـ anonymous اعتبره غير مسجل دخول (بدنا حساب حقيقي لنشر إعلان)
      if (!auth.currentUser || auth.currentUser.isAnonymous) return UI.actions.openAuth();
      if (typeof UI.actions.openAdd === "function") UI.actions.openAdd();
      else UI.show(UI.el.addBox);
    };
  }

  // ✅ لو مو مسجل أو Anonymous: اخفي منيو الحساب
  if (!user || isAnon) {
    if (wrap) wrap.style.display = "none";
    if (menu) menu.classList.add("hidden");

    const btnOpenAuth = document.getElementById("btnOpenAuth");
    if (btnOpenAuth) btnOpenAuth.onclick = () => UI.actions.openAuth();
    return;
  }

  // ✅ لو مسجل دخول: أظهر الـ wrap الحقيقي
  if (wrap) wrap.style.display = "block";

  const photo = (user.photoURL || "").trim();
  const email = (user.email || "").trim();
  const fallback = "./img/falcon.png";

  if (avatar) {
    avatar.src = photo || fallback;
    avatar.title = email || "account";
    avatar.alt = "account";
  }

  // ✅ Toggle menu
  if (avatar && menu) {
    avatar.onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    };
  }

  // ✅ Bind menu actions using data-act (مثل الـ HTML)
  if (menu) {
    const actBtn = (act) => menu.querySelector(`[data-act="${act}"]`);

    const btnFav = actBtn("favorites");
    const btnMy = actBtn("myListings");
    const btnProf = actBtn("profile");
    const btnLogout = actBtn("logout");

    // ✅ FAVORITES
    if (btnFav) {
      btnFav.onclick = (e) => {
        e.stopPropagation();
        menu.classList.add("hidden");

        if (typeof UI.actions.openFavorites === "function") {
          UI.actions.openFavorites();
          return;
        }

        UI.toast?.("📌 صفحة المفضلة: جاهزة بالواجهة (رح نوصلها بالمنطق)");
      };
    }

    if (btnMy) {
      btnMy.onclick = (e) => {
        e.stopPropagation();
        menu.classList.add("hidden");
        const uid = auth.currentUser?.uid || "";
        if (!uid) return alert("يجب تسجيل الدخول");
        location.href = `store.html?u=${encodeURIComponent(uid)}`;
      };
    }

    if (btnProf) {
      btnProf.onclick = (e) => {
        e.stopPropagation();
        menu.classList.add("hidden");
        location.href = `profile.html`;
      };
    }

    if (btnLogout) {
      btnLogout.onclick = async (e) => {
        e.stopPropagation();
        menu.classList.add("hidden");
        try { await signOut(auth); } catch {}

        const badge = document.getElementById("inboxBadge");
        if (badge) badge.classList.add("hidden");
      };
    }
  }
}

export function requireAuth() {
  // اعتبر anonymous كأنه مو مسجّل
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    UI.actions.openAuth();
    throw new Error("AUTH_REQUIRED");
  }
}

// ===== Pretty errors =====
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