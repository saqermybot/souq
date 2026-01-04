import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import { requireAuth } from "./auth.js";

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
      // اطلب مرة واحدة (ممكن أول رسالة جديدة)
      Notification.requestPermission().then(()=>{});
      return;
    }
    if (Notification.permission !== "granted") return;

    // إشعار بسيط
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
  // Dot (لو موجود)
  const dot = document.getElementById("inboxDot");
  if (dot) dot.classList.toggle("hidden", !(totalUnread > 0));

  // Badge (لو موجود)
  const badge = document.getElementById("inboxBadge");
  if (badge){
    badge.textContent = String(totalUnread);
    badge.classList.toggle("hidden", !(totalUnread > 0));
  }
}

// ===== helpers: delivery/read maps =====
function hasMapKey(obj, key){
  return obj && typeof obj === "object" && obj[key];
}

function statusIconForMessage(m, me, otherId, isPending){
  // فقط لرسائلي
  if (m.senderId !== me) return "";

  if (isPending) return "⏳";          // لسه ما انحفظت
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

  // ✅ تأكد وجود الميتا + unread أساسياً
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

  // ✅ فتح الشات = اعتبرها مقروءة بالمحادثة (unread meta)
  try{
    await updateDoc(chatDocRef, { [`unread.${me}`]: 0 });
  }catch{}

  const msgsRef = collection(db, "chats", roomId, "messages");
  const qy = query(msgsRef, orderBy("createdAt","asc"), limit(60));

  if (UI.state.chatUnsub) UI.state.chatUnsub();

  UI.state.chatUnsub = onSnapshot(qy, async (snap)=>{
    UI.el.chatMsgs.innerHTML = "";

    // ✅ بعد ما نوصل للـ snapshot: علّم رسائل الطرف الثاني وصلت/انقرأت
    // - Delivered: أي رسالة مو إلي ومو متعلّمة deliveredTo[me]
    // - Read: بما أني داخل الشات الآن => علّم readBy[me]
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

        // إذا أنا فاتح الشات => read
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

    // بعد القراءة، صفّر unread على مستوى الميتا مرة ثانية (احتياط)
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

  // ✅ أرسل الرسالة (يظهر ⏳ تلقائياً بسبب hasPendingWrites)
  await addDoc(msgsRef, {
    text,
    senderId: me,
    createdAt: serverTimestamp(),
    deliveredTo: {}, // لاحقاً بنحط deliveredTo[other]
    readBy: {},      // لاحقاً بنحط readBy[other]
    expiresAt: new Date(Date.now() + 7*24*3600*1000)
  });

  // ✅ حدّث الميتا + عدّاد غير مقروء للطرف الآخر
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
    limit(60)
  );

  if (inboxUnsub) inboxUnsub();

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

    // ✅ تنبيه صوتي + إشعار متصفح عند وصول جديد
    if (totalUnread > lastTotalUnread){
      playBeep();
      // إذا الصفحة بالخلفية، إشعار متصفح
      if (document.hidden){
        notifyBrowser("رسالة جديدة", "عندك رسالة جديدة في Souq Syria");
      }
    }
    lastTotalUnread = totalUnread;

    if (UI.el?.inboxList){
      renderInbox(rows, me);
    }
  }, (err)=>{
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