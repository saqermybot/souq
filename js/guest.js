// guest.js
// ✅ حساب جهاز تلقائي (بدون تسجيل) — يتفعل فقط عند الفعل

import { API_BASE } from "./config.js";

export async function ensureGuest() {
  // كاش بسيط لتقليل الطلبات (الكوكي هي الأساس)
  if (localStorage.getItem("guest_ready") === "1") return;

  const res = await fetch(`${API_BASE}/api/guest/start`, {
    method: "POST",
    credentials: "include"
  });

  if (!res.ok) {
    // لا نرمي رسالة تقنية
    throw new Error("guest_start_failed");
  }

  try { localStorage.setItem("guest_ready", "1"); } catch {}
}
