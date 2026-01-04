import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { requireAuth } from "./auth.js";
import { escapeHtml } from "./utils.js";

import {
  collection,
  getDocs,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function initInbox() {
  UI.actions.openInbox = openInbox;
  UI.actions.closeInbox = closeInbox;
  UI.actions.loadInbox = loadInbox;
}

function openInbox() {
  try { requireAuth(); } catch { return; }

  UI.showInboxPage();
  loadInbox();
}

function closeInbox() {
  UI.hide(UI.el.inboxPage);
}

async function loadInbox() {
  try { requireAuth(); } catch { return; }

  UI.el.inboxList.innerHTML = "";
  UI.setInboxEmpty(false);

  const me = auth.currentUser.uid;

  // ✅ بدون orderBy لتفادي Index
  const qy = query(
    collection(db, "chats"),
    where("participants", "array-contains", me),
    limit(50)
  );

  const snap = await getDocs(qy);

  const rows = [];
  snap.forEach((ds) => {
    const d = ds.data() || {};
    const updatedMs =
      d.updatedAt?.toDate ? d.updatedAt.toDate().getTime() :
      (d.updatedAt instanceof Date ? d.updatedAt.getTime() : 0);

    rows.push({ id: ds.id, ...d, _updatedMs: updatedMs });
  });

  // ✅ رتب محلياً بالأحدث
  rows.sort((a, b) => (b._updatedMs || 0) - (a._updatedMs || 0));

  if (!rows.length) {
    UI.setInboxEmpty(true);
    return;
  }

  rows.forEach((c) => {
    const participants = Array.isArray(c.participants) ? c.participants : [];
    const otherId = participants.find((x) => x !== me) || "";

    const title = c.listingTitle || "محادثة";
    const last = c.lastText || "لا توجد رسائل بعد…";

    const time = c.updatedAt?.toDate
      ? c.updatedAt.toDate().toLocaleString()
      : "";

    // Avatar حرف (لأننا ما معنا صورة الطرف الآخر)
    const letter = (otherId || "U")[0]?.toUpperCase() || "U";

    const item = document.createElement("div");
    item.className = "inboxItem";
    item.innerHTML = `
      <div class="inboxAvatar">${escapeHtml(letter)}</div>

      <div class="inboxBody">
        <div class="inboxTitle">${escapeHtml(title)}</div>
        <div class="inboxLast">${escapeHtml(last)}</div>
      </div>

      <div class="inboxMeta">
        <div>${escapeHtml(time)}</div>
      </div>
    `;

    item.onclick = () => {
      // ✅ افتح الشات مباشرة
      // openChat(listingId, listingTitle, ownerId/otherId)
      if (typeof UI.actions.openChat === "function") {
        UI.actions.openChat(c.listingId, c.listingTitle || "إعلان", otherId);
      }
    };

    UI.el.inboxList.appendChild(item);
  });
}