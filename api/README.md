# Souq Syria API (Node + SQLite)

هذه الـ API هي الجزء الذي يجعل الموقع يعمل داخل سوريا بدون Firebase.

## التشغيل محلياً

```bash
cd api
npm i
npm run dev
```

الـ API ستعمل على:
- `http://localhost:3000`

> **مهم:** في الواجهة (web) غيّر `API_BASE` داخل `js/config.js` لعنوان الـ API الحقيقي بعد النشر.

## النشر (مقترح)
- VPS (ألمانيا) + Nginx Reverse Proxy + SSL


## لوحة الأدمن

- افتح: `/admin/login`
- عيّن متغير البيئة `ADMIN_KEY` على السيرفر.

مثال:
```bash
export ADMIN_KEY="ضع_مفتاح_قوي_هنا"
export CORS_ORIGIN="https://saqermybot.github.io"
node server.js
```

> لوحة الأدمن تتيح: إخفاء/تفعيل/حذف الإعلانات، مشاهدة البلاغات، حظر/فك حظر المستخدمين.
