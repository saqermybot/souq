// auth.js (No-Firebase)
// ✅ تم إلغاء تسجيل الدخول التقليدي لتسهيل الاستخدام داخل سوريا.
// بدلاً من ذلك:
// - حساب جهاز تلقائي عند (إضافة إعلان/مراسلة/قلب/تبليغ)
// - زر "توثيق الحساب" (اختياري) — سيتم تفعيله لاحقاً عبر API (Magic Link)

import { UI } from "./ui.js";

export function initAuth() {
  // شريط علوي بسيط
  UI.renderAuthBar(`
    <button class="btn ghost" id="btnVerify">توثيق الحساب</button>
  `);

  const btn = document.getElementById("btnVerify");
  if (btn) {
    btn.onclick = () => {
      alert(
        "توثيق الحساب (اختياري)\n\n" +
        "- يفيد التجّار أو اللي بينشروا كثير\n" +
        "- يحمي حسابك إذا غيّرت الجهاز أو مسحت المتصفح\n\n" +
        "قريباً: توثيق عبر الإيميل (رابط دخول)"
      );
    };
  }
}

// ✅ للإبقاء على التوافق مع ملفات قديمة
export function requireAuth() {
  return true;
}
