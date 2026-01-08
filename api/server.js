import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { nanoid } from "nanoid";
import { db, nowMs } from "./db.js";

const app = express();

// ===== CORS (لـ GitHub Pages)
const allowed = (process.env.CORS_ORIGIN || "*").split(",").map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowed.includes("*") || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked"), false);
  },
  credentials: true
}));

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ===== Cookie settings
const COOKIE_NAME = "dt";
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365;
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "true") === "true";

function setDeviceCookie(res, token){
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE
  });
}

function getOrCreateUser(req, res){
  let token = req.cookies[COOKIE_NAME];
  if (token){
    const row = db.prepare("SELECT id, device_token FROM users WHERE device_token = ?").get(token);
    if (row) return row;
  }

  // create new
  token = nanoid(48);
  const id = nanoid(12);
  const created = nowMs();
  db.prepare("INSERT INTO users (id, device_token, created_at) VALUES (?, ?, ?)").run(id, token, created);
  setDeviceCookie(res, token);
  return { id, device_token: token };
}

function requireUser(req, res, next){
  try{
    const u = getOrCreateUser(req, res);
    req.userId = u.id;
    next();
  }catch(e){
    res.status(500).json({ error: "server_error" });
  }
}

// ===== DB migrations (safe)
function migrate(){
  // add columns if missing
  try{
    const userCols = db.prepare("PRAGMA table_info(users)").all().map(r => r.name);
    if (!userCols.includes("banned")){
      db.prepare("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0").run();
    }

    const listingCols = db.prepare("PRAGMA table_info(listings)").all().map(r => r.name);
    if (!listingCols.includes("is_active")){
      db.prepare("ALTER TABLE listings ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1").run();
    }

    db.prepare(`CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    )`).run();
  }catch(e){
    console.warn("Migration warning:", e?.message || e);
  }
}
migrate();

// ===== Admin auth (secret key)
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const ADMIN_COOKIE = "adm";
const ADMIN_SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 days

function setAdminCookie(res, token){
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE
  });
}

function requireAdmin(req, res, next){
  const t = req.cookies[ADMIN_COOKIE];
  if (!t) return res.redirect("/admin/login");
  const row = db.prepare("SELECT token, created_at FROM admin_sessions WHERE token = ?").get(t);
  if (!row) return res.redirect("/admin/login");
  // expiry
  if ((nowMs() - row.created_at) > ADMIN_SESSION_MAX_AGE){
    db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(t);
    res.clearCookie(ADMIN_COOKIE);
    return res.redirect("/admin/login");
  }
  next();
}

