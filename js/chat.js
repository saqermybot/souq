import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import { requireAuth } from "./auth.js";
import { Notify } from "./notify.js";

import {
  addDoc,
  collection,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  where,
  increment,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   INIT
========================= */
export function initChat(){
  UI.actions.openChat = openChat;
  UI.actions.closeChat = closeChat;

  UI.actions.openInbox = openInbox;
  UI.actions.closeInbox = closeInbox;
  UI.actions.loadInbox = loadInbox;

  bindChatControls();
}

function bindChatControls(){
  const btn = document.getElementById("btnSend");
  const input = document.getElementById("chatInput");

  if (btn) {
    UI.el.btnSend = btn;
    btn.onclick = () => sendMsg();
  }
  if (input) {
    UI.el.chatInput = input;
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMsg();
      }
    };
  }
}

function chatRoomId(listingId, a, b){
  return `listing_${listingId}_${[a,b].sort().join("_")}`;
}

let currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };
let inboxUnsub = null;
let chatUnsub = null;

function setInboxIndicator(totalUnread){
  const badge = document.getElementById("inboxBadge");
  if (badge){
    badge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
    badge.classList.toggle("hidden", !(totalUnread > 0));
  }
}

// ✓ / ✓✓
function hasMapKey(obj, key){
  return obj && typeof obj === "object" && obj[key];
}
function statusIconForMessage(m, me, otherId, isPending){
  if (m.senderId !== me) return "";
  if (isPending) return "⏳";
  const readBy = m.readBy || {};
  const deliveredTo = m.deliveredTo || {};
  if (hasMapKey(readBy, otherId)) return `<span class="st read">✓✓</span>`;
  if (hasMapKey(deliveredTo, otherId)) return `<span class="st">✓✓</span>`;
  return `<span class="st">✓</span>`;
}
function formatTime(createdAt){
  try{ if (createdAt?.toDate) return createdAt.toDate().toLocaleString(); }catch{}
  return "…";
}

/* =========================
   CHAT
========================= */
async function openChat(listingId, listingTitle = "إعلان", otherId = null){
  try{ requireAuth(); }catch{ return; }

  UI.resetOverlays();
  UI.show(UI.el.chatBox);
  bindChatControls();

  UI.el.chatTitle.textContent = `محادثة: ${listingTitle}`;

  const me = auth.currentUser.uid;

  if (!otherId){
    UI.el.chatMsgs.innerHTML = `<div class="muted">تعذر تحديد الطرف الآخر.</div>`;
    return;
  }
  if (otherId === me){
    UI.el.chatMsgs.innerHTML = `<div class="muted">لا يمكن مراسلة نفسك.</div>`;
    return;
  }

  const roomId = chatRoomId(listingId, me, otherId);
  currentChat = { listingId, roomId, otherId, listingTitle };

  UI.el.chatMsgs.innerHTML = "";

  const chatDocRef = doc(db, "chats", roomId);

  // ✅ لا تمسح lastText/unread عند كل فتح
  const snap = await getDoc(chatDocRef);
  if (!snap.exists()){
    await setDoc(chatDocRef, {
      listingId,
      listingTitle,
      participants: [me, otherId].sort(),
      updatedAt: serverTimestamp(),
      lastText: "",
      unread: { [me]: 0, [otherId]: 0 }
    }, { merge: true });
  } else {
    // تحديث خفيف بدون لمس lastText/unread
    try{
      await updateDoc(chatDocRef, { updatedAt: serverTimestamp(), listingTitle });
    }catch{}
  }

  // ✅ صفّر unread إليك
  try{ await updateDoc(chatDocRef, { [`unread.${me}`]: 0 }); }catch{}

  const msgsRef = collection(db, "chats", roomId, "messages");
  const qy = query(msgsRef, orderBy("createdAt","asc"), limitToLast(60));

  if (chatUnsub) chatUnsub();
  chatUnsub = onSnapshot(
    qy,
    { includeMetadataChanges: true },
    async (snap2)=>{
      const meNow = auth.currentUser?.uid;
      if (!meNow) return;

      UI.el.chatMsgs.innerHTML = "";

      const b = writeBatch(db);
      let needCommit = false;

      snap2.forEach((d)=>{
        const m = d.data({ serverTimestamps: "estimate" }) || {};
        const isPending = d.metadata?.hasPendingWrites;

        const div = document.createElement("div");
        div.className = "msg" + (m.senderId===meNow ? " me": "");
        const st = statusIconForMessage(m, meNow, otherId, !!isPending);

        div.innerHTML = `
          <div>${escapeHtml(m.text||"")}</div>
          <div class="t">${escapeHtml(formatTime(m.createdAt))} ${st}</div>
        `;
        UI.el.chatMsgs.appendChild(div);

        // ✅ delivered/read للرسائل الواردة
        if (m.senderId && m.senderId !== meNow){
          const msgRef = doc(db, "chats", roomId, "messages", d.id);
          const deliveredTo = m.deliveredTo || {};
          const readBy = m.readBy || {};

          if (!deliveredTo[meNow]){
            b.set(msgRef, { deliveredTo: { [meNow]: serverTimestamp() } }, { merge: true });
            needCommit = true;
          }
          if (!readBy[meNow]){
            b.set(msgRef, { readBy: { [meNow]: serverTimestamp() } }, { merge: true });
            needCommit = true;
          }
        }
      });

      UI.el.chatMsgs.scrollTop = UI.el.chatMsgs.scrollHeight;

      if (needCommit){
        try{ await b.commit(); }catch{}
      }

      try{ await updateDoc(chatDocRef, { [`unread.${meNow}`]: 0 }); }catch{}
    },
    (err)=> console.warn("chat snapshot error:", err)
  );
}

