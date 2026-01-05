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
  runTransaction,
  increment,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   ✅ INIT
========================= */
export function initChat(){
  UI.actions.openChat = openChat;
  UI.actions.closeChat = closeChat;

  UI.actions.openInbox = openInbox;
  UI.actions.closeInbox = closeInbox;
  UI.actions.loadInbox = loadInbox;

  // اربط الزر + Enter
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

/* =========================
   Helpers
========================= */
function chatRoomId(listingId, a, b){
  return `listing_${listingId}_${[a,b].sort().join("_")}`;
}

let currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };
let inboxUnsub = null;
let chatUnsub = null;

// لمنع re-render الكامل
const renderedIds = new Set();

// optimistic pending queue (لما الشبكة تبطّئ)
let pendingLocal = []; // [{localId,text,ts}]

// unread indicator
function setInboxIndicator(totalUnread){
  const badge = document.getElementById("inboxBadge");
  if (badge){
    badge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
    badge.classList.toggle("hidden", !(totalUnread > 0));
  }
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
  try{
    if (createdAt?.toDate) return createdAt.toDate().toLocaleString();
  }catch{}
  return "…";
}

function appendMessageRow({ id, text, senderId, createdAt, me, otherId, isPending }){
  const div = document.createElement("div");
  div.className = "msg" + (senderId === me ? " me" : "");
  div.dataset.mid = id;

  const st = statusIconForMessage({ senderId, deliveredTo:{}, readBy:{} }, me, otherId, !!isPending);
  div.innerHTML = `
    <div>${escapeHtml(text || "")}</div>
    <div class="t">${escapeHtml(formatTime(createdAt))} ${st}</div>
  `;
  UI.el.chatMsgs.appendChild(div);
}

