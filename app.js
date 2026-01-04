import { UI } from "./js/ui.js";
import { initListings } from "./js/listings.js";
import { initAddListing } from "./js/addListing.js";
import { initAuth } from "./js/auth.js";
import { initCategories } from "./js/categories.js";
import { initChat } from "./js/chat.js";
//import { initInbox } from "./js/inbox.js"; // ✅ جديد

// ✅ ثبّت الوضع الداكن دائماً (حتى لو كان في كود قديم يقرأ theme)
document.documentElement.setAttribute("data-theme", "dark");
localStorage.setItem("theme", "dark");

UI.init();

// ✅ جهّز actions أولاً
// مهم: listings قبل auth لأنه بيحط openDetails و loadListings
initListings();
initAddListing();

// ✅ Auth بعد ما actions جاهزين (زر + إعلان جديد + avatar + inbox)
initAuth();

// ✅ categories قبل add form عادةً (حتى aCat تتعبّى صح)
await initCategories();

// ✅ chat (يعتمد على openDetails/currentListing)
initChat();

// ✅ inbox (يعتمد على auth + UI)
initInbox();

// ✅ دائماً خلي الفلاتر OFF عند أول فتح (عرض الكل تلقائياً)
UI.state.filtersActive = false;
UI.state.onlyMine = false;

// ✅ أول تحميل: اعرض الكل
await UI.actions.loadListings(true);

// ✅ لو المستخدم فات على رابط إعلان مباشرة (#listing=...)
// ui.js عندك فيه handleHash، هيك منضمن ينفذ بعد ما loadListings/openDetails جاهزين
if ((location.hash || "").startsWith("#listing=")) {
  try {
    await UI.handleHash?.();
  } catch {
    // لا نكسر الصفحة
  }
}

// ✅ تحسيني صغير: إذا رجع من صفحة التفاصيل/الإضافة/الشات بالباك
// ومافي hash => نرجّع عرض الصفحة الرئيسية بدون لخبطة
window.addEventListener("hashchange", async () => {
  // handleHash موجود بالـ ui.js تبعك
  if (typeof UI.handleHash === "function") UI.handleHash();

  // إذا ما في listing hash (يعني رجع للهوم)
  if (!(location.hash || "").startsWith("#listing=")) {
    // رجّع القائمة إذا كانت مخفية بسبب overlay
    UI.hide?.(UI.el.detailsPage);
  }
});