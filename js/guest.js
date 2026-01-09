// guest.js - lightweight guest identity (no Firebase Auth required)
export function getGuestId() {
  try {
    let id = localStorage.getItem("souq_guest_id");
    if (!id) {
      const rnd = (crypto?.randomUUID ? crypto.randomUUID() : (Date.now() + "_" + Math.random().toString(16).slice(2)));
      id = "g_" + rnd;
      localStorage.setItem("souq_guest_id", id);
    }
    return id;
  } catch {
    // very old browsers / private mode
    return "g_" + (Date.now() + "_" + Math.random().toString(16).slice(2));
  }
}

export function isGuestMode() {
  return true;
}
