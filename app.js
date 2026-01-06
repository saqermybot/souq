// app.js (safe boot + cache-bust)
document.documentElement.setAttribute("data-theme", "dark");
try { localStorage.setItem("theme", "dark"); } catch {}

const V =
  new URLSearchParams(location.search).get("v") ||
  new URL(import.meta.url).searchParams.get("v") ||
  "1";

function showBootError(err){
  const el = document.getElementById("bootError");
  if(!el) return;
  const msg = (err && (err.message || err.code)) ? (err.message || err.code) : String(err);
  el.textContent = "⚠️ خطأ: " + msg;
  el.classList.remove("hidden");
}

function safe(fn){
  try { return fn(); } catch (e){ console.error(e); showBootError(e); }
}
async function safeAsync(fn){
  try { return await fn(); } catch (e){ console.error(e); showBootError(e); }
}

try{
  const [{ UI }, { initListings }, { initAddListing }, { initAuth }, { initChat }] = await Promise.all([
    import(`./js/ui.js?v=${V}`),
    import(`./js/listings.js?v=${V}`),
    import(`./js/addListing.js?v=${V}`),
    import(`./js/auth.js?v=${V}`),
    import(`./js/chat.js?v=${V}`),
  ]);

  // side-effect modules
  await Promise.all([
    import(`./js/categories.js?v=${V}`),
    import(`./js/notify.js?v=${V}`),
    import(`./js/favorites.js?v=${V}`),
    import(`./js/inbox.js?v=${V}`),
    import(`./js/profile.js?v=${V}`),
    import(`./js/store.js?v=${V}`),
  ]);

  safe(() => UI.init());
  safe(() => initAuth());
  safe(() => initListings());
  safe(() => initAddListing());
  safe(() => initChat());

  // always start without filters
  UI.state.filtersActive = false;
  UI.state.onlyMine = false;

  await safeAsync(() => UI.actions.loadListings(true));

  if ((location.hash || "").startsWith("#listing=")) {
    await safeAsync(() => UI.handleHash?.());
  }
}catch(e){
  console.error(e);
  showBootError(e);
}
