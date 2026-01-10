// guest.js - lightweight identity (no Firebase Auth required)
// Group 1: create a stable guest identity + show it in the top bar.

const KEY = "souq_guest";

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function makeId() {
  const rnd = (globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : (Date.now() + "_" + Math.random().toString(16).slice(2)));
  return "g_" + rnd;
}

function makeDisplayNameFromId(id) {
  const short = (String(id).replace(/[^a-zA-Z0-9]/g, "").slice(-4) || "0000").toUpperCase();
  return `مستخدم ${short}`;
}

export function getOrCreateGuest() {
  // Returns: { guestId, displayName, createdAt }
  let obj = null;
  try {
    obj = safeJsonParse(localStorage.getItem(KEY) || "");
  } catch {}

  if (!obj || !obj.guestId) {
    const guestId = makeId();
    obj = {
      guestId,
      displayName: makeDisplayNameFromId(guestId),
      createdAt: Date.now()
    };
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {}
  }

  // Backward-compat: if old key exists
  try {
    const legacy = localStorage.getItem("souq_guest_id");
    if (legacy && !obj.guestId) obj.guestId = legacy;
  } catch {}

  // Ensure displayName exists
  if (!obj.displayName) {
    obj.displayName = makeDisplayNameFromId(obj.guestId);
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {}
  }

  return obj;
}

export function setGuestDisplayName(name) {
  const g = getOrCreateGuest();
  const cleaned = (name || "").trim();
  if (!cleaned) return g;
  g.displayName = cleaned.slice(0, 28);
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch {}
  return g;
}

export function getGuestId() {
  return getOrCreateGuest().guestId;
}

export function getGuestDisplayName() {
  return getOrCreateGuest().displayName;
}

export function initGuestUI() {
  // Put name in header (works even if Firebase Auth is blocked)
  const label = document.getElementById("userLabel");
  if (label) label.textContent = getGuestDisplayName();

  // Bind menu toggle for guests (independent of Firebase Auth)
  const avatar = document.getElementById("userAvatar");
  const menu = document.getElementById("userMenu");
  if (avatar && menu && !window.__souqGuestMenuBound) {
    window.__souqGuestMenuBound = true;
    const toggle = () => menu.classList.toggle("hidden");
    const onClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };
    avatar.addEventListener("click", onClick);
    label && label.addEventListener("click", onClick);
    document.addEventListener("click", () => {
      try { menu.classList.add("hidden"); } catch {}
    });
  }
}

export function isGuestMode() {
  return true;
}
