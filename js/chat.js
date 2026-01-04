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
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function initChat(){
  UI.actions.openChat = openChat;
  UI.actions.closeChat = closeChat;

  // ✅ Inbox actions
  UI.actions.openInbox = openInbox;
  UI.actions.closeInbox = closeInbox;
  UI.actions.loadInbox = loadInbox;

  UI.el.btnSend.onclick = sendMsg;
}

function chatRoomId(listingId, a, b){
  return `listing_${listingId}_${[a,b].sort().join("_")}`;
}

let currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };

// ✅ unsubscribe للـ inbox (Live)
let inboxUnsub = null;

// ✅ unsubscribe للـ chat meta + messages
let chatMetaUnsub = null;
let chatMsgsUnsub = null;

// ✅ حافظ آخر بيانات لنعيد رسم ✓✓ عند تحديث lastRead
let lastMsgsCache = [];
let lastMetaCache = null;

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
   ✅ TOP INDICATORS (Badge)
========================= */
function setInboxIndicator(totalUnread){
  // Badge رقم (auth.js بيرندر inboxBadge)
  const badge = document.getElementById("inboxBadge");
  if (badge){
    badge.textContent = String(totalUnread);
    badge.classList.toggle("hidden", !(totalUnread > 0));
  }

  // لو عندك dot قديم، ما بيضر
  const dot = document.getElementById("inboxDot");
  if (dot){
    dot.classList.toggle("hidden", !(totalUnread > 0));
  }
}

/* =========================
   ✅ READ RECEIPT HELPERS (✓ / ✓✓)
========================= */
function toMillis(ts){
  // Firestore Timestamp => millis
  try{
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
  }catch{}
  return 0;
}

function getOtherLastReadMs(meta, otherId){
  const lr = meta?.lastRead || {};
  return toMillis(lr?.[otherId]);
}

function renderMessages(msgs, meta){
  if (!UI.el?.chatMsgs) return;

  const me = auth.currentUser?.uid || "";
  const otherId = currentChat.otherId;
  const otherLastReadMs = getOtherLastReadMs(meta, otherId);

  UI.el.chatMsgs.innerHTML = "";

  msgs.forEach((m)=>{
    const isMe = m.senderId === me;

    const createdMs = toMillis(m.createdAt);
    const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : "";

    // ✅ status: للرسائل اللي أنا بعتها فقط
    // ✓ = sent (موجودة بالـ DB)
    // ✓✓ = read (الطرف الآخر فتح المحادثة بعد وقت إرسال الرسالة)
    let ticks = "";
    if (isMe){
      const read = otherLastReadMs && createdMs && otherLastReadMs >= createdMs;
      ticks = read ? "✓✓" : "✓";
    }

    const div = document.createElement("div");
    div.className = "msg" + (isMe ? " me": "");

    div.innerHTML = `
      <div>${escapeHtml(m.text||"")}</div>
      <div class="t">
        <span>${escapeHtml(time)}</span>
        ${isMe ? `<span class="ticks">${ticks}</span>` : ``}
      </div>
    `;

    UI.el.chatMsgs.appendChild(div);
  });

  UI.el.chatMsgs.scrollTop = UI.el.chatMsgs.scrollHeight;
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

  // ✅ تأكد وجود الميتا + unread + lastRead أساسياً
  await setDoc(chatDocRef, {
    listingId,
    listingTitle,
    buyerId: me,
    sellerId: realOwnerId,
    participants: [me, realOwnerId].sort(),
    updatedAt: serverTimestamp(),
    lastText: "",
    unread: { [me]: 0, [realOwnerId]: 0 },
    lastRead: { [me]: serverTimestamp() } // ✅ فتح الشات = مقروء
  }, { merge: true });

  // ✅ فتح الشات = صفّر unread للمستخدم الحالي + حدّث lastRead للمستخدم الحالي
  try{
    await updateDoc(chatDocRef, {
      [`unread.${me}`]: 0,
      [`lastRead.${me}`]: serverTimestamp()
    });
  }catch{}

  // ✅ لا تعيد تشغيل loadInbox هون (بيسبب تأخير/تكرار listeners)
  // لأن auth.js صار يشغله مرة واحدة تلقائياً.

  // ✅ أوقف أي listeners قديمة
  if (chatMetaUnsub) chatMetaUnsub();
  if (chatMsgsUnsub) chatMsgsUnsub();

  lastMsgsCache = [];
  lastMetaCache = null;

  // ✅ listener للـ Meta (حتى ✓✓ تتحدث لحالها لما الطرف الآخر يفتح الشات)
  chatMetaUnsub = onSnapshot(chatDocRef, (snap)=>{
    lastMetaCache = snap.data() || null;
    // إذا عندنا رسائل مخزنة، أعد الرسم لتحديث ✓✓
    if (lastMsgsCache.length){
      renderMessages(lastMsgsCache, lastMetaCache);
    }
  });

  // ✅ listener للرسائل
  const msgsRef = collection(db, "chats", roomId, "messages");
  const qy = query(msgsRef, orderBy("createdAt","asc"), limit(80));

  chatMsgsUnsub = onSnapshot(qy, async (snap)=>{
    const arr = [];
    snap.forEach(d => arr.push({ id: d.id, ...(d.data()||{}) }));

    lastMsgsCache = arr;
    renderMessages(lastMsgsCache, lastMetaCache);

    // ✅ أي رسالة جديدة من الطرف الآخر أثناء فتح الشات => اعتبرها مقروءة فوراً
    // (حتى تتحول ✓✓ عنده بسرعة)
    try{
      const hasOther = arr.some(m => m.senderId === realOwnerId);
      if (hasOther){
        await updateDoc(chatDocRef, {
          [`unread.${me}`]: 0,
          [`lastRead.${me}`]: serverTimestamp()
        });
      }
    }catch{}
  });
}

