import { UI } from "./js/core/ui.js";
import { Notify } from "./js/core/notify.js";

import { initListings } from "./js/features/listings/listings.js";
import { initAddListing } from "./js/features/listings/addListing.js";
import { initFilterDrawer } from "./js/features/listings/filterDrawer.js";

import { initChat } from "./js/features/chat.js";
import { initInbox } from "./js/features/inbox.js";      // ✅ مهم
import { initAuth } from "./js/features/auth.js";
import { initCategories } from "./js/features/categories.js";

// ✅ ثبّت الوضع الداكن دائماً
document.documentElement.setAttribute("data-theme", "dark");
localStorage.setItem("theme", "dark");

// ✅ إظهار الخطأ بدل ما "يختفي كل شي"
function showFatal(err) {
  console.error(err);
  const box = document.createElement("div");
  box.style.cssText = `
    position:fixed; left:12px; right:12px; bottom:12px;
    background:#ff3b30; color:#fff; padding:12px 14px;
    border-radius:14px; font-size:14px; z-index:99999;
    box-shadow:0 10px 30px rgba(0,0,0,.25);
    direction:rtl;
  `;
  box.innerHTML = `<b>خطأ بالتطبيق</b><div style="margin-top:6px">${String(err?.message || err)}</div>`;
  document.body.appendChild(box);
}

try {
  UI.init();

  // إذا هاي بتكسر عندك، احذفها
  try { Notify.ensurePermission?.(); } catch {}

  // ✅ جهّز actions أولاً
  initListings();
  initAddListing();

  // ✅ Drawer للفلتر (بدون باراميتر)
  try { initFilterDrawer(); } catch { initFilterDrawer(UI); } // احتياط لو نسختك بتطلب UI

  // ✅ مهم جداً: اربط inbox/chat قبل auth
  initInbox();
  initChat();

  // ✅ Auth بعد ما صار loadInbox جاهز
  initAuth();

  // ✅ categories (بدون await احتياطًا)
  await Promise.resolve(initCategories());

  // ✅ دائماً خلي الفلاتر OFF عند أول فتح
  UI.state.filtersActive = false;

  // ✅ أول تحميل: اعرض الكل
  await UI.actions.loadListings(true);

  // ✅ Infinite scroll
  if (UI.el.loadMoreSentinel) {
    const io = new IntersectionObserver(async (entries) => {
      const e = entries[0];
      if (!e.isIntersecting) return;
      if (UI.el.btnMore?.disabled) return;
      try { await UI.actions.loadListings(false); } catch {}
    }, { rootMargin: "600px" });
    io.observe(UI.el.loadMoreSentinel);
  }

  // ✅ فتح إعلان من hash
  if ((location.hash || "").startsWith("#listing=")) {
    try { await UI.handleHash?.(); } catch {}
  }

  window.addEventListener("hashchange", async () => {
    if (typeof UI.handleHash === "function") UI.handleHash();
    if (!(location.hash || "").startsWith("#listing=")) {
      UI.hide?.(UI.el.detailsPage);
    }
  });

} catch (err) {
  showFatal(err);
}