function closeChat(){
  if (chatUnsub) chatUnsub();
  chatUnsub = null;
  UI.hide(UI.el.chatBox);
  currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };
}

/* =========================
   SEND
========================= */
async function sendMsg(){
  try{ requireAuth(); }catch{ return; }
  bindChatControls();

  const input = UI.el.chatInput;
  const btn = UI.el.btnSend;

  const text = (input?.value || "").trim();
  if (!text) return;
  if (!currentChat.roomId) return;

  const me = auth.currentUser.uid;
  const otherId = currentChat.otherId;

  if (btn) btn.disabled = true;

  const roomId = currentChat.roomId;
  const msgsRef = collection(db, "chats", roomId, "messages");
  const chatDocRef = doc(db, "chats", roomId);

  try{
    await addDoc(msgsRef, {
      text,
      senderId: me,
      createdAt: serverTimestamp(),
      deliveredTo: {},
      readBy: {},
      expiresAt: new Date(Date.now() + 7*24*3600*1000)
    });

    // ✅ تحديث الميتا (إذا فشل لا يعتبر فشل إرسال)
    try{
      await updateDoc(chatDocRef, {
        lastText: text.slice(0,120),
        updatedAt: serverTimestamp(),
        [`unread.${otherId}`]: increment(1),
        [`unread.${me}`]: 0
      });
    }catch(e){
      console.warn("meta update failed:", e);
    }

    input.value = "";
  }catch(err){
    console.warn("sendMsg failed:", err);
    alert(`تعذر إرسال الرسالة.\ncode: ${err?.code || "?"}\n${err?.message || ""}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

/* =========================
   INBOX
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

  const qy = query(
    collection(db, "chats"),
    where("participants", "array-contains", me),
    limit(80)
  );

  if (inboxUnsub) inboxUnsub();

  let lastTotalUnread = 0;
  let lastNotifyAt = 0;

  inboxUnsub = onSnapshot(qy, (snap)=>{
    const rows = [];
    snap.forEach(d=>{
      const data = d.data() || {};
      rows.push({
        id: d.id,
        listingId: data.listingId || "",
        listingTitle: data.listingTitle || "إعلان",
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

    const now = Date.now();
    if (totalUnread > lastTotalUnread && (now - lastNotifyAt) > 1200) {
      lastNotifyAt = now;
      const inboxOpen = UI.el?.inboxPage && !UI.el.inboxPage.classList.contains("hidden");
      const shouldNotify = document.hidden || !inboxOpen;

      if (shouldNotify) {
        try{
          Notify.show({
            title: "رسالة جديدة 💬",
            body: `عندك ${totalUnread} رسالة غير مقروءة`,
            tag: "inbox"
          });
        }catch{}
      }
    }

    lastTotalUnread = totalUnread;

    if (UI.el?.inboxList) renderInbox(rows, me);
  });
}

function renderInbox(rows, me){
  if (!UI.el?.inboxList) return;
  UI.el.inboxList.innerHTML = "";

  if (!rows.length){
    UI.setInboxEmpty(true);
    return;
  }
  UI.setInboxEmpty(false);

  rows.forEach(r=>{
    const otherId = (r.participants || []).find(x => x !== me) || "";
    const title = r.listingTitle || "محادثة";
    const last = r.lastText ? escapeHtml(r.lastText) : `<span class="muted small">لا توجد رسائل بعد</span>`;
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