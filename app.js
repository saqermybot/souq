import { UI } from "./js/ui.js";
import { initAuth } from "./js/auth.js";
import { initCategories } from "./js/categories.js";
import { initListings } from "./js/listings.js";
import { initAddListing } from "./js/addListing.js";
import { initChat } from "./js/chat.js";

UI.init();

initAuth();
await initCategories();
initListings();
initAddListing();
initChat();

// أول تحميل
await UI.actions.loadListings(true);