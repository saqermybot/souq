export function initFilterDrawer(UI) {
  const drawer = UI.el.filterDrawer;
  const handle = UI.el.filterHandle;
  const panel = UI.el.filterContent;
  if (!drawer || !handle || !panel) return;

  const saved = localStorage.getItem("filters_collapsed");
  const startCollapsed = saved === null ? true : saved === "1";
  setCollapsed(startCollapsed);

  function setCollapsed(isCollapsed) {
    drawer.classList.toggle("collapsed", isCollapsed);
    localStorage.setItem("filters_collapsed", isCollapsed ? "1" : "0");
  }

  // tap/click toggles
  handle.addEventListener("click", () => {
    setCollapsed(!drawer.classList.contains("collapsed"));
  });

  // drag hint: swipe down/up on handle
  let startY = 0;
  let moved = false;

  handle.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    moved = false;
    try { handle.setPointerCapture(e.pointerId); } catch {}
  });

  handle.addEventListener("pointermove", (e) => {
    const dy = e.clientY - startY;
    if (Math.abs(dy) < 22) return;
    moved = true;
    if (dy > 0) setCollapsed(false);
    if (dy < 0) setCollapsed(true);
    startY = e.clientY;
  });

  handle.addEventListener("pointerup", () => {
    // منع click بعد السحب
    if (moved) {
      // nothing
    }
  });
}
