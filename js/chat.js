import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import { requireAuth } from "./auth.js";
import { Notify } from "./notify.js";
import {
  addDoc,
  collection,
  limit,
  limitToLast,   // ✅ جديد
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

/**
 * openChat(listingId, listingTitle, ownerId?)
 */
async function openChat(listingId, listingTitle = "إعلان", ownerId = null){
  try{ requireAuth(); }catch{ return; }

  UI.resetOverlays();
  UI.show(UI.el.chatBox);
  UI.el.chatTitle.textContent = `محادثة: ${listingTitle}`;

  const me = auth.currentUser.uid;
  const realOwnerId = ownerId || await resolveOwnerId(listingId);

  if (!realOwnerId){
    UI.el.chatMsgs.innerHTML = `<div class="muted">تعذر تحديد صاحب الإعلان. جرّب فتح الإعلان ثم اضغط مراسلة.</div>`;
    return;
  }

  if (realOwnerId === me){
    UI.el.chatMsgs.innerHTML = `<div class="muted">لا يمكن مراسلة نفسك.</div>`;
    return;
  }

  const roomId = chatRoomId(listingId, me, realOwnerId);
  currentChat = { listingId, roomId, otherId: realOwnerId, listingTitle };

  const chatDocRef = doc(db, "chats", roomId);

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

  try{ await updateDoc(chatDocRef, { [`unread.${me}`]: 0 }); }catch{}

  const msgsRef = collection(db, "chats", roomId, "messages");

  // ✅ أهم تعديل: عرض آخر 60 بدل أول 60
  const qy = query(msgsRef, orderBy("createdAt","asc"), limitToLast(60));

  if (UI.state.chatUnsub) UI.state.chatUnsub();

  UI.state.chatUnsub = onSnapshot(
    qy,
    async (snap)=>{
      UI.el.chatMsgs.innerHTML = "";

      const b = writeBatch(db);
      let needCommit = false;

      snap.forEach(d=>{
        const m = d.data() || {};
        const isPending = d.metadata?.hasPendingWrites;

        const div = document.createElement("div");
        div.className = "msg" + (m.senderId===me ? " me": "");
        const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : "…";
        const st = statusIconForMessage(m, me, realOwnerId, !!isPending);

        div.innerHTML = `
          <div>${escapeHtml(m.text||"")}</div>
          <div class="t">${escapeHtml(time)} ${st}</div>
        `;
        UI.el.chatMsgs.appendChild(div);

        // mark delivery/read
        if (m.senderId && m.senderId !== me){
          const deliveredTo = m.deliveredTo || {};
          const readBy = m.readBy || {};
          const msgRef = doc(db, "chats", roomId, "messages", d.id);

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

      UI.el.chatMsgs.scrollTop = UI.el.chatMsgs.scrollHeight;

      if (needCommit){
        try{ await b.commit(); }catch{}
      }

      try{ await updateDoc(chatDocRef, { [`unread.${me}`]: 0 }); }catch{}
    },
    (err)=>{
      // ✅ جديد: لو صار خطأ ما يصير كل شي صامت
      console.warn("chat snapshot error:", err);
    }
  );
}

function closeChat(){
  if (UI.state.chatUnsub) UI.state.chatUnsub();
  UI.state.chatUnsub = null;
  UI.hide(UI.el.chatBox);
  currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };
}

async function sendMsg(){
  try{ requireAuth(); }catch{ return; }

  const input = UI.el.chatInput;
  const btn = UI.el.btnSend;

  const text = (input.value || "").trim();
  if (!text) return;
  if (!currentChat.roomId) return;

  const me = auth.currentUser.uid;
  const otherId = currentChat.otherId;

  const msgsRef = collection(db, "chats", currentChat.roomId, "messages");
  const chatDocRef = doc(db, "chats", currentChat.roomId);

  // ✅ منع ضغط متكرر بدون ما يعلق للأبد
  btn.disabled = true;

  try{
    // ✅ ما نمسح النص إلا بعد نجاح الإرسال
    await addDoc(msgsRef, {
      text,
      senderId: me,
      createdAt: serverTimestamp(),
      deliveredTo: {},
      readBy: {},
      expiresAt: new Date(Date.now() + 7*24*3600*1000)
    });

    // تحديث الميتا
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

    input.value = "";
  }catch(err){
    console.warn("sendMsg failed:", err);
    alert("تعذر إرسال الرسالة. تأكد من الإنترنت / صلاحيات Firestore.");
    // نخلي النص موجود ليعيد المحاولة
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