import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import { requireAuth } from "./auth.js";
import { Notify } from "./notify.js";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  where,
  runTransaction,
  increment,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function initChat(){
  UI.actions.openChat = openChat;
  UI.actions.closeChat = closeChat;

  UI.actions.openInbox = openInbox;
  UI.actions.closeInbox = closeInbox;
  UI.actions.loadInbox = loadInbox;

  UI.el.btnSend.onclick = sendMsg;
}

function chatRoomId(listingId, a, b){
  return `listing_${listingId}_${[a,b].sort().join("_")}`;
}

let currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };
let inboxUnsub = null;

// ====== Notifications (sound + browser notif while page open) ======
let lastTotalUnread = 0;

function playBeep(){
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 120);
  }catch{}
}

function notifyBrowser(title, body){
  try{
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      // Ø§Ø·ÙØ¨ ÙØ±Ø© ÙØ§Ø­Ø¯Ø© (ÙÙÙÙ Ø£ÙÙ Ø±Ø³Ø§ÙØ© Ø¬Ø¯ÙØ¯Ø©)
      Notification.requestPermission().then(()=>{});
      return;
    }
    if (Notification.permission !== "granted") return;

    // Ø¥Ø´Ø¹Ø§Ø± Ø¨Ø³ÙØ·
    new Notification(title, { body });
  }catch{}
}

async function resolveOwnerId(listingId){
  const o1 = UI.state.currentListing?.ownerId;
  if (o1) return o1;

  try{
    const snap = await getDoc(doc(db, "listings", listingId));
    if (snap.exists()) return snap.data()?.ownerId || null;
  }catch{}
  return null;
}

/* =========================
   â TOP INDICATORS (Dot/Badge)
========================= */
function setInboxIndicator(totalUnread){
  // Dot (ÙÙ ÙÙØ¬ÙØ¯)
  const dot = document.getElementById("inboxDot");
  if (dot) dot.classList.toggle("hidden", !(totalUnread > 0));

  // Badge (ÙÙ ÙÙØ¬ÙØ¯)
  const badge = document.getElementById("inboxBadge");
  if (badge){
    badge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
    badge.classList.toggle("hidden", !(totalUnread > 0));
  }
}

// ===== helpers: delivery/read maps =====
function hasMapKey(obj, key){
  return obj && typeof obj === "object" && obj[key];
}

function statusIconForMessage(m, me, otherId, isPending){
  // ÙÙØ· ÙØ±Ø³Ø§Ø¦ÙÙ
  if (m.senderId !== me) return "";

  if (isPending) return "â³";          // ÙØ³Ù ÙØ§ Ø§ÙØ­ÙØ¸Øª
  const readBy = m.readBy || {};
  const deliveredTo = m.deliveredTo || {};

  if (hasMapKey(readBy, otherId)) return `<span class="st read">ââ</span>`;
  if (hasMapKey(deliveredTo, otherId)) return `<span class="st">ââ</span>`;
  return `<span class="st">â</span>`;
}

/**
 * openChat(listingId, listingTitle, ownerId?)
 */
