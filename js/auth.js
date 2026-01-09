// auth.js
import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { UI } from "./ui.js";

let globalOutsideClickInstalled = false;

// ✅ Admin email (must match your firestore.rules isAdmin())
const ADMIN_EMAIL = "alhossiniabdulhalim2@gmail.com";


export async function ensureUser() {
  // Ensures we always have a Firebase user (anonymous by default)
  if (auth.currentUser) return auth.currentUser;
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (e) {
    console.warn("Anonymous auth failed:", e);
    // fallback: open auth modal for manual login if anonymous fails
    UI.actions?.openAuth?.();
    throw e;
  }
}


export function initAuth() {
  // ✅ Theme is handled once in app.js (avoid duplicates)

  // ===== Modal open/close =====
  UI.actions.openAuth = () => {
    UI.show(UI.el.authModal);
    // تحسين تجربة: ركّز على الإيميل
    try { UI.el.email?.focus?.(); } catch {}
  };
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

  // ✅ حاول التقاط نتيجة redirect (بعض الأجهزة ما بتنجح popup)
  (async () => {
    try {
      const res = await getRedirectResult(auth);
      // إذا نجح، سكّر المودال
      if (res?.user) UI.actions.closeAuth();
    } catch (e) {
      // ما نعمل alert مزعج هون—يكفي أنه يتعالج عند زر Google
      console.warn("getRedirectResult:", e?.code || e);
    }
  })();

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
      const provider = new GoogleAuthProvider();
      try {
        setBusy(true);
        await signInWithPopup(auth, provider);
        UI.actions.closeAuth();
      } catch (e) {
        const msg = prettyAuthError(e);

        // ✅ إذا popup فشل لأي سبب "شائع بالموبايل"، جرّب redirect كخطة B
        const code = e?.code || "";
        const shouldTryRedirect =
          code === "auth/popup-blocked" ||
          code === "auth/popup-closed-by-user" ||
          code === "auth/cancelled-popup-request" ||
          code === "auth/operation-not-supported-in-this-environment" ||
          code === "auth/network-request-failed";

        if (shouldTryRedirect) {
          // أعطي المستخدم سبب واضح + جرّب redirect
          alert(msg + "\n\nسنحاول طريقة بديلة (Redirect)...");
          try {
            await signInWithRedirect(auth, provider);
            return;
          } catch (e2) {
            alert(prettyAuthError(e2));
          }
        } else {
          alert(msg);
        }
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
  onAuthStateChanged(auth, (user) => {
    // ✅ UI flags on <body>
    const email = (user?.email || "").toLowerCase();
    const isAdmin = !!email && email === ADMIN_EMAIL;
    const isGuest = !!user && user.isAnonymous === true;
    document.body.classList.toggle("is-admin", isAdmin);
    document.body.classList.toggle("is-guest", isGuest);

    renderTopbar(user);

    // ✅ تحديث القوائم لتحديث حالة المفضلة بعد تسجيل/خروج
    try{ UI.actions.loadListings?.(true); }catch{}

    // ✅ شغّل inbox listener تلقائياً ليحدث الـ Badge بدون فتح صفحة الرسائل
    if (user && typeof UI.actions.loadInbox === "function") {
      UI.actions.loadInbox();
    } else {
      const badge = document.getElementById("inboxBadge");
      if (badge) badge.classList.add("hidden");
    }
  });

  // ✅ Default to silent anonymous session so الموقع يشتغل حتى بدون تسجيل
  ensureUser().catch(()=>{});
}

function renderTopbar(user) {
  // 1) authBar content (inbox + add + login لو مو داخل)
  UI.renderAuthBar(`
    <button id="btnInbox" class="iconBtn" title="الرسائل" aria-label="inbox">
      💬 <span id="inboxBadge" class="hidden">0</span>
    </button>

    <button id="btnOpenAdd" class="secondary" type="button">➕ إضافة إعلان </button>

    ${user ? "" : `<button id="btnOpenAuth" class="ghost" type="button">دخول</button>`}
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
      if (!auth.currentUser) return UI.actions.openAuth();
      if (typeof UI.actions.openInbox === "function") UI.actions.openInbox();
      else alert("صفحة الرسائل غير جاهزة بعد.");
    };
  }

  // ✅ إضافة إعلان
  const btnOpenAdd = document.getElementById("btnOpenAdd");
  if (btnOpenAdd) {
    btnOpenAdd.onclick = () => {
      if (!auth.currentUser) return UI.actions.openAuth();
      if (typeof UI.actions.openAdd === "function") UI.actions.openAdd();
      else UI.show(UI.el.addBox);
    };
  }

  // ✅ لو مو مسجل دخول
  if (!user) {
    // ✅ لا يوجد مستخدم: اعتبره زائر (Guest UI)
    document.body.classList.remove("is-admin");
    document.body.classList.add("is-guest");
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

    // ✅ Logout is ONLY for admin accounts.
    const isAdminUser = !user.isAnonymous && ((user.email || "").toLowerCase() === ADMIN_EMAIL);
    if (btnLogout) btnLogout.style.display = isAdminUser ? "" : "none";

    // ✅ FAVORITES
    if (btnFav) {
      btnFav.onclick = (e) => {
        e.stopPropagation();
        menu.classList.add("hidden");

        // إذا عندك شاشة/ميزة جاهزة:
        if (typeof UI.actions.openFavorites === "function") {
          UI.actions.openFavorites();
          return;
        }

        // fallback مؤقت:
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

    if (btnLogout && isAdminUser) {
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
  if (!auth.currentUser) {
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

  if (code === "auth/popup-blocked") return "المتصفح حجب نافذة Google. جرّب Chrome/Firefox أو اسمح بالنوافذ المنبثقة.";
  if (code === "auth/popup-closed-by-user") return "سكرّت نافذة Google قبل ما تكمّل.";
  if (code === "auth/cancelled-popup-request") return "انلغت العملية. جرّب مرة ثانية.";

  // ✅ سوريا/شبكات: أوضح رسالة + حل عملي
  if (code === "auth/network-request-failed" || code === "auth/timeout") {
    return (
      "تعذّر الاتصال بخدمة تسجيل الدخول.\n" +
      "هذا غالباً بسبب حجب/ضعف اتصال لخدمات Google/Firebase في بلدك.\n\n" +
      "✅ الحلول المقترحة:\n" +
      "1) جرّب VPN (مثل Psiphon) وقت الدخول فقط.\n" +
      "2) جرّب شبكة مختلفة (واي فاي/بيانات).\n" +
      "3) جرّب DNS: 1.1.1.1 أو 8.8.8.8.\n"
    );
  }

  return e?.message || "فشل تسجيل الدخول.";
}