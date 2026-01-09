# Changelog

## Step 11 (2026-01-09)
- Performance: خفّضنا تحميل المفضلات من 120 إلى 30.
- Refactor: عرّفنا ثوابت `LIST_PAGE_SIZE` و `FAV_PAGE_SIZE` في `js/listings.js`.
- Docs: أضفنا PROJECT_MAP.md و PERFORMANCE.md لتسهيل الصيانة ومنع الضياع.

ملاحظة: باقي المنطق لم يتغير (نفس UI ونفس قواعد العمل).

## Step 12 - Location capture (A)
- Add optional approximate device location capture on publish (rounded coords + cached).
- Store `location` field on listing when available; never blocks publishing if denied.
