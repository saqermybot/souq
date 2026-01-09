// js/placePicker.js
// Lightweight place picker using Leaflet + OpenStreetMap (lazy-loaded on demand)

const LEAFLET_CSS = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS  = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";

const CACHE_KEY = "place_pick_v1";

function roundCoord(x, decimals = 2) {
  const p = Math.pow(10, decimals);
  return Math.round(x * p) / p;
}

function getEls() {
  return {
    btnUse: document.getElementById("btnUseMyLocPlace"),
    btnPick: document.getElementById("btnPickPlace"),
    preview: document.getElementById("placePreview"),
    city: document.getElementById("aCity"),
    lat: document.getElementById("aLat"),
    lng: document.getElementById("aLng"),
    modal: document.getElementById("mapModal"),
    close: document.getElementById("btnCloseMap"),
    mapDiv: document.getElementById("pickMap"),
    mapUse: document.getElementById("btnMapUseMyLoc"),
    mapConfirm: document.getElementById("btnMapConfirm"),
  };
}

function saveCache(obj) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...obj, ts: Date.now() })); } catch {}
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.lat !== "number" || typeof obj.lng !== "number") return null;
    return obj;
  } catch {
    return null;
  }
}

async function reverseGeocodeOSM(lat, lng) {
  // One call on confirm/use location (not continuous)
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("reverse failed");
  const j = await r.json();
  const a = j.address || {};
  const city = a.city || a.town || a.village || a.county || a.state || "";
  const suburb = a.suburb || a.neighbourhood || a.hamlet || "";
  const label = [city, suburb].filter(Boolean).join(" - ");
  return label || (j.display_name ? j.display_name.split(",").slice(0, 2).join(" - ") : "");
}

function setPlace({ lat, lng, label }) {
  const els = getEls();
  const rLat = roundCoord(lat, 2);
  const rLng = roundCoord(lng, 2);
  if (els.lat) els.lat.value = String(rLat);
  if (els.lng) els.lng.value = String(rLng);
  if (els.city) els.city.value = label || "موقع تقريبي";
  if (els.preview) {
    els.preview.textContent = label ? `📍 ${label} (تقريبي)` : "📍 تم تحديد موقع تقريبي";
  }
  saveCache({ lat: rLat, lng: rLng, label: label || "" });
}

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L && typeof window.L.map === "function") return resolve(window.L);

    // CSS
    if (!document.querySelector(`link[data-leaflet]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.setAttribute("data-leaflet", "1");
      document.head.appendChild(link);
    }

    // JS
    const existing = document.querySelector(`script[data-leaflet]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.L));
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = LEAFLET_JS;
    s.async = true;
    s.defer = true;
    s.setAttribute("data-leaflet", "1");
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

let map = null;
let marker = null;

function openModal() {
  const els = getEls();
  if (!els.modal) return;
  els.modal.classList.remove("hidden");
  els.modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const els = getEls();
  if (!els.modal) return;
  els.modal.classList.add("hidden");
  els.modal.setAttribute("aria-hidden", "true");
}

async function ensureMap() {
  const els = getEls();
  if (!els.mapDiv) return;
  const L = await loadLeaflet();

  if (map) return;

  const cached = readCache();
  const center = cached ? [cached.lat, cached.lng] : [35.0, 38.0]; // Syria-ish

  map = L.map(els.mapDiv, { zoomControl: true }).setView(center, cached ? 12 : 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(map);

  marker = L.marker(center, { draggable: true }).addTo(map);

  map.on("click", (e) => {
    marker.setLatLng(e.latlng);
  });
}

async function useMyLocationIntoPlace() {
  if (!navigator.geolocation) {
    alert("المتصفح لا يدعم تحديد الموقع.");
    return;
  }
  const pos = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 9000, maximumAge: 3600000 });
  });
  const lat = roundCoord(pos.coords.latitude, 2);
  const lng = roundCoord(pos.coords.longitude, 2);
  let label = "";
  try { label = await reverseGeocodeOSM(lat, lng); } catch {}
  setPlace({ lat, lng, label });
}

async function init() {
  const els = getEls();
  if (!els.btnUse && !els.btnPick) return;

  // Restore cached preview if available
  const cached = readCache();
  if (cached && els.preview && (!els.lat.value || !els.lng.value)) {
    setPlace({ lat: cached.lat, lng: cached.lng, label: cached.label || "" });
  }

  els.btnUse && els.btnUse.addEventListener("click", async () => {
    try {
      await useMyLocationIntoPlace();
    } catch {
      alert("لم نتمكن من تحديد الموقع. يمكنك اختيار المكان على الخريطة.");
    }
  });

  els.btnPick && els.btnPick.addEventListener("click", async () => {
    openModal();
    try {
      await ensureMap();
      setTimeout(() => { try { map && map.invalidateSize(); } catch {} }, 50);
    } catch {
      alert("تعذر تحميل الخريطة. جرّب لاحقاً أو استخدم موقعك الحالي.");
      closeModal();
    }
  });

  els.close && els.close.addEventListener("click", closeModal);
  els.modal && els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
  });

  els.mapUse && els.mapUse.addEventListener("click", async () => {
    try {
      await useMyLocationIntoPlace();
      if (map && marker && els.lat.value && els.lng.value) {
        const lat = Number(els.lat.value), lng = Number(els.lng.value);
        marker.setLatLng([lat, lng]);
        map.setView([lat, lng], 12);
      }
    } catch {
      alert("لم نتمكن من تحديد الموقع.");
    }
  });

  els.mapConfirm && els.mapConfirm.addEventListener("click", async () => {
    try {
      await ensureMap();
      const ll = marker.getLatLng();
      const lat = roundCoord(ll.lat, 2);
      const lng = roundCoord(ll.lng, 2);
      let label = "";
      try { label = await reverseGeocodeOSM(lat, lng); } catch {}
      setPlace({ lat, lng, label });
      closeModal();
    } catch {
      alert("تعذر تأكيد المكان.");
    }
  });
}

export const PlacePicker = { init };
