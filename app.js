import { UI } from "./js/ui.js";
import { initListings } from "./js/listings.js";
import { initAddListing } from "./js/addListing.js";
import { initAuth } from "./js/auth.js";
import { initCategories } from "./js/categories.js";
import { initChat } from "./js/chat.js";
// import { initInbox } from "./js/inbox.js"; // ❌ خليها مطفية

document.documentElement.setAttribute("data-theme", "dark");
localStorage.setItem("theme", "dark");

UI.init();

// ✅ جهّز actions أولاً
initListings();
initAddListing();

// ✅ مهم جداً: chat قبل auth ليكون loadInbox جاهز وقت login
initChat();

// ✅ Auth بعد ما chat صار جاهز (حتى يشتغل dot فوراً)
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