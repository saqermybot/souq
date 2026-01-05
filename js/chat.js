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
export function initChat() {
  UI.actions.openChat = openChat;
  UI.actions.closeChat = closeChat;

  UI.actions.openInbox = openInbox;
  UI.actions.closeInbox = closeInbox;
  UI.actions.loadInbox = loadInbox;

  bindChatControls();
}

/* =========================
   ✅ Robust DOM bind (no stacking listeners)
========================= */
let chatBindToken = 0;

function bindChatControls() {
  const token = ++chatBindToken;

  const btn = document.getElementById("btnSend");
  const input = document.getElementById("chatInput");

  if (btn) UI.el.btnSend = btn;
  if (input) UI.el.chatInput = input;

  if (btn) {
    btn.onclick = null;
    btn.onclick = (e) => {
      // لو صار rebind تاني، تجاهل القديم
      if (token !== chatBindToken) return;
      sendMsg();
    };
  }

  if (input) {
    // Enter للإرسال (على الموبايل مفيد)
    input.onkeydown = null;
    input.onkeydown = (e) => {
      if (token !== chatBindToken) return;
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
function chatRoomId(listingId, a, b) {
  return `listing_${listingId}_${[a, b].sort().join("_")}`;
}

let currentChat = { listingId: null, roomId: null, otherId: null, listingTitle: "" };
let inboxUnsub = null;

async function resolveOwnerId(listingId) {
  const o1 = UI.state.currentListing?.ownerId;
  if (o1) return o1;

  try {
    const snap = await getDoc(doc(db, "listings", listingId));
    if (snap.exists()) return snap.data()?.ownerId || null;
  } catch {}
  return null;
}

/* =========================
   ✅ TOP INDICATORS (Badge)
========================= */
function setInboxIndicator(totalUnread) {
  const badge = document.getElementById("inboxBadge");
  if (badge) {
    badge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
    badge.classList.toggle("hidden", !(totalUnread > 0));
  }
}

/* =========================
   ✅ Message status
========================= */
function hasMapKey(obj, key) {
  return obj && typeof obj === "object" && obj[key];
}

function statusIconForMessage(m, me, otherId, isPending) {
  if (m.senderId !== me) return "";
  if (isPending) return `<span class="st">⏳</span>`;

  const readBy = m.readBy || {};
  const deliveredTo = m.deliveredTo || {};

  if (hasMapKey(readBy, otherId)) return `<span class="st read">✓✓</span>`;
  if (hasMapKey(deliveredTo, otherId)) return `<span class="st">✓✓</span>`;
  return `<span class="st">✓</span>`;
}

/* =========================
   ✅ CHAT UI rendering (incremental)
========================= */
let renderedIds = new Set();

function ensureMsgEl(id) {
  let el = document.getElementById("m_" + id);
  if (!el) {
    el = document.createElement("div");
    el.id = "m_" + id;
    el.className = "msg";
    UI.el.chatMsgs.appendChild(el);
  }
  return el;
}

function renderMsg(id, m, me, otherId, isPending) {
  const el = ensureMsgEl(id);
  el.className = "msg" + (m.senderId === me ? " me" : "");

  const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : "…";
  const st = statusIconForMessage(m, me, otherId, !!isPending);

  el.innerHTML = `
    <div>${escapeHtml(m.text || "")}</div>
    <div class="t">${escapeHtml(time)} ${st}</div>
  `;
}

function scrollToBottom() {
  UI.el.chatMsgs.scrollTop = UI.el.chatMsgs.scrollHeight;
}

/* =========================
   ✅ openChat
========================= */
async function openChat(listingId, listingTitle = "إعلان", ownerId = null) {
  try {
    requireAuth();
  } catch {
    return;
  }

  UI.resetOverlays();
  UI.show(UI.el.chatBox);
  bindChatControls(); // ✅ rebind after show

  UI.el.chatTitle.textContent = `محادثة: ${listingTitle}`;

  const me = auth.currentUser.uid;
  const realOwnerId = ownerId || (await resolveOwnerId(listingId));

  if (!realOwnerId) {
    UI.el.chatMsgs.innerHTML = `<div class="muted">تعذر تحديد صاحب الإعلان.</div>`;
    return;
  }
  if (realOwnerId === me) {
    UI.el.chatMsgs.innerHTML = `<div class="muted">لا يمكن مراسلة نفسك.</div>`;
    return;
  }

  const roomId = chatRoomId(listingId, me, realOwnerId);
  currentChat = { listingId, roomId, otherId: realOwnerId, listingTitle };

  renderedIds = new Set();
  UI.el.chatMsgs.innerHTML = "";

  const chatDocRef = doc(db, "chats", roomId);

  await setDoc(
    chatDocRef,
    {
      listingId,
      listingTitle,
      buyerId: me,
      sellerId: realOwnerId,
      participants: [me, realOwnerId].sort(),
      updatedAt: serverTimestamp(),
      lastText: "",
      unread: { [me]: 0, [realOwnerId]: 0 }
    },
    { merge: true }
  );

  try {
    await updateDoc(chatDocRef, { [`unread.${me}`]: 0 });
  } catch {}

  const msgsRef = collection(db, "chats", roomId, "messages");
  const qy = query(msgsRef, orderBy("createdAt", "asc"), limitToLast(60));

  if (UI.state.chatUnsub) UI.state.chatUnsub();

  UI.state.chatUnsub = onSnapshot(
    qy,
    { includeMetadataChanges: true },
    async (snap) => {
      const me = auth.currentUser.uid;
      const otherId = currentChat.otherId;

      const b = writeBatch(db);
      let needCommit = false;

      // ✅ render by docChanges فقط
      snap.docChanges().forEach((ch) => {
        const d = ch.doc;
        const id = d.id;

        const m = d.data({ serverTimestamps: "estimate" }) || {};
        const isPending = d.metadata?.hasPendingWrites;

        // added/modified => render
        if (ch.type === "added" || ch.type === "modified") {
          renderMsg(id, m, me, otherId, isPending);
          renderedIds.add(id);
        }
      });

      scrollToBottom();

      // ✅ mark delivered/read للرسائل الواردة فقط
      snap.forEach((d) => {
        const m = d.data({ serverTimestamps: "estimate" }) || {};
        if (m.senderId && m.senderId !== me) {
          const deliveredTo = m.deliveredTo || {};
          const readBy = m.readBy || {};
          const msgRef = doc(db, "chats", roomId, "messages", d.id);

          if (!deliveredTo[me]) {
            b.set(msgRef, { deliveredTo: { [me]: serverTimestamp() } }, { merge: true });
            needCommit = true;
          }
          if (!readBy[me]) {
            b.set(msgRef, { readBy: { [me]: serverTimestamp() } }, { merge: true });
            needCommit = true;
          }
        }
      });

      if (needCommit) {
        try {
          await b.commit();
        } catch {}
      }

      try {
        await updateDoc(chatDocRef, { [`unread.${me}`]: 0 });
      } catch {}
    },
    (err) => {
      console.warn("chat snapshot error:", err);
    }
  );
}

function closeChat() {
  if (UI.state.chatUnsub) UI.state.chatUnsub();
  UI.state.chatUnsub = null;
  UI.hide(UI.el.chatBox);
  currentChat = { listingId: null, roomId: null, otherId: null, listingTitle: "" };
}

/* =========================
   ✅ sendMsg (Optimistic + no long disable)
========================= */
let sendCooldown = false;

async function sendMsg() {
  try {
    requireAuth();
  } catch {
    return;
  }

  bindChatControls();
  const input = UI.el.chatInput || document.getElementById("chatInput");
  const btn = UI.el.btnSend || document.getElementById("btnSend");

  if (!input || !btn) return;

  const text = (input.value || "").trim();
  if (!text) return;
  if (!currentChat.roomId) return;

  // ✅ debounce بسيط لمنع spam ضغطات متتالية
  if (sendCooldown) return;
  sendCooldown = true;
  setTimeout(() => (sendCooldown = false), 350);

  const me = auth.currentUser.uid;
  const otherId = currentChat.otherId;
  const roomId = currentChat.roomId;

  // ✅ Optimistic render: اعرض الرسالة فوراً بدون انتظار الشبكة
  const localId = "local_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  renderMsg(
    localId,
    { text, senderId: me, createdAt: new Date() },
    me,
    otherId,
    true
  );

  scrollToBottom();
  input.value = "";

  // ✅ لا تعطل الزر لفترة طويلة (فقط وميض سريع)
  btn.disabled = true;
  setTimeout(() => {
    // failsafe: حتى لو الشبكة علقت، رجّع الزر
    try { btn.disabled = false; } catch {}
  }, 700);

  const msgsRef = collection(db, "chats", roomId, "messages");
  const chatDocRef = doc(db, "chats", roomId);

  // ✅ ارسل بدون await طويل (خليه بالخلفية)
  addDoc(msgsRef, {
    text,
    senderId: me,
    createdAt: serverTimestamp(),
    deliveredTo: {},
    readBy: {},
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000)
  })
    .then(async () => {
      // ✅ حدّث الميتا
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(chatDocRef);
          if (!snap.exists()) {
            tx.set(
              chatDocRef,
              {
                listingId: currentChat.listingId,
                listingTitle: currentChat.listingTitle,
                buyerId: me,
                sellerId: otherId,
                participants: [me, otherId].sort(),
                updatedAt: serverTimestamp(),
                lastText: text.slice(0, 120),
                unread: { [me]: 0, [otherId]: 1 }
              },
              { merge: true }
            );
            return;
          }

          tx.update(chatDocRef, {
            lastText: text.slice(0, 120),
            updatedAt: serverTimestamp(),
            [`unread.${otherId}`]: increment(1),
            [`unread.${me}`]: 0
          });
        });
      } catch {}
    })
    .catch((err) => {
      console.warn("sendMsg failed:", err);
      // رجّع النص للمستخدم إذا فشل
      input.value = text;
      alert("تعذر إرسال الرسالة. تأكد من الإنترنت.");
    })
    .finally(() => {
      try { btn.disabled = false; } catch {}
    });
}

