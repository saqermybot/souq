import { UI } from "./js/core/ui.js";
import { initListings } from "./js/features/listings/listings.js";
import { initAddListing } from "./js/features/listings/addListing.js";
import { initAuth } from "./js/features/auth.js";
import { initCategories } from "./js/features/categories.js";
import { initChat } from "./js/features/chat.js";
import { Notify } from "./js/core/notify.js";
import { initFilterDrawer } from "./js/features/listings/filterDrawer.js";

// ✅ ثبّت الوضع الداكن دائماً
document.documentElement.setAttribute("data-theme", "dark");
localStorage.setItem("theme", "dark");

UI.init();
Notify.ensurePermission();

// ✅ جهّز actions أولاً
initListings();
initAddListing();

// Drawer للفلتر
initFilterDrawer(UI);

// ✅ مهم جداً: اربط chat/inbox actions قبل auth
initChat();

// ✅ Auth بعد ما صار loadInbox جاهز
initAuth();

// ✅ categories
await initCategories();

// ✅ دائماً خلي الفلاتر OFF عند أول فتح
UI.state.filtersActive = false;

// ✅ أول تحميل: اعرض الكل
await UI.actions.loadListings(true);

// ✅ Infinite scroll (بدون ما تضغط "المزيد")
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
