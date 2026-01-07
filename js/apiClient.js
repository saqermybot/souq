// apiClient.js
// ✅ طبقة بسيطة للتعامل مع API بدل Firebase (مهم لسوريا)

import { API_BASE } from "./config.js";

async function api(path, { method = "GET", body = null } = {}) {
  const opts = {
    method,
    credentials: "include",
    headers: {}
  };

  if (body != null) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    let msg = "حدث خطأ";
    try {
      const j = await res.json();
      if (j && j.error) msg = j.error;
    } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  // 204
  if (res.status === 204) return null;
  return await res.json();
}

export const API = {
  me: () => api("/api/me"),
  categories: () => api("/api/categories"),
  listings: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      qs.set(k, String(v));
    });
    const q = qs.toString();
    return api(`/api/listings${q ? `?${q}` : ""}`);
  },
  listing: (id) => api(`/api/listings/${encodeURIComponent(id)}`),
  createListing: (payload) => api("/api/listings", { method: "POST", body: payload }),
  deleteListing: (id) => api(`/api/listings/${encodeURIComponent(id)}`, { method: "DELETE" }),
  viewListing: (id) => api(`/api/listings/${encodeURIComponent(id)}/view`, { method: "POST" }),
  fav: (id, on) => api(`/api/listings/${encodeURIComponent(id)}/fav`, { method: "POST", body: { on: !!on } }),
  favSet: (ids = []) => api("/api/favorites/set", { method: "POST", body: { ids } }),
  report: (payload) => api("/api/reports", { method: "POST", body: payload })
};