function closeChat(){
  if (chatMetaUnsub) chatMetaUnsub();
  if (chatMsgsUnsub) chatMsgsUnsub();
  chatMetaUnsub = null;
  chatMsgsUnsub = null;

  UI.hide(UI.el.chatBox);
  currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };
  lastMsgsCache = [];
  lastMetaCache = null;
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

  // ✅ أرسل الرسالة
  await addDoc(msgsRef, {
    text,
    senderId: me,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 7*24*3600*1000)
  });

  // ✅ حدّث الميتا + عدّاد غير مقروء للطرف الآخر (Transaction)
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
          unread: { [me]: 0, [otherId]: 1 },
          lastRead: { [me]: serverTimestamp() }
        }, { merge: true });
        return;
      }

      tx.update(chatDocRef, {
        lastText: text.slice(0, 120),
        updatedAt: serverTimestamp(),
        [`unread.${otherId}`]: increment(1),
        [`unread.${me}`]: 0,
        [`lastRead.${me}`]: serverTimestamp()
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
  UI.hide(UI.el.inboxPage);
}

async function loadInbox(){
  try{ requireAuth(); }catch{ return; }

  const me = auth.currentUser.uid;

  // إذا كانت عناصر الـ UI موجودة (صفحة Inbox مفتوحة)
  if (UI.el?.inboxList){
    UI.el.inboxList.innerHTML = `<div class="muted small">جاري تحميل المحادثات...</div>`;
    UI.setInboxEmpty(false);
  }

  const qy = query(
    collection(db, "chats"),
    where("participants", "array-contains", me),
    limit(80)
  );

  // ✅ لا تعيد إنشاء listener لو هو شغال أصلاً (من auth.js)
  if (inboxUnsub) return;

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

    // ✅ ترتيب محلي حسب updatedAt
    rows.sort((a,b)=>{
      const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return tb - ta;
    });

    // ✅ مجموع غير المقروء (للـ badge فوق 💬)
    const totalUnread = rows.reduce((sum, r) => {
      const c = Number((r.unread && r.unread[me]) || 0);
      return sum + (isNaN(c) ? 0 : c);
    }, 0);

    setInboxIndicator(totalUnread);

    // إذا صفحة inbox مفتوحة، اعرض القائمة
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
          ${unreadCount > 0 ? `<span class="badge" style="margin-inline-start:8px">${unreadCount}</span>` : ``}
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