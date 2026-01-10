// app.js
import { UI } from "./js/ui.js";
import { initListings } from "./js/listings.js";
import { initAddListing } from "./js/addListing.js";
import { initAuth } from "./js/auth.js";
import { initCategories } from "./js/categories.js";
import { initChat } from "./js/chat.js";
import { Notify } from "./js/notify.js";
import { initGuestUI } from "./js/guest.js";

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

// ✅ قوائم جاهزة: سنة السيارات (2000-2026) + غرف العقارات (1-10)
function fillNumberSelect(sel, start, end, { placeholder = '', pad = false } = {}) {
  if (!sel) return;
  // keep first option as placeholder if exists
  const first = sel.querySelector('option');
  const keepPlaceholder = first && (first.value === '' || first.value == null);
  if (!keepPlaceholder) sel.innerHTML = '';
  for (let n = start; n <= end; n++) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    sel.appendChild(opt);
  }
}

function initPresetSelects() {
  // Add Listing
  fillNumberSelect(document.getElementById('aCarYear'), 2000, 2026);
  fillNumberSelect(document.getElementById('aRooms'), 1, 10);
  // Filters
  fillNumberSelect(document.getElementById('yearFrom'), 2000, 2026);
  fillNumberSelect(document.getElementById('yearTo'), 2000, 2026);
  fillNumberSelect(document.getElementById('roomsFilter'), 1, 10);
}
initPresetSelects();
// ✅ إعادة تعبئة القوائم بعد تحميل الواجهة (احتياط)
setTimeout(initPresetSelects, 600);


// ✅ Expose UI for inline scripts (FAB button)
window.UI = UI;

// إشعارات (اختياري)
safe(() => Notify.ensurePermission());

// ✅ جهّز actions أولاً
initListings();
initAddListing();

// ✅ مهم جداً: اربط chat/inbox actions قبل auth
initChat();

// ✅ Group 1: Guest identity label (works even if Firebase Auth is blocked)
safe(() => initGuestUI());

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