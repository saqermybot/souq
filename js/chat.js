import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import { requireAuth } from "./auth.js";
import { Notify } from "./notify.js";
import {
  addDoc,
  collection,
  limit,          // ✅ كان ناقص عندك
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

export function initChat(){
  UI.actions.openChat = openChat;
  UI.actions.closeChat = closeChat;

  UI.actions.openInbox = openInbox;
  UI.actions.closeInbox = closeInbox;
  UI.actions.loadInbox = loadInbox;

  UI.el.btnSend.onclick = sendMsg;

  // ✅ Enter لإرسال (اختياري لطيف)
  if (UI.el.chatInput){
    UI.el.chatInput.addEventListener("keydown", (e)=>{
      if (e.key === "Enter"){
        e.preventDefault();
        sendMsg();
      }
    });
  }
}

function chatRoomId(listingId, a, b){
  return `listing_${listingId}_${[a,b].sort().join("_")}`;
}

let currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };
let inboxUnsub = null;

// ====== Notifications (sound + browser notif while page open) ======
let lastTotalUnread = 0;

// ====== Chat render state ======
let chatUnsub = null;
let renderedIds = new Set();           // messageDocId rendered
let pendingByClientId = new Map();     // clientId -> element
let pendingTextByClientId = new Map(); // clientId -> text (fallback)

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
      Notification.requestPermission().then(()=>{});
      return;
    }
    if (Notification.permission !== "granted") return;
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
   ✅ TOP INDICATORS (Dot/Badge)
========================= */
function setInboxIndicator(totalUnread){
  const dot = document.getElementById("inboxDot");
  if (dot) dot.classList.toggle("hidden", !(totalUnread > 0));

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
  if (m.senderId !== me) return "";
  if (isPending) return "⏳";
  const readBy = m.readBy || {};
  const deliveredTo = m.deliveredTo || {};
  if (hasMapKey(readBy, otherId)) return `<span class="st read">✓✓</span>`;
  if (hasMapKey(deliveredTo, otherId)) return `<span class="st">✓✓</span>`;
  return `<span class="st">✓</span>`;
}

function formatTime(ts){
  try{
    if (ts?.toDate) return ts.toDate().toLocaleString();
  }catch{}
  return "…";
}

function makeClientId(){
  // random stable-ish id
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
}

function scrollToBottom(){
  try{
    UI.el.chatMsgs.scrollTop = UI.el.chatMsgs.scrollHeight;
  }catch{}
}

function clearChatUI(){
  UI.el.chatMsgs.innerHTML = "";
  renderedIds = new Set();
  pendingByClientId = new Map();
  pendingTextByClientId = new Map();
}

/**
 * Render a message bubble
 */
function renderMessageBubble({ id, text, senderId, createdAt, isPending, me, otherId, clientId }){
  const div = document.createElement("div");
  div.className = "msg" + (senderId === me ? " me" : "");
  div.dataset.msgId = id || "";
  if (clientId) div.dataset.clientId = clientId;

  const t = formatTime(createdAt);
  const st = statusIconForMessage({ senderId, readBy:{}, deliveredTo:{} }, me, otherId, !!isPending);

  // لو pending: نعطي مؤشر واضح
  const pendingTag = isPending ? `<span class="st">⏳</span>` : "";

  div.innerHTML = `
    <div>${escapeHtml(text || "")}</div>
    <div class="t">${escapeHtml(t)} ${pendingTag || st}</div>
  `;
  return div;
}

