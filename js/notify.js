// js/notify.js
export const Notify = (() => {
  let audio = null;
  let unlocked = false;

  function init() {
    // جهّز الصوت (حط ملفين لتوافق أعلى)
    audio = new Audio("./assets/notify.mp3");
    audio.preload = "auto";

    // iOS/Safari: لازم "لمسة" أول مرة ليفتح الصوت
    const unlock = async () => {
      if (unlocked) return;
      unlocked = true;
      try {
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      } catch {}
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
  }

  async function askPermission() {
    if (!("Notification" in window)) return "unsupported";
    try {
      if (Notification.permission === "granted") return "granted";
      if (Notification.permission === "denied") return "denied";
      const p = await Notification.requestPermission();
      return p;
    } catch {
      return "error";
    }
  }

  async function ping({ title = "رسالة جديدة", body = "", tag = "inbox" } = {}) {
    // 1) صوت + اهتزاز
    try {
      if (audio) {
        audio.currentTime = 0;
        await audio.play();
      }
    } catch {}
    try {
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    } catch {}

    // 2) إشعار متصفح (إذا مسموح)
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, tag });
      }
    } catch {}
  }

  return { init, askPermission, ping };
})();