import { UI } from "./js/ui.js";
import { initListings } from "./js/listings.js";
import { initAddListing } from "./js/addListing.js";
import { initAuth } from "./js/auth.js";
import { initCategories } from "./js/categories.js";
import { initChat } from "./js/chat.js";
import { Notify } from "./js/notify.js";

document.documentElement.setAttribute("data-theme", "dark");
try { localStorage.setItem("theme", "dark"); } catch {}

function installGlobalErrorDebug(){
  window.addEventListener("error", (e)=>{
    console.warn("JS error:", e?.message, e?.error);
  });
  window.addEventListener("unhandledrejection", (e)=>{
    console.warn("Promise rejection:", e?.reason);
  });
}

async function main(){
  installGlobalErrorDebug();

  UI.init();

  // iOS: طلب الإشعارات بدون gesture ممكن يسبب لخبطة، خليه safe
  try { Notify.ensurePermission(); } catch {}

  // actions
  initListings();
  initAddListing();
  initChat();    // قبل auth تمام
  initAuth();

  try{
    await initCategories();
  }catch(e){
    console.warn("initCategories failed", e);
  }

  UI.state.filtersActive = false;
  UI.state.onlyMine = false;

  try{
    await UI.actions.loadListings(true);
  }catch(e){
    console.warn("loadListings failed", e);
  }

  if ((location.hash || "").startsWith("#listing=")) {
    try { await UI.handleHash?.(); } catch (e) { console.warn("handleHash failed", e); }
  }

  window.addEventListener("hashchange", async () => {
    try{
      if (typeof UI.handleHash === "function") UI.handleHash();
      if (!(location.hash || "").startsWith("#listing=")) {
        UI.hide?.(UI.el.detailsPage);
      }
    }catch(e){
      console.warn("hashchange handler failed", e);
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  main().catch(e => console.warn("main failed", e));
});