async function openChat(listingId, listingTitle = "Ø¥Ø¹ÙØ§Ù", ownerId = null){
  try{ requireAuth(); }catch{ return; }

  UI.resetOverlays();
  UI.show(UI.el.chatBox);
  UI.el.chatTitle.textContent = `ÙØ­Ø§Ø¯Ø«Ø©: ${listingTitle}`;

  const me = auth.currentUser.uid;
  const realOwnerId = ownerId || await resolveOwnerId(listingId);

  if (!realOwnerId){
    UI.el.chatMsgs.innerHTML = `<div class="muted">ØªØ¹Ø°Ø± ØªØ­Ø¯ÙØ¯ ØµØ§Ø­Ø¨ Ø§ÙØ¥Ø¹ÙØ§Ù. Ø¬Ø±ÙØ¨ ÙØªØ­ Ø§ÙØ¥Ø¹ÙØ§Ù Ø«Ù Ø§Ø¶ØºØ· ÙØ±Ø§Ø³ÙØ©.</div>`;
    return;
  }

  if (realOwnerId === me){
    UI.el.chatMsgs.innerHTML = `<div class="muted">ÙØ§ ÙÙÙÙ ÙØ±Ø§Ø³ÙØ© ÙÙØ³Ù.</div>`;
    return;
  }

  const roomId = chatRoomId(listingId, me, realOwnerId);
  currentChat = { listingId, roomId, otherId: realOwnerId, listingTitle };

  const chatDocRef = doc(db, "chats", roomId);

  // â ØªØ£ÙØ¯ ÙØ¬ÙØ¯ Ø§ÙÙÙØªØ§ + unread Ø£Ø³Ø§Ø³ÙØ§Ù
  await setDoc(chatDocRef, {
    listingId,
    listingTitle,
    buyerId: me,
    sellerId: realOwnerId,
    participants: [me, realOwnerId].sort(),
    updatedAt: serverTimestamp(),
    lastText: "",
    unread: { [me]: 0, [realOwnerId]: 0 }
  }, { merge: true });

  // â ÙØªØ­ Ø§ÙØ´Ø§Øª = Ø§Ø¹ØªØ¨Ø±ÙØ§ ÙÙØ±ÙØ¡Ø© Ø¨Ø§ÙÙØ­Ø§Ø¯Ø«Ø© (unread meta)
  try{
    await updateDoc(chatDocRef, { [`unread.${me}`]: 0 });
  }catch{}

  const msgsRef = collection(db, "chats", roomId, "messages");
  const qy = query(msgsRef, orderBy("createdAt","asc"), limit(60));

  if (UI.state.chatUnsub) UI.state.chatUnsub();

  UI.state.chatUnsub = onSnapshot(qy, async (snap)=>{
    UI.el.chatMsgs.innerHTML = "";

    // â Ø¨Ø¹Ø¯ ÙØ§ ÙÙØµÙ ÙÙÙ snapshot: Ø¹ÙÙÙ Ø±Ø³Ø§Ø¦Ù Ø§ÙØ·Ø±Ù Ø§ÙØ«Ø§ÙÙ ÙØµÙØª/Ø§ÙÙØ±Ø£Øª
    // - Delivered: Ø£Ù Ø±Ø³Ø§ÙØ© ÙÙ Ø¥ÙÙ ÙÙÙ ÙØªØ¹ÙÙÙØ© deliveredTo[me]
    // - Read: Ø¨ÙØ§ Ø£ÙÙ Ø¯Ø§Ø®Ù Ø§ÙØ´Ø§Øª Ø§ÙØ¢Ù => Ø¹ÙÙÙ readBy[me]
    const b = writeBatch(db);
    let needCommit = false;

    snap.forEach(d=>{
      const m = d.data() || {};
      const isPending = d.metadata?.hasPendingWrites;

      // Render
      const div = document.createElement("div");
      div.className = "msg" + (m.senderId===me ? " me": "");
      const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : "";
      const st = statusIconForMessage(m, me, realOwnerId, !!isPending);

      div.innerHTML = `
        <div>${escapeHtml(m.text||"")}</div>
        <div class="t">
          ${escapeHtml(time)}
          ${st}
        </div>
      `;
      UI.el.chatMsgs.appendChild(div);

      // Mark delivery/read for incoming messages
      if (m.senderId && m.senderId !== me){
        const deliveredTo = m.deliveredTo || {};
        const readBy = m.readBy || {};

        const msgRef = doc(db, "chats", roomId, "messages", d.id);

        if (!deliveredTo[me]){
          b.set(msgRef, { deliveredTo: { [me]: serverTimestamp() } }, { merge: true });
          needCommit = true;
        }

        // Ø¥Ø°Ø§ Ø£ÙØ§ ÙØ§ØªØ­ Ø§ÙØ´Ø§Øª => read
        if (!readBy[me]){
          b.set(msgRef, { readBy: { [me]: serverTimestamp() } }, { merge: true });
          needCommit = true;
        }
      }
    });

    UI.el.chatMsgs.scrollTop = UI.el.chatMsgs.scrollHeight;

    if (needCommit){
      try{ await b.commit(); }catch{}
    }

    // Ø¨Ø¹Ø¯ Ø§ÙÙØ±Ø§Ø¡Ø©Ø ØµÙÙØ± unread Ø¹ÙÙ ÙØ³ØªÙÙ Ø§ÙÙÙØªØ§ ÙØ±Ø© Ø«Ø§ÙÙØ© (Ø§Ø­ØªÙØ§Ø·)
    try{ await updateDoc(chatDocRef, { [`unread.${me}`]: 0 }); }catch{}
  });
}