/* =========================
   ✅ INBOX
========================= */
async function openInbox() {
  try { requireAuth(); } catch { return; }
  UI.showInboxPage();
  await loadInbox();
}

function closeInbox() {
  if (inboxUnsub) inboxUnsub();
  inboxUnsub = null;
  UI.hide(UI.el.inboxPage);
}

async function loadInbox() {
  try { requireAuth(); } catch { return; }

  const me = auth.currentUser.uid;

  if (UI.el?.inboxList) {
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

  inboxUnsub = onSnapshot(qy, (snap) => {
    const rows = [];
    snap.forEach((d) => {
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

    rows.sort((a, b) => {
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

    if (increased && now - lastNotifyAt > 1200) {
      lastNotifyAt = now;
      const inboxOpen = UI.el?.inboxPage && !UI.el.inboxPage.classList.contains("hidden");
      const shouldNotify = document.hidden || !inboxOpen;

      if (shouldNotify) {
        try {
          Notify.show({
            title: "رسالة جديدة 💬",
            body: `عندك ${totalUnread} رسالة غير مقروءة`,
            tag: "inbox"
          });
        } catch {}
      }
    }

    lastTotalUnread = totalUnread;

    if (UI.el?.inboxList) renderInbox(rows, me);
  });
}

function renderInbox(rows, me) {
  UI.el.inboxList.innerHTML = "";

  if (!rows.length) {
    UI.setInboxEmpty(true);
    return;
  }
  UI.setInboxEmpty(false);

  rows.forEach((r) => {
    const otherId = (r.participants || []).find((x) => x !== me) || "";
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