/* =========================
   ✅ CHAT
========================= */
async function openChat(listingId, listingTitle = "إعلان", ownerId = null){
  try{ requireAuth(); }catch{ return; }

  UI.resetOverlays();
  UI.show(UI.el.chatBox);
  bindChatControls();

  UI.el.chatTitle.textContent = `محادثة: ${listingTitle}`;

  const me = auth.currentUser.uid;
  const realOwnerId = ownerId || await resolveOwnerId(listingId);

  if (!realOwnerId){
    UI.el.chatMsgs.innerHTML = `<div class="muted">تعذر تحديد صاحب الإعلان.</div>`;
    return;
  }
  if (realOwnerId === me){
    UI.el.chatMsgs.innerHTML = `<div class="muted">لا يمكن مراسلة نفسك.</div>`;
    return;
  }

  const roomId = chatRoomId(listingId, me, realOwnerId);
  currentChat = { listingId, roomId, otherId: realOwnerId, listingTitle };

  renderedIds.clear();
  pendingLocal = [];
  UI.el.chatMsgs.innerHTML = "";

  const chatDocRef = doc(db, "chats", roomId);

  // ensure meta exists
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

  // mark unread=0 for me
  try{ await updateDoc(chatDocRef, { [`unread.${me}`]: 0 }); }catch{}

  const msgsRef = collection(db, "chats", roomId, "messages");
  const qy = query(msgsRef, orderBy("createdAt","asc"), limitToLast(60));

  if (chatUnsub) chatUnsub();
  chatUnsub = onSnapshot(
    qy,
    { includeMetadataChanges: true },
    async (snap)=>{
      const meNow = auth.currentUser?.uid;
      if (!meNow) return;

      // ✅ لا تمسح كل الرسائل. اعرض الإضافات فقط.
      const b = writeBatch(db);
      let needCommit = false;

      snap.docChanges().forEach((chg) => {
        if (chg.type === "removed") return;

        const d = chg.doc;
        const id = d.id;

        // serverTimestamps estimate حتى ما ينهار وقت pending
        const m = d.data({ serverTimestamps: "estimate" }) || {};
        const isPending = d.metadata?.hasPendingWrites;

        // إذا موجود مسبقاً: حدّث status فقط بدل إعادة رسم
        const existing = UI.el.chatMsgs.querySelector(`[data-mid="${id}"]`);
        if (existing){
          // حدّث وقت + status
          const tEl = existing.querySelector(".t");
          if (tEl){
            const st = statusIconForMessage(m, meNow, realOwnerId, !!isPending);
            tEl.innerHTML = `${escapeHtml(formatTime(m.createdAt))} ${st}`;
          }
          return;
        }

        // ما ينضاف مرتين
        if (renderedIds.has(id)) return;
        renderedIds.add(id);

        // append
        const div = document.createElement("div");
        div.className = "msg" + (m.senderId===meNow ? " me": "");
        div.dataset.mid = id;

        const st = statusIconForMessage(m, meNow, realOwnerId, !!isPending);
        div.innerHTML = `
          <div>${escapeHtml(m.text||"")}</div>
          <div class="t">${escapeHtml(formatTime(m.createdAt))} ${st}</div>
        `;
        UI.el.chatMsgs.appendChild(div);

        // delivery/read for incoming
        if (m.senderId && m.senderId !== meNow){
          const deliveredTo = m.deliveredTo || {};
          const readBy = m.readBy || {};
          const msgRef = doc(db, "chats", roomId, "messages", id);

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

      // scroll down
      UI.el.chatMsgs.scrollTop = UI.el.chatMsgs.scrollHeight;

      if (needCommit){
        try{ await b.commit(); }catch{}
      }

      // unread 0
      try{ await updateDoc(chatDocRef, { [`unread.${meNow}`]: 0 }); }catch{}
    },
    (err)=>{
      console.warn("chat snapshot error:", err);
    }
  );
}

function closeChat(){
  if (chatUnsub) chatUnsub();
  chatUnsub = null;
  UI.hide(UI.el.chatBox);
  currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };
  renderedIds.clear();
  pendingLocal = [];
}

/* =========================
   ✅ SEND (Optimistic + retry-safe)
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

  // optimistic UI (حتى لو الشبكة تبطّئ)
  const localId = "local_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  pendingLocal.push({ localId, text, ts: new Date() });

  // أضفها فوراً للواجهة كـ pending
  const div = document.createElement("div");
  div.className = "msg me";
  div.dataset.mid = localId;
  div.innerHTML = `
    <div>${escapeHtml(text)}</div>
    <div class="t">${escapeHtml(new Date().toLocaleString())} ⏳</div>
  `;
  UI.el.chatMsgs.appendChild(div);
  UI.el.chatMsgs.scrollTop = UI.el.chatMsgs.scrollHeight;

  // lock UI
  if (btn) btn.disabled = true;
  if (input) input.value = "";

  const msgsRef = collection(db, "chats", currentChat.roomId, "messages");
  const chatDocRef = doc(db, "chats", currentChat.roomId);

  try{
    // ارسل Firestore
    await addDoc(msgsRef, {
      text,
      senderId: me,
      createdAt: serverTimestamp(),
      deliveredTo: {},
      readBy: {},
      expiresAt: new Date(Date.now() + 7*24*3600*1000)
    });

    // meta update
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
          lastText: text.slice(0,120),
          updatedAt: serverTimestamp(),
          [`unread.${otherId}`]: increment(1),
          [`unread.${me}`]: 0
        });
      });
    }catch{}
  }catch(err){
    console.warn("sendMsg failed:", err);

    // رجّع النص بالحقل
    if (input) input.value = text;

    // علّم الرسالة المحلية فشلت بدل ما “تختفي”
    const row = UI.el.chatMsgs.querySelector(`[data-mid="${localId}"]`);
    if (row){
      const tEl = row.querySelector(".t");
      if (tEl) tEl.innerHTML = `${escapeHtml(new Date().toLocaleString())} ❌`;
    }

    // اعرض سبب حقيقي
    alert(`تعذر إرسال الرسالة.\ncode: ${err?.code || "?"}\n${err?.message || ""}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

/* =========================
   ✅ INBOX
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
    const increased = totalUnread > lastTotalUnread;

    if (increased && (now - lastNotifyAt) > 1200) {
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