function closeChat(){
  if (UI.state.chatUnsub) UI.state.chatUnsub();
  UI.state.chatUnsub = null;
  UI.hide(UI.el.chatBox);
  currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };
}

async function sendMsg(){
  try{ requireAuth(); }catch{ return; }

  const text = UI.el.chatInput.value.trim();
  if (!text) return;
  if (!currentChat.roomId) return;

  const me = auth.currentUser.uid;
  const otherId = currentChat.otherId;

  const msgsRef = collection(db, "chats", currentChat.roomId, "messages");
  const chatDocRef = doc(db, "chats", currentChat.roomId);

  // â Ø£Ø±Ø³Ù Ø§ÙØ±Ø³Ø§ÙØ© (ÙØ¸ÙØ± â³ ØªÙÙØ§Ø¦ÙØ§Ù Ø¨Ø³Ø¨Ø¨ hasPendingWrites)
  await addDoc(msgsRef, {
    text,
    senderId: me,
    createdAt: serverTimestamp(),
    deliveredTo: {}, // ÙØ§Ø­ÙØ§Ù Ø¨ÙØ­Ø· deliveredTo[other]
    readBy: {},      // ÙØ§Ø­ÙØ§Ù Ø¨ÙØ­Ø· readBy[other]
    expiresAt: new Date(Date.now() + 7*24*3600*1000)
  });

  // â Ø­Ø¯ÙØ« Ø§ÙÙÙØªØ§ + Ø¹Ø¯ÙØ§Ø¯ ØºÙØ± ÙÙØ±ÙØ¡ ÙÙØ·Ø±Ù Ø§ÙØ¢Ø®Ø±
  try{
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(chatDocRef);

      if (!snap.exists()){
        tx.set(chatDocRef, {
          listingId: currentChat.listingId,
          listingTitle: currentChat.listingTitle,
          buyerId: me,
          sellerId: otherId,
          participants: [me, otherId].sort(),
          updatedAt: serverTimestamp(),
          lastText: text.slice(0,120),
          unread: { [me]: 0, [otherId]: 1 }
        }, { merge: true });
        return;
      }

      tx.update(chatDocRef, {
        lastText: text.slice(0, 120),
        updatedAt: serverTimestamp(),
        [`unread.${otherId}`]: increment(1),
        [`unread.${me}`]: 0
      });
    });
  }catch{}

  UI.el.chatInput.value = "";
}

/* =========================
   â INBOX
========================= */

async function openInbox(){
  try{ requireAuth(); }catch{ return; }
  UI.showInboxPage();
  await loadInbox();
}

function closeInbox(){
  if (inboxUnsub) inboxUnsub();
  inboxUnsub = null;
  UI.hide(UI.el.inboxPage);
}

