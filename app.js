import { UI } from "./js/ui.js";
import { initListings } from "./js/listings.js";
import { initAddListing } from "./js/addListing.js";
import { initAuth } from "./js/auth.js";
import { initCategories } from "./js/categories.js";
import { initChat } from "./js/chat.js";

UI.init();

// ✅ جهّز actions أولاً (مهم: listings قبل auth لأنه بيحط openDetails و loadListings)
initListings();
initAddListing();

initAuth();
await initCategories();
initChat();

// ✅ دائماً خلي الفلاتر OFF عند أول فتح (عرض الكل تلقائياً)
UI.state.filtersActive = false;

// ✅ أول تحميل: اعرض الكل
await UI.actions.loadListings(true);

// ✅ لو المستخدم فات على رابط إعلان مباشرة (#listing=...)
// ui.js أصلاً عندك بيعمل handleHash، بس هيك منضمن إنو بعد تحميل الإعلانات/الأكشنز
// ما يصير تأخير أو يضيع النداء
if ((location.hash || "").startsWith("#listing=")) {
  UI.handleHash?.();
}