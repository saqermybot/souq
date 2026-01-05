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

const LS_LAST_SEEN = "inbox_lastSeen_ms";
const LS_LAST_UPDATE = "inbox_lastUpdate_ms";

let filterListingId = null; // ✅ فلتر اختياري

export function initInbox() {
  UI.actions.openInbox = openInbox;
  UI.actions.closeInbox = closeInbox;
  UI.actions.loadInbox = loadInbox;
}

/**
 * openInbox(listingId?)
 * - إذا listingId موجود => اعرض محادثات هذا الإعلان فقط
 */
function openInbox(listingId = null) {
  try { requireAuth(); } catch { return; }

  filterListingId = listingId || null;

  // ✅ اعتبر أن المستخدم "شاف" الرسائل بمجرد فتح inbox
  try { localStorage.setItem(LS_LAST_SEEN, String(Date.now())); } catch {}
  try { window.__refreshInboxDot?.(); } catch {}

  UI.showInboxPage();
  loadInbox();
}

function closeInbox() {
  UI.hide(UI.el.inboxPage);
  filterListingId = null;
}

async function loadInbox() {
  try { requireAuth(); } catch { return; }

  UI.el.inboxList.innerHTML = "";
  UI.setInboxEmpty(false);

  const me = auth.currentUser.uid;

  const base = query(
    collection(db, "chats"),
    where("participants", "array-contains", me),
    limit(80)
  );

  const snap = await getDocs(base);

  const rows = [];
  snap.forEach((ds) => {
    const d = ds.data() || {};

    // ✅ فلتر حسب الإعلان (إذا مفعل)
    if (filterListingId && d.listingId !== filterListingId) return;

    const updatedMs =
      d.updatedAt?.toDate ? d.updatedAt.toDate().getTime() :
      (d.updatedAt instanceof Date ? d.updatedAt.getTime() : 0);

    rows.push({ id: ds.id, ...d, _updatedMs: updatedMs });
  });

  // ✅ أحدث بالأول
  rows.sort((a, b) => (b._updatedMs || 0) - (a._updatedMs || 0));

  if (!rows.length) {
    UI.setInboxEmpty(true);
    // حتى لو فاضي، خلّي النقطة تتحدث
    try { window.__refreshInboxDot?.(); } catch {}
    return;
  }

  // ✅ خزّن آخر تحديث حتى auth يطلع النقطة
  const newest = rows[0]._updatedMs || 0;
  try { localStorage.setItem(LS_LAST_UPDATE, String(newest)); } catch {}
  try { window.__refreshInboxDot?.(); } catch {}

  rows.forEach((c) => {
    const participants = Array.isArray(c.participants) ? c.participants : [];
    const otherId = participants.find((x) => x !== me) || "";

    const title = c.listingTitle || "محادثة";
    const last = c.lastText || "لا توجد رسائل بعد…";

    const time = c.updatedAt?.toDate
      ? c.updatedAt.toDate().toLocaleString()
      : "";

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
      if (typeof UI.actions.openChat === "function") {
        UI.actions.openChat(c.listingId, c.listingTitle || "إعلان", otherId);
      }
    };

    UI.el.inboxList.appendChild(item);
  });
}