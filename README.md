# souq

## ✅ ميزة المفضلة + العداد

تمت إضافة:

- **مفضلة لكل مستخدم** عبر المسار: `users/{uid}/favorites/{listingId}`
- **عداد مفضلة عام** داخل الإعلان: `listings/{id}.favCount`
- **عداد مشاهدات/نقرات حقيقية** عند فتح صفحة التفاصيل: `listings/{id}.viewsCount`
  - فيه حماية بسيطة تمنع التكرار السريع لنفس الإعلان (TTL = دقيقتين) عبر `localStorage`.

### Firestore rules (اقتراح)

> عدّلها حسب قواعدك الحالية (هنا مثال منطقي فقط):

```js
match /users/{uid}/favorites/{listingId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}

match /listings/{listingId} {
  // القراءة للجميع
  allow read: if true;

  // الكتابة: حسب مشروعك (مثلاً فقط صاحب الإعلان)
  // لكن للسماح بزيادة counters من الواجهة:
  allow update: if true;
}
```

> الأفضل أمنياً: تجعل تحديث `favCount` و `viewsCount` عبر Cloud Function، لكن هذا مشروع Front-end خفيف فاعتمدنا زيادة مباشرة مع Transaction.