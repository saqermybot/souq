export const CLOUDINARY = {
  cloudName: "dr59awqcq",
  uploadPreset: "souq_unsigned",
  folder: "souq/listings"
};

export const SY_CITIES = [
  "دمشق","ريف دمشق","حمص","حماة","حلب","اللاذقية","طرطوس","إدلب",
  "دير الزور","الرقة","الحسكة","درعا","السويداء","القنيطرة"
];

export const MAX_IMAGES = 3;

// =========================
// ✅ API (سيرفرك) — مهم لسوريا
// ضع رابط الـ API الحقيقي بعد ما تنشره (مثال: https://api.souqsy.org)
// أثناء التطوير المحلي: http://localhost:3000
// =========================
export const API_BASE = "http://localhost:3000";

// ✅ أصناف ثابتة (بدل Firestore) لتفادي مشاكل الوصول داخل سوريا
export const CATEGORIES = [
  { id: "cars", name_ar: "سيارات", order: 1, isActive: true },
  { id: "realestate", name_ar: "عقارات", order: 2, isActive: true },
  { id: "electronics", name_ar: "إلكترونيات", order: 3, isActive: true },
  { id: "clothing", name_ar: "ملابس و أحذية", order: 4, isActive: true }
];

// ✅ Admin (مالك الموقع) — ضع UID أو البريد الإلكتروني الخاص بك هنا
// يمكنك معرفة UID من Firebase Authentication (Users) أو عبر console أثناء تسجيل دخولك.
export const ADMIN_UIDS = [
  // "PUT_YOUR_UID_HERE"
];

export const ADMIN_EMAILS = [
  "alhossiniabdulhalim2@gmail.com"
];
