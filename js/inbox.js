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

export function initInbox(){
  UI.actions.openInbox = openInbox;
  UI.actions.closeInbox = closeInbox;
  UI.actions.loadInbox = loadInbox;
}

function openInbox(){
  try{ requireAuth(); }catch{ return; }
  UI.showInboxPage();
  loadInbox();
}

function closeInbox(){
  UI.hide(UI.el.inboxPage);
}

async function loadInbox(){
  try{ requireAuth(); }catch{ return; }

  const me = auth.currentUser.uid;

  UI.el.inboxList.innerHTML = `<div class="muted small">جاري التحميل...</div>`;
  UI.setInboxEmpty(false);

  // ✅ بدون orderBy لتجنب Index — نرتب محلياً
  const qy = query(
    collection(db, "chats"),
    where("participants", "array-contains", me),
    limit(60)
  );

  const snap = await getDocs(qy);

  const rows = [];
  snap.forEach(d=>{
    const c = d.data() || {};
    const updated =
      c.updatedAt?.toDate ? c.updatedAt.toDate().getTime()
      : (c.updatedAt?.seconds ? c.updatedAt.seconds * 1000 : 0);

    rows.push({
      id: d.id,
      listingId: c.listingId || "",
      listingTitle: c.listingTitle || "إعلان",
      buyerId: c.buyerId || "",
      sellerId: c.sellerId || "",
      lastText: c.lastText || "",
      updatedAt: updated
    });
  });

  // ترتيب محلي: الأحدث أولاً
  rows.sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (!rows.length){
    UI.el.inboxList.innerHTML = "";
    UI.setInboxEmpty(true);
    return;
  }

  UI.el.inboxList.innerHTML = "";
  rows.forEach(r=>{
    const otherId = (r.buyerId === me) ? r.sellerId : r.buyerId;
    const timeTxt = r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "";

    const item = document.createElement("div");
    item.className = "inboxItem";
    item.innerHTML = `
      <div class="inboxTop">
        <div class="inboxTitle">${escapeHtml(r.listingTitle)}</div>
        <div class="inboxTime">${escapeHtml(timeTxt)}</div>
      </div>
      <div class="inboxLast">${escapeHtml(r.lastText || "")}</div>
    `;

    item.onclick = async () => {
      // افتح المحادثة مباشرة
      UI.actions.openChat(r.listingId, r.listingTitle, otherId);
    };

    UI.el.inboxList.appendChild(item);
  });
}