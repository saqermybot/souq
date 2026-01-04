// js/notify.js
export const Notify = (() => {
  // نطلب الإذن مرة واحدة وبطريقة لطيفة
  async function ensurePermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    try {
      const p = await Notification.requestPermission();
      return p;
    } catch {
      return "error";
    }
  }

  function show({ title = "رسالة جديدة 💬", body = "", tag = "inbox" } = {}) {
    if (!("Notification" in window)) return false;
    if (Notification.permission !== "granted") return false;

    try {
      new Notification(title, { body, tag });
      return true;
    } catch {
      return false;
    }
  }

  return { ensurePermission, show };
})();