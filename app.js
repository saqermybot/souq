import { UI } from "./js/ui.js";
import { initListings } from "./js/listings.js";
import { initAddListing } from "./js/addListing.js";
import { initAuth } from "./js/auth.js";
import { initCategories } from "./js/categories.js";
import { initChat } from "./js/chat.js";

UI.init();

// ✅ جهّز actions أولاً قبل auth
initListings();
initAddListing();

initAuth();
await initCategories();
initChat();

// أول تحميل
await UI.actions.loadListings(true);