async function loadInbox(){
  try{ requireAuth(); }catch{ return; }

  const me = auth.currentUser.uid;

  if (UI.el?.inboxList){
    UI.el.inboxList.innerHTML = `<div class="muted small">Ø¬Ø§Ø±Ù ØªØ­ÙÙÙ Ø§ÙÙØ­Ø§Ø¯Ø«Ø§Øª...</div>`;
    UI.setInboxEmpty(false);
  }

  const qy = query(
    collection(db, "chats"),
    where("participants", "array-contains", me),
    limit(80)
  );

  if (inboxUnsub) inboxUnsub();

  // â ÙØ§Ø¯ ÙÙ Ø§ÙÙÙØ§Ù Ø§ÙØµØ­ (ÙØ¨Ù onSnapshot)
  let lastTotalUnread = 0;
  let lastNotifyAt = 0;

  inboxUnsub = onSnapshot(qy, (snap)=>{
    const rows = [];
    snap.forEach(d=>{
      const data = d.data() || {};
      rows.push({
        id: d.id,
        listingId: data.listingId || "",
        listingTitle: data.listingTitle || "Ø¥Ø¹ÙØ§Ù",
        participants: data.participants || [],
        lastText: data.lastText || "",
        updatedAt: data.updatedAt || null,
        unread: data.unread || {}
      });
    });

    rows.sort((a,b)=>{
      const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return tb - ta;
    });

    const totalUnread = rows.reduce((sum, r) => {
      const c = Number((r.unread && r.unread[me]) || 0);
      return sum + (isNaN(c) ? 0 : c);
    }, 0);

    setInboxIndicator(totalUnread);

    // â Ø¥Ø´Ø¹Ø§Ø± Ø§ÙÙØªØµÙØ­ Ø¹ÙØ¯ Ø²ÙØ§Ø¯Ø© ØºÙØ± Ø§ÙÙÙØ±ÙØ¡
    const now = Date.now();
    const increased = totalUnread > lastTotalUnread;

    if (increased && (now - lastNotifyAt) > 1200) {
      lastNotifyAt = now;

      const inboxOpen = UI.el?.inboxPage && !UI.el.inboxPage.classList.contains("hidden");
      const shouldNotify = document.hidden || !inboxOpen;

      if (shouldNotify) {
        // Ø¥Ø°Ø§ ÙØ§ Ø¨Ø¯Ù "Ø²Ø±" ÙÙÙØ Ø¨Ø³ Ø§Ø³ØªØ¯Ø¹Ù ensurePermission ÙØ±Ø© Ø¨Ù app.js
        // Notify.show Ø±Ø­ ÙØ´ØªØºÙ ÙÙØ· Ø¥Ø°Ø§ permission = granted
        try{
          Notify.show({
            title: "Ø±Ø³Ø§ÙØ© Ø¬Ø¯ÙØ¯Ø© ð¬",
            body: `Ø¹ÙØ¯Ù ${totalUnread} Ø±Ø³Ø§ÙØ© ØºÙØ± ÙÙØ±ÙØ¡Ø©`,
            tag: "inbox"
          });
        }catch{}
      }
    }

    lastTotalUnread = totalUnread;

    if (UI.el?.inboxList) renderInbox(rows, me);

  }, (err)=>{
    if (UI.el?.inboxList){
      UI.el.inboxList.innerHTML = `<div class="muted small">ÙØ´Ù ØªØ­ÙÙÙ Ø§ÙÙ Inbox: ${escapeHtml(err?.message||"")}</div>`;
    }
  });
}

function renderInbox(rows, me){
  UI.el.inboxList.innerHTML = "";

  if (!rows.length){
    UI.setInboxEmpty(true);
    return;
  }
  UI.setInboxEmpty(false);

  rows.forEach(r=>{
    const otherId = (r.participants || []).find(x => x !== me) || "";
    const title = r.listingTitle || "ÙØ­Ø§Ø¯Ø«Ø©";
    const last = r.lastText ? escapeHtml(r.lastText) : `<span class="muted small">ÙØ§ ØªÙØ¬Ø¯ Ø±Ø³Ø§Ø¦Ù Ø¨Ø¹Ø¯</span>`;
    const unreadCount = Number((r.unread && r.unread[me]) || 0);
    const t = r.updatedAt?.toDate ? r.updatedAt.toDate().toLocaleString() : "";

    const item = document.createElement("div");
    item.className = "inboxItem";
    item.innerHTML = `
      <div class="inboxMain">
        <div class="inboxTitle">
          ${escapeHtml(title)}
          ${unreadCount > 0 ? `<span class="badge">${unreadCount}</span>` : ``}
        </div>
        <div class="inboxLast">${last}</div>
      </div>
      <div class="inboxMeta">${escapeHtml(t)}</div>
    `;

    item.onclick = async () => {
      await openChat(r.listingId, r.listingTitle, otherId);
    };

    UI.el.inboxList.appendChild(item);
  });
}