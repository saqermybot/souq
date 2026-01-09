# Souq Syria — Project Map

هذه الوثيقة هدفها تمنع الضياع أثناء التطوير والصيانة.

## الجذر (Root)

- **index.html**
  - الصفحة الرئيسية: الهيدر، الفلاتر، عرض الإعلانات، صفحة التفاصيل، الشات، صفحة الإضافة، مودال الأدمن.
- **app.js**
  - نقطة التشغيل: يهيّئ Firebase + يربط الموديولات (UI / Auth / Listings / Chat / Categories / Add Listing).
- **firestore.rules**
  - قواعد Firestore (قراءة عامة للإعلانات + ملكية التعديل/الحذف + شات للمشاركين + صلاحيات أدمن).
- **base.css / components.css**
  - ستايلات عامة + مكوّنات (cards/buttons/modals/...).
- **profile.html / store.html**
  - صفحات إضافية (حسب استخدامك الحالي).
- **CNAME**
  - ربط الدومين.

## مجلد js/

- **firebase.js**
  - إعداد Firebase (app / db / auth) + إعدادات persistence.
- **auth.js**
  - منطق الجلسة:
    - الزوار: Anonymous تلقائي (بدون Google).
    - الأدمن: Email/Password.
    - تسجيل الخروج: Admin-only.
- **ui.js**
  - مراجع عناصر DOM + state مركزي + actions (فتح/إغلاق الصفحات، toast…).
- **listings.js**
  - جلب الإعلانات + الفلترة + pagination + صفحة التفاصيل + منطق “إعلاناتي/مفضلاتي”.
- **addListing.js**
  - نموذج نشر الإعلان + رفع الصور + التحقق + حفظ البيانات.
  - رقم الواتساب اختياري.
- **categories.js**
  - تحميل الأقسام/الـ types من Firestore وتعبئة select للفلترة والنشر.
- **chat.js**
  - إنشاء غرف الشات + إرسال/عرض الرسائل.
- **inbox.js**
  - قائمة المحادثات (inbox) وتحديثها.
- **favorites.js**
  - إضافة/حذف من المفضلة + عرض عداد المفضلة.
- **guest.js**
  - أدوات خفيفة للزائر (local id) — حالياً الاعتماد الأساسي على Anonymous.
- **utils.js**
  - دوال مساعدة (تنسيق، حماية HTML، وقت…).
- **notify.js**
  - Toast/تنبيهات UI.
- **config.js**
  - إعدادات ثابتة (مدن، إيميلات/UIDs الأدمن، حدود…).
- **profile.js / store.js**
  - منطق الصفحات الإضافية.

## functions/
اختياري (غير أساسي للواجهة). يستخدم للتكاملات (مثل Telegram) إذا رغبت.
