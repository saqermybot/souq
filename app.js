import { UI } from "./js/ui.js";
import { initListings } from "./js/listings.js";
import { initAddListing } from "./js/addListing.js";
import { initAuth } from "./js/auth.js";
import { initCategories } from "./js/categories.js";
import { initChat } from "./js/chat.js";

// ✅ ثبّت الوضع الداكن دائماً
document.documentElement.setAttribute("data-theme", "dark");
localStorage.setItem("theme", "dark");

UI.init();

// ✅ جهّز actions أولاً
initListings();
initAddListing();

// ✅ مهم جداً: اربط chat/inbox actions قبل auth
initChat();

// ✅ Auth بعد ما صار loadInbox جاهز
initAuth();

// ✅ categories
await initCategories();

// ✅ دائماً خلي الفلاتر OFF عند أول فتح
UI.state.filtersActive = false;
UI.state.onlyMine = false;

// ✅ أول تحميل: اعرض الكل
await UI.actions.loadListings(true);

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