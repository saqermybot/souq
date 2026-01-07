// app.js
import { UI } from "./js/ui.js";
import { initListings } from "./js/listings.js";
import { initAddListing } from "./js/addListing.js";
import { initAuth } from "./js/auth.js";
import { initCategories } from "./js/categories.js";
import { Notify } from "./js/notify.js";

// ✅ ثبّت الوضع الداكن دائماً
document.documentElement.setAttribute("data-theme", "dark");
try { localStorage.setItem("theme", "dark"); } catch {}

function safe(fn) {
  try { return fn(); } catch (e) { console.error(e); }
}

async function safeAsync(fn) {
  try { return await fn(); } catch (e) { console.error(e); }
}

// ✅ Start
UI.init();

// إشعارات (اختياري)
safe(() => Notify.ensurePermission());

// ✅ جهّز actions أولاً
initListings();
initAddListing();

// ✅ Auth بعد ما صار loadInbox جاهز
initAuth();

// ✅ categories (لو فشل ما يوقف الموقع)
await safeAsync(() => initCategories());

// ✅ دائماً خلي الفلاتر OFF عند أول فتح
UI.state.filtersActive = false;
UI.state.onlyMine = false;

// ✅ أول تحميل: اعرض الكل
await safeAsync(() => UI.actions.loadListings(true));

// ✅ فتح إعلان من hash (مرة واحدة فقط)
// ملاحظة: UI.init() عندك أصلاً عامل listener للـ hashchange
if ((location.hash || "").startsWith("#listing=")) {
  await safeAsync(() => UI.handleHash?.());
}

// ✅ ما عاد نحتاج listener هون إذا UI.init مركّبه
// إذا بدك تخليه هون لازم تشيله من UI.init — الأفضل يبقى مكان واحد فقط.