function h(str){
  return String(str ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function adminLayout(title, body){
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${h(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; margin:0; background:#0b1220; color:#e5e7eb;}
  a{color:#93c5fd; text-decoration:none}
  .top{position:sticky; top:0; background:#0f172a; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.08); display:flex; gap:10px; align-items:center; justify-content:space-between}
  .nav a{margin-inline-start:10px; font-weight:700}
  .wrap{max-width:1100px; margin:0 auto; padding:18px 14px}
  .card{background:#0f172a; border:1px solid rgba(255,255,255,.08); border-radius:14px; padding:14px; margin:12px 0}
  table{width:100%; border-collapse:collapse}
  th,td{padding:10px; border-bottom:1px solid rgba(255,255,255,.08); vertical-align:top}
  th{font-size:13px; color:#cbd5e1; text-align:right}
  td{font-size:14px}
  .pill{display:inline-block; padding:4px 10px; border-radius:999px; font-size:12px; border:1px solid rgba(255,255,255,.12)}
  .ok{background:rgba(34,197,94,.14)}
  .bad{background:rgba(239,68,68,.14)}
  .muted{color:#9ca3af; font-size:12px}
  input,select{background:#0b1220; color:#e5e7eb; border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:10px; outline:none}
  button{background:#22c55e; border:none; color:#04110a; font-weight:900; border-radius:12px; padding:10px 12px; cursor:pointer}
  .btn2{background:#ef4444; color:#1a0505}
  .btn3{background:#60a5fa; color:#071323}
  form.inline{display:inline}
</style>
</head>
<body>
  <div class="top">
    <div style="font-weight:900">لوحة الأدمن</div>
    <div class="nav">
      <a href="/admin">الرئيسية</a>
      <a href="/admin/listings">الإعلانات</a>
      <a href="/admin/reports">البلاغات</a>
      <a href="/admin/users">المستخدمون</a>
      <a href="/admin/logout">خروج</a>
    </div>
  </div>
  <div class="wrap">
    ${body}
  </div>
</body>
</html>`;
}




// ===== Health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ===== Guest start
app.post("/api/guest/start", (req, res) => {
  const u = getOrCreateUser(req, res);
  res.json({ ok: true, userId: u.id });
});

// ===== Me
app.get("/api/me", (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.json({ userId: null, verified: false });
  const u = db.prepare("SELECT id, verified FROM users WHERE device_token = ?").get(token);
  if (!u) return res.json({ userId: null, verified: false });
  res.json({ userId: u.id, verified: !!u.verified });
});

// ===== Categories (static)
app.get("/api/categories", (req, res) => {
  // يمكنك تعديلها لاحقاً أو تحميلها من ملف
  res.json({
    items: [
      { id: "cars", name_ar: "سيارات", order: 1, isActive: true },
      { id: "realestate", name_ar: "عقارات", order: 2, isActive: true },
      { id: "electronics", name_ar: "إلكترونيات", order: 3, isActive: true },
      { id: "clothing", name_ar: "ملابس و أحذية", order: 4, isActive: true }
    ]
  });
});

// ===== Listings
function mapListing(r){
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    description: r.description,
    price: r.price,
    currency: r.currency,
    city: r.city,
    categoryId: r.category_id,
    categoryNameAr: r.category_name_ar,
    sellerName: r.seller_name,
    whatsapp: r.whatsapp,
    images: JSON.parse(r.images_json || "[]"),
    extra: JSON.parse(r.extra_json || "{}"),
    isActive: !!r.is_active,
    createdAt: r.created_at,
    viewsCount: r.views_count,
    favCount: r.fav_count
  };
}

app.get("/api/listings", (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 12)));
  const cursor = (req.query.cursor || "").toString().trim();
  const q = (req.query.q || "").toString().trim();
  const city = (req.query.city || "").toString().trim();
  const cat = (req.query.cat || "").toString().trim();

  let sql = "SELECT * FROM listings WHERE is_active = 1";
  const params = [];

  if (city){ sql += " AND city = ?"; params.push(city); }
  if (cat){ sql += " AND category_id = ?"; params.push(cat); }
  if (q){
    sql += " AND (title LIKE ? OR description LIKE ?)";
    const like = `%${q.replace(/%/g, "")}%`;
    params.push(like, like);
  }
  if (cursor){
    sql += " AND created_at < ?";
    params.push(Number(cursor));
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  const items = rows.map(mapListing);
  const nextCursor = rows.length === limit ? String(rows[rows.length - 1].created_at) : null;
  res.json({ items, nextCursor });
});

app.get("/api/listings/:id", (req, res) => {
  const id = req.params.id;
  const r = db.prepare("SELECT * FROM listings WHERE id = ?").get(id);
  if (!r || !r.is_active) return res.status(404).json({ error: "not_found" });
  res.json(mapListing(r));
});

app.post("/api/listings", requireUser, (req, res) => {
  const b = req.body || {};
  const title = String(b.title || "").trim();
  const description = String(b.description || "").trim();
  const city = String(b.city || "").trim();
  const categoryId = String(b.categoryId || "").trim();
  const categoryNameAr = String(b.categoryNameAr || "").trim();
  const price = Number(b.price || 0) || 0;
  const currency = String(b.currency || "SYP").trim();
  const sellerName = String(b.sellerName || "مستخدم").trim();
  const whatsapp = String(b.whatsapp || "").trim();
  const images = Array.isArray(b.images) ? b.images.slice(0, 6) : [];
  const extra = (b.extra && typeof b.extra === "object") ? b.extra : {};

  if (!title || !description || !city || !categoryId) {
    return res.status(400).json({ error: "بيانات الإعلان ناقصة" });
  }

  const id = nanoid(12);
  const createdAt = nowMs();
  db.prepare(`
    INSERT INTO listings (id, owner_id, title, description, price, currency, city, category_id, category_name_ar, seller_name, whatsapp, images_json, extra_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.userId,
    title,
    description,
    price,
    currency,
    city,
    categoryId,
    categoryNameAr || null,
    sellerName || null,
    whatsapp || null,
    JSON.stringify(images),
    JSON.stringify(extra),
    createdAt
  );

  res.json({ ok: true, id });
});

app.delete("/api/listings/:id", requireUser, (req, res) => {
  const id = req.params.id;
  const r = db.prepare("SELECT owner_id FROM listings WHERE id = ?").get(id);
  if (!r) return res.status(404).json({ error: "not_found" });
  if (r.owner_id !== req.userId) return res.status(403).json({ error: "forbidden" });
  db.prepare("UPDATE listings SET is_active = 0 WHERE id = ?").run(id);
  res.status(204).end();
});

app.post("/api/listings/:id/view", (req, res) => {
  const id = req.params.id;
  db.prepare("UPDATE listings SET views_count = views_count + 1 WHERE id = ?").run(id);
  res.json({ ok: true });
});

// ===== Favorites
app.post("/api/favorites/set", requireUser, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.json({ ids: [] });
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT listing_id FROM favorites WHERE user_id = ? AND listing_id IN (${placeholders})`).all(req.userId, ...ids);
  res.json({ ids: rows.map(r => r.listing_id) });
});

app.post("/api/listings/:id/fav", requireUser, (req, res) => {
  const id = req.params.id;
  const on = !!req.body?.on;

  const exists = db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?").get(req.userId, id);

  if (on && !exists){
    db.prepare("INSERT OR IGNORE INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, ?)").run(req.userId, id, nowMs());
    db.prepare("UPDATE listings SET fav_count = fav_count + 1 WHERE id = ?").run(id);
  }
  if (!on && exists){
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND listing_id = ?").run(req.userId, id);
    db.prepare("UPDATE listings SET fav_count = CASE WHEN fav_count>0 THEN fav_count-1 ELSE 0 END WHERE id = ?").run(id);
  }

  const favCount = db.prepare("SELECT fav_count FROM listings WHERE id = ?").get(id)?.fav_count ?? 0;
  const isFav = !!db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?").get(req.userId, id);
  res.json({ ok: true, isFav, favCount });
});

// ===== Reports
app.post("/api/reports", requireUser, (req, res) => {
  const listingId = String(req.body?.listingId || "").trim();
  const reason = String(req.body?.reason || "").trim();
  if (!listingId || !reason) return res.status(400).json({ error: "بيانات البلاغ ناقصة" });
  const id = nanoid(12);
  db.prepare("INSERT INTO reports (id, user_id, listing_id, reason, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, req.userId, listingId, reason, nowMs());
  res.json({ ok: true });
});

// =========================
// Admin routes
// =========================

// Login page
app.get("/admin/login", (req, res) => {
  const msg = req.query?.m ? `<div class="card bad">⚠️ ${h(req.query.m)}</div>` : "";
  res.send(adminLayout("دخول الأدمن", `
    ${msg}
    <div class="card">
      <h2 style="margin:0 0 10px">دخول لوحة الأدمن</h2>
      <div class="muted">ضع مفتاح الأدمن (ADMIN_KEY) الموجود على السيرفر.</div>
      <form method="POST" action="/admin/login" style="margin-top:12px">
        <input name="key" placeholder="مفتاح الأدمن" style="width:100%;max-width:420px" />
        <div style="margin-top:10px">
          <button type="submit">دخول</button>
        </div>
      </form>
    </div>
  `));
});

app.post("/admin/login", express.urlencoded({ extended: true }), (req, res) => {
  if (!ADMIN_KEY) return res.redirect("/admin/login?m=" + encodeURIComponent("ADMIN_KEY غير مضبوط على السيرفر"));
  const key = String(req.body?.key || "");
  if (key !== ADMIN_KEY) return res.redirect("/admin/login?m=" + encodeURIComponent("مفتاح غير صحيح"));
  const token = nanoid(48);
  db.prepare("INSERT INTO admin_sessions (token, created_at) VALUES (?, ?)").run(token, nowMs());
  setAdminCookie(res, token);
  res.redirect("/admin");
});

app.get("/admin/logout", (req, res) => {
  const t = req.cookies[ADMIN_COOKIE];
  if (t) db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(t);
  res.clearCookie(ADMIN_COOKIE);
  res.redirect("/admin/login");
});

// Dashboard
app.get("/admin", requireAdmin, (req, res) => {
  const totalListings = db.prepare("SELECT COUNT(*) c FROM listings").get().c;
  const activeListings = db.prepare("SELECT COUNT(*) c FROM listings WHERE is_active = 1").get().c;
  const totalUsers = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  const bannedUsers = db.prepare("SELECT COUNT(*) c FROM users WHERE banned = 1").get().c;
  const reports24h = db.prepare("SELECT COUNT(*) c FROM reports WHERE created_at > ?").get(nowMs() - 24*60*60*1000).c;

  res.send(adminLayout("الرئيسية", `
    <div class="card">
      <h2 style="margin:0 0 12px">ملخص</h2>
      <div style="display:flex; flex-wrap:wrap; gap:10px">
        <span class="pill ok">إعلانات فعالة: ${activeListings}</span>
        <span class="pill">كل الإعلانات: ${totalListings}</span>
        <span class="pill">المستخدمون: ${totalUsers}</span>
        <span class="pill bad">محظورون: ${bannedUsers}</span>
        <span class="pill">بلاغات آخر 24 ساعة: ${reports24h}</span>
      </div>
      <div class="muted" style="margin-top:10px">نصيحة: إذا ظهر سبام، عطّل الإعلان ثم احظر المستخدم.</div>
    </div>
  `));
});

// Listings table
app.get("/admin/listings", requireAdmin, (req, res) => {
  const q = String(req.query?.q || "").trim();
  const active = String(req.query?.active || "all");
  const where = [];
  const params = [];
  if (q){
    where.push("(title LIKE ? OR description LIKE ? OR city LIKE ? OR whatsapp LIKE ? OR owner_id LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (active === "1"){ where.push("is_active = 1"); }
  if (active === "0"){ where.push("is_active = 0"); }

  const whereSql = where.length ? ("WHERE " + where.join(" AND ")) : "";
  const rows = db.prepare(`
    SELECT id, owner_id, title, city, category_id, price, currency, created_at, is_active, whatsapp, fav_count, views_count
    FROM listings
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT 200
  `).all(...params);

  const itemsHtml = rows.map(r => {
    const state = r.is_active ? `<span class="pill ok">فعال</span>` : `<span class="pill bad">مخفي</span>`;
    return `<tr>
      <td style="min-width:220px">
        <div style="font-weight:900">${h(r.title)}</div>
        <div class="muted">${h(r.id)} · مالك: ${h(r.owner_id)}</div>
        <div class="muted">${new Date(r.created_at).toLocaleString("ar")}</div>
      </td>
      <td>${h(r.city)}<div class="muted">${h(r.category_id || "")}</div></td>
      <td>${h(r.price)} ${h(r.currency || "")}<div class="muted">❤️ ${r.fav_count || 0} · 👁️ ${r.views_count || 0}</div></td>
      <td>${state}</td>
      <td style="white-space:nowrap">
        <form class="inline" method="POST" action="/admin/listings/${encodeURIComponent(r.id)}/toggle">
          <input type="hidden" name="to" value="${r.is_active ? 0 : 1}"/>
          <button class="${r.is_active ? "btn2" : "btn3"}" type="submit">${r.is_active ? "إخفاء" : "تفعيل"}</button>
        </form>
        <form class="inline" method="POST" action="/admin/listings/${encodeURIComponent(r.id)}/delete" onsubmit="return confirm('حذف نهائي؟');">
          <button class="btn2" type="submit">حذف</button>
        </form>
        <form class="inline" method="POST" action="/admin/users/${encodeURIComponent(r.owner_id)}/ban" onsubmit="return confirm('حظر/فك حظر المستخدم؟');">
          <button type="submit">حظر/فك</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  res.send(adminLayout("الإعلانات", `
    <div class="card">
      <form method="GET" action="/admin/listings" style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
        <input name="q" value="${h(q)}" placeholder="بحث (عنوان/مدينة/وصف/واتساب/مالك)..." style="flex:1; min-width:220px"/>
        <select name="active">
          <option value="all"${active==="all"?" selected":""}>الكل</option>
          <option value="1"${active==="1"?" selected":""}>فعال</option>
          <option value="0"${active==="0"?" selected":""}>مخفي</option>
        </select>
        <button type="submit">بحث</button>
      </form>
    </div>

    <div class="card">
      <div class="muted">آخر 200 إعلان (للأداء). استخدم البحث للتصفية.</div>
      <table>
        <thead>
          <tr>
            <th>الإعلان</th>
            <th>المدينة/التصنيف</th>
            <th>السعر</th>
            <th>الحالة</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml || `<tr><td colspan="5" class="muted">لا يوجد نتائج</td></tr>`}
        </tbody>
      </table>
    </div>
  `));
});

app.post("/admin/listings/:id/toggle", requireAdmin, express.urlencoded({ extended: true }), (req, res) => {
  const id = req.params.id;
  const to = Number(req.body?.to || 0) ? 1 : 0;
  db.prepare("UPDATE listings SET is_active = ? WHERE id = ?").run(to, id);
  res.redirect("/admin/listings");
});

app.post("/admin/listings/:id/delete", requireAdmin, (req, res) => {
  const id = req.params.id;
  db.prepare("DELETE FROM favorites WHERE listing_id = ?").run(id);
  db.prepare("DELETE FROM reports WHERE listing_id = ?").run(id);
  db.prepare("DELETE FROM listings WHERE id = ?").run(id);
  res.redirect("/admin/listings");
});

// Reports
app.get("/admin/reports", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.listing_id, r.user_id, r.reason, r.created_at,
           l.title as listing_title, l.owner_id as owner_id, l.is_active as is_active
    FROM reports r
    LEFT JOIN listings l ON l.id = r.listing_id
    ORDER BY r.created_at DESC
    LIMIT 300
  `).all();

  const html = rows.map(r => {
    const state = r.is_active ? `<span class="pill ok">الإعلان فعال</span>` : `<span class="pill bad">الإعلان مخفي/محذوف</span>`;
    return `<tr>
      <td>
        <div style="font-weight:900">${h(r.reason)}</div>
        <div class="muted">${new Date(r.created_at).toLocaleString("ar")} · بلاغ: ${h(r.id)}</div>
      </td>
      <td>
        <div>${h(r.listing_title || "غير موجود")}</div>
        <div class="muted">ID: ${h(r.listing_id)}</div>
        <div class="muted">مالك: ${h(r.owner_id || "-")}</div>
        ${state}
      </td>
      <td style="white-space:nowrap">
        ${r.listing_id ? `
        <form class="inline" method="POST" action="/admin/listings/${encodeURIComponent(r.listing_id)}/toggle">
          <input type="hidden" name="to" value="0"/>
          <button class="btn2" type="submit">إخفاء الإعلان</button>
        </form>
        <form class="inline" method="POST" action="/admin/listings/${encodeURIComponent(r.listing_id)}/delete" onsubmit="return confirm('حذف نهائي؟');">
          <button class="btn2" type="submit">حذف</button>
        </form>
        ` : ``}
        ${r.owner_id ? `
        <form class="inline" method="POST" action="/admin/users/${encodeURIComponent(r.owner_id)}/ban" onsubmit="return confirm('حظر/فك حظر المستخدم؟');">
          <button type="submit">حظر/فك</button>
        </form>
        ` : ``}
      </td>
    </tr>`;
  }).join("");

  res.send(adminLayout("البلاغات", `
    <div class="card">
      <div class="muted">آخر 300 بلاغ.</div>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>السبب</th><th>الإعلان</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${html || `<tr><td colspan="3" class="muted">لا يوجد بلاغات</td></tr>`}
        </tbody>
      </table>
    </div>
  `));
});

// Users
app.get("/admin/users", requireAdmin, (req, res) => {
  const q = String(req.query?.q || "").trim();
  const where = [];
  const params = [];
  if (q){
    where.push("(id LIKE ? OR email LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like);
  }
  const whereSql = where.length ? ("WHERE " + where.join(" AND ")) : "";
  const rows = db.prepare(`
    SELECT id, created_at, verified, email, banned
    FROM users
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT 300
  `).all(...params);

  const html = rows.map(u => {
    const state = u.banned ? `<span class="pill bad">محظور</span>` : `<span class="pill ok">نشط</span>`;
    const ver = u.verified ? `<span class="pill ok">موثّق</span>` : `<span class="pill">غير موثّق</span>`;
    return `<tr>
      <td><div style="font-weight:900">${h(u.id)}</div><div class="muted">${new Date(u.created_at).toLocaleString("ar")}</div></td>
      <td>${ver}<div class="muted">${h(u.email || "")}</div></td>
      <td>${state}</td>
      <td style="white-space:nowrap">
        <form class="inline" method="POST" action="/admin/users/${encodeURIComponent(u.id)}/ban" onsubmit="return confirm('حظر/فك حظر؟');">
          <button class="${u.banned ? "btn3" : "btn2"}" type="submit">${u.banned ? "فك الحظر" : "حظر"}</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  res.send(adminLayout("المستخدمون", `
    <div class="card">
      <form method="GET" action="/admin/users" style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
        <input name="q" value="${h(q)}" placeholder="بحث ID أو email..." style="flex:1; min-width:220px"/>
        <button type="submit">بحث</button>
      </form>
    </div>

    <div class="card">
      <table>
        <thead><tr><th>المستخدم</th><th>توثيق/إيميل</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${html || `<tr><td colspan="4" class="muted">لا يوجد نتائج</td></tr>`}
        </tbody>
      </table>
    </div>
  `));
});

app.post("/admin/users/:id/ban", requireAdmin, (req, res) => {
  const id = req.params.id;
  const cur = db.prepare("SELECT banned FROM users WHERE id = ?").get(id)?.banned ?? 0;
  const to = cur ? 0 : 1;
  db.prepare("UPDATE users SET banned = ? WHERE id = ?").run(to, id);
  // hide all listings for banned users
  if (to === 1){
    db.prepare("UPDATE listings SET is_active = 0 WHERE owner_id = ?").run(id);
  }
  // redirect back
  const back = req.get("referer") || "/admin/users";
  res.redirect(back);
});


const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Souq API running on :${PORT}`);
});