/* =========================
   ✅ CHAT
========================= */
async function openChat(listingId, listingTitle = "إعلان", ownerId = null){
  try{ requireAuth(); }catch{ return; }

  UI.resetOverlays();
  UI.show(UI.el.chatBox);
  UI.el.chatTitle.textContent = `محادثة: ${listingTitle}`;

  const me = auth.currentUser.uid;
  const realOwnerId = ownerId || await resolveOwnerId(listingId);

  if (!realOwnerId){
    clearChatUI();
    UI.el.chatMsgs.innerHTML = `<div class="muted">تعذر تحديد صاحب الإعلان. جرّب فتح الإعلان ثم اضغط مراسلة.</div>`;
    return;
  }

  if (realOwnerId === me){
    clearChatUI();
    UI.el.chatMsgs.innerHTML = `<div class="muted">لا يمكن مراسلة نفسك.</div>`;
    return;
  }

  const roomId = chatRoomId(listingId, me, realOwnerId);
  currentChat = { listingId, roomId, otherId: realOwnerId, listingTitle };

  const chatDocRef = doc(db, "chats", roomId);

  // ✅ تأكد وجود الميتا
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

  // ✅ افتح = مقروء
  try{ await updateDoc(chatDocRef, { [`unread.${me}`]: 0 }); }catch{}

  // ✅ reset render state لكل غرفة جديدة
  clearChatUI();

  const msgsRef = collection(db, "chats", roomId, "messages");
  const qy = query(msgsRef, orderBy("createdAt","asc"), limitToLast(60));

  if (chatUnsub) chatUnsub();

  chatUnsub = onSnapshot(
    qy,
    async (snap)=>{
      const b = writeBatch(db);
      let needCommit = false;

      // ✅ نضيف الجديد فقط بدل ما نمسح كل شي
      snap.docChanges().forEach(change=>{
        const d = change.doc;
        const id = d.id;

        if (change.type === "removed"){
          // إذا حذفت رسالة لاحقاً ممكن تشيلها، حالياً نتجاهل
          return;
        }

        const m = d.data() || {};
        const isPending = d.metadata?.hasPendingWrites;

        // إذا عندنا pending بنفس clientId -> نستبدلها برسالة حقيقية
        const clientId = m.clientId || null;

        if (clientId && pendingByClientId.has(clientId)){
          const pendingEl = pendingByClientId.get(clientId);
          if (pendingEl && pendingEl.parentNode){
            pendingEl.parentNode.removeChild(pendingEl);
          }
          pendingByClientId.delete(clientId);
          pendingTextByClientId.delete(clientId);
        }

        if (renderedIds.has(id)){
          // تحديث (مثلاً createdAt صار موجود) => حدّث الوقت/الحالة
          const el = UI.el.chatMsgs.querySelector(`[data-msg-id="${id}"]`);
          if (el){
            const time = formatTime(m.createdAt);
            const st = statusIconForMessage(m, me, realOwnerId, !!isPending);
            const tEl = el.querySelector(".t");
            if (tEl) tEl.innerHTML = `${escapeHtml(time)} ${st}`;
          }
        } else {
          // جديد
          const bubble = renderMessageBubble({
            id,
            text: m.text || "",
            senderId: m.senderId,
            createdAt: m.createdAt,
            isPending,
            me,
            otherId: realOwnerId,
            clientId
          });

          UI.el.chatMsgs.appendChild(bubble);
          renderedIds.add(id);
        }

        // Mark delivery/read for incoming messages
        if (m.senderId && m.senderId !== me){
          const deliveredTo = m.deliveredTo || {};
          const readBy = m.readBy || {};
          const msgRef = doc(db, "chats", roomId, "messages", id);

          if (!deliveredTo[me]){
            b.set(msgRef, { deliveredTo: { [me]: serverTimestamp() } }, { merge: true });
            needCommit = true;
          }
          if (!readBy[me]){
            b.set(msgRef, { readBy: { [me]: serverTimestamp() } }, { merge: true });
            needCommit = true;
          }
        }
      });

      scrollToBottom();

      if (needCommit){
        try{ await b.commit(); }catch{}
      }

      // صفّر unread meta
      try{ await updateDoc(chatDocRef, { [`unread.${me}`]: 0 }); }catch{}
    },
    (err)=>{
      // ✅ لو صار خطأ Snapshot لا تخلي الشات “يموت”
      console.warn("chat snapshot error", err);
    }
  );
}

function closeChat(){
  if (chatUnsub) chatUnsub();
  chatUnsub = null;
  UI.hide(UI.el.chatBox);
  currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };
  clearChatUI();
}

async function sendMsg(){
  try{ requireAuth(); }catch{ return; }

  const input = UI.el.chatInput;
  const btn = UI.el.btnSend;

  const text = (input?.value || "").trim();
  if (!text) return;
  if (!currentChat.roomId) return;

  const me = auth.currentUser.uid;
  const otherId = currentChat.otherId;
  const roomId = currentChat.roomId;

  // ✅ Optimistic UI: اعرض الرسالة فوراً كـ pending
  const clientId = makeClientId();
  const pendingEl = renderMessageBubble({
    id: "",                 // ما عندها doc id بعد
    text,
    senderId: me,
    createdAt: null,
    isPending: true,
    me,
    otherId,
    clientId
  });
  pendingByClientId.set(clientId, pendingEl);
  pendingTextByClientId.set(clientId, text);
  UI.el.chatMsgs.appendChild(pendingEl);
  scrollToBottom();

  // ✅ فرّغ الحقل فوراً (لشعور سريع)
  input.value = "";
  try{ input.blur(); }catch{}

  // ✅ منع نقر متكرر بس بدون “تعليق دائم”
  btn.disabled = true;

  const chatDocRef = doc(db, "chats", roomId);

  try{
    // 1) اكتب الرسالة
    await addDoc(collection(db, "chats", roomId, "messages"), {
      text,
      clientId,                // ✅ أهم سطر لربط الـ pending
      senderId: me,
      createdAt: serverTimestamp(),
      deliveredTo: {},
      readBy: {},
      expiresAt: new Date(Date.now() + 7*24*3600*1000)
    });

    // 2) حدّث الميتا + unread للطرف الآخر
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
  }catch(err){
    console.warn("sendMsg failed", err);

    // ✅ فشل الإرسال: خلي الـ pending واضح + رجّع النص للحقل (اختياري)
    if (pendingEl){
      const tEl = pendingEl.querySelector(".t");
      if (tEl) tEl.innerHTML = `<span class="st">❌ فشل الإرسال</span>`;
      pendingEl.style.opacity = "0.75";
    }

    // رجّع النص ليقدر يعيد الإرسال
    input.value = text;

    alert("تعذر إرسال الرسالة. تأكد من الإنترنت وسجّل خروج/دخول إذا لزم.");
  }finally{
    btn.disabled = false;
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

  if (UI.el?.inboxList){
    UI.el.inboxList.innerHTML = `<div class="muted small">جاري تحميل المحادثات...</div>`;
    UI.setInboxEmpty(false);
  }

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
  }, (err)=>{
    console.warn("inbox snapshot error", err);
    if (UI.el?.inboxList){
      UI.el.inboxList.innerHTML = `<div class="muted small">فشل تحميل الـ Inbox: ${escapeHtml(err?.message||"")}</div>`;
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