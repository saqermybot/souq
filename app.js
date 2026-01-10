// app.js
// IMPORTANT: avoid static imports that depend on remote Firebase modules.
// If a single remote module fails, iOS Safari may stop executing the whole app.
// We load Firebase-dependent modules dynamically so the UI + Guest identity always works.

import { UI } from "./js/ui.js";
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

function showBootstrapError(msg) {
  try {
    const grid = document.getElementById("listings");
    if (grid) {
      grid.innerHTML = `<div class="adsEmpty" style="padding:14px; text-align:center; color:#9CA3AF;">${msg}</div>`;
      return;
    }
    const box = document.querySelector(".adsEmpty");
    if (box) box.textContent = msg;
  } catch {}
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

// ✅ Group 1: Guest identity label (works even if Firebase is blocked)
safe(() => initGuestUI());

// ✅ Load Firebase-dependent modules dynamically.
// If anything fails, keep the UI alive and show a friendly message.
let listingsReady = false;
await safeAsync(async () => {
  const { initListings } = await import("./js/listings.js");
  initListings();
  listingsReady = true;
});

await safeAsync(async () => {
  const { initAddListing } = await import("./js/addListing.js");
  initAddListing();
});

await safeAsync(async () => {
  const { initChat } = await import("./js/chat.js");
  initChat();
});

await safeAsync(async () => {
  const { initAuth } = await import("./js/auth.js");
  initAuth();
});

await safeAsync(async () => {
  const { initCategories } = await import("./js/categories.js");
  await initCategories();
});

// ✅ دائماً خلي الفلاتر OFF عند أول فتح
UI.state.filtersActive = false;
UI.state.onlyMine = false;

// ✅ أول تحميل: اعرض الكل (إذا listings جاهزة)
if (listingsReady && UI.actions?.loadListings) {
  await safeAsync(() => UI.actions.loadListings(true));
} else {
  showBootstrapError("تعذر تحميل الإعلانات حالياً. جرّب تحديث الصفحة.");
}

// ✅ فتح إعلان من hash (مرة واحدة فقط)
// ملاحظة: UI.init() عندك أصلاً عامل listener للـ hashchange
if ((location.hash || "").startsWith("#listing=")) {
  await safeAsync(() => UI.handleHash?.());
}

// ✅ ما عاد نحتاج listener هون إذا UI.init مركّبه
// إذا بدك تخليه هون لازم تشيله من UI.init — الأفضل يبقى مكان واحد فقط.