import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import { ensureUser } from "./auth.js";
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

async function getUserPublicProfile(uid){
  try{
    const uref = doc(db, "users", uid);
    const usnap = await getDoc(uref);
    if(!usnap.exists()) return { displayName: "مستخدم", phone: "", avatar: "", createdAt: null };
    const d = usnap.data() || {};
    return {
      displayName: d.displayName || d.name || d.username || "مستخدم",
      phone: d.phone || "",
      avatar: d.avatar || "",
      createdAt: d.createdAt || null
    };
  }catch(e){
    return { displayName: "مستخدم", phone: "", avatar: "", createdAt: null };
  }
}

async function getListingTitle(listingId){
  try{
    const lref = doc(db, "listings", listingId);
    const lsnap = await getDoc(lref);
    if(!lsnap.exists()) return "";
    const d = lsnap.data() || {};
    return d.title || d.name || "";
  }catch(e){
    return "";
  }
}

async function updateChatHeader(){
  const titleEl = UI.el.chatTitle;
  const userLinkEl = document.getElementById("chatUserLink");
  const listingLinkEl = document.getElementById("chatListingLink");
  const sepEl = document.getElementById("chatMetaSep");

  if(!titleEl) return;

  const other = await getUserPublicProfile(currentChat.otherId);
  const listingTitle = currentChat.listingTitle || (await getListingTitle(currentChat.listingId));
  currentChat.listingTitle = listingTitle || currentChat.listingTitle;

  titleEl.textContent = other.displayName || "محادثة";

  if(userLinkEl){
    userLinkEl.textContent = "بروفايل";
    userLinkEl.href = `./store.html?u=${encodeURIComponent(currentChat.otherId)}`;
  }
  if(listingLinkEl){
    listingLinkEl.textContent = listingTitle ? `الإعلان: ${listingTitle}` : "الإعلان";
    listingLinkEl.href = `./index.html#${encodeURIComponent(currentChat.listingId)}`;
  }
  if(sepEl){
    sepEl.style.display = (userLinkEl && listingLinkEl) ? "inline" : "none";
  }
}

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

async function renderChatHeader(otherUid, listingId, listingTitle){
  // Title = other user name
  const prof = await getUserPublicProfile(otherUid);
  const name = (prof.displayName || "مستخدم").trim() || "مستخدم";
  const titleEl = document.getElementById("chatTitle");
  if (titleEl) titleEl.textContent = name;

  const userLink = document.getElementById("chatUserLink");
  if (userLink){
    userLink.textContent = "عرض الحساب";
    // ✅ مرّر رابط رجوع سياقي حتى صفحة البائع تقدر ترجعك للشات/الإعلان
    const ret = `./index.html#chat=1&listing=${encodeURIComponent(listingId)}&title=${encodeURIComponent(listingTitle||"")}&other=${encodeURIComponent(otherUid)}`;
    userLink.href = `./store.html?u=${encodeURIComponent(otherUid)}&ret=${encodeURIComponent(ret)}`;
  }

  const listingLink = document.getElementById("chatListingLink");
  if (listingLink){
    const t = (listingTitle || "الإعلان").trim() || "الإعلان";
    listingLink.textContent = `إعلان: ${t}`;
    listingLink.href = `./index.html#listing=${encodeURIComponent(listingId)}`;
  }

  const sep = document.getElementById("chatMetaSep");
  if (sep) sep.style.display = (userLink && listingLink) ? "inline" : "none";
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

  // ✅ Floating bubble (created by UI.init)
  const floatWrap = document.getElementById("inboxFloat");
  const floatCount = document.getElementById("inboxFloatCount");
  if (floatCount) floatCount.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
  if (floatWrap) floatWrap.classList.toggle("hidden", !(totalUnread > 0));
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
  await ensureUser();

  // ✅ الدردشة Overlay: لا تخفي صفحة الإعلان إن كانت مفتوحة
  // (لكن اخفي الإضافات/الإنبوكس)
  UI.hide(UI.el.addBox);
  UI.hide(UI.el.inboxPage);

  // ✅ لو ما في سياق محفوظ، استنتجه
  if (!UI.state.chatReturnTo){
    const detailsOpen = UI.el?.detailsPage && !UI.el.detailsPage.classList.contains("hidden");
    const inboxOpen = UI.el?.inboxPage && !UI.el.inboxPage.classList.contains("hidden");
    if (detailsOpen) UI.state.chatReturnTo = { from: "details", listingId };
    else if (inboxOpen) UI.state.chatReturnTo = { from: "inbox" };
    else UI.state.chatReturnTo = { from: "home" };
  }

  UI.show(UI.el.chatBox);
  UI.el.chatTitle.textContent = `محادثة`;

  const me = auth.currentUser.uid;

  // ✅ صاحب الإعلان الحقيقي (seller) من قاعدة البيانات إن أمكن
  const listingOwnerId = await resolveOwnerId(listingId) || ownerId;
  if (!listingOwnerId){
    UI.el.chatMsgs.innerHTML = `<div class="muted">تعذر تحديد صاحب الإعلان. جرّب فتح الإعلان ثم اضغط مراسلة.</div>`;
    return;
  }

  // ✅ تحديد الطرف الآخر حسب من فتح الشات
  let buyerId;
  let sellerId = listingOwnerId;
  let otherId;

  if (me === sellerId){
    // أنا صاحب الإعلان (seller) — لازم يكون ownerId هو المشتري/الطرف الآخر
    if (!ownerId || ownerId === me){
      UI.el.chatMsgs.innerHTML = `<div class="muted">لا يمكن فتح محادثة بدون طرف آخر.</div>`;
      return;
    }
    buyerId = ownerId;
    otherId = ownerId;
  } else {
    // أنا مشتري/مهتم
    buyerId = me;
    otherId = sellerId;
  }

  const roomId = chatRoomId(listingId, buyerId, sellerId);
  currentChat = { listingId, roomId, otherId, listingTitle };

  // ✅ هيدر الشات: اسم الشخص + رابط الإعلان + رابط الحساب
  await renderChatHeader(otherId, listingId, listingTitle);

  const chatDocRef = doc(db, "chats", roomId);

  // ✅ تأكد وجود الميتا + unread أساسياً
  await setDoc(chatDocRef, {
    listingId,
    listingTitle,
    buyerId,
    sellerId,
    participants: [buyerId, sellerId].sort(),
    updatedAt: serverTimestamp(),
    lastText: "",
    unread: { [buyerId]: 0, [sellerId]: 0 }
  }, { merge: true });

  // ✅ فتح الشات = اعتبرها مقروءة بالمحادثة
  try{
    await updateDoc(chatDocRef, { [`unread.${me}`]: 0 });
  }catch{}

  const msgsRef = collection(db, "chats", roomId, "messages");

  // ✅ آخر 60 رسالة (الأحدث) ثم نعرضها بالترتيب الصحيح
  const qy = query(msgsRef, orderBy("createdAt","desc"), limit(60));

  if (UI.state.chatUnsub) UI.state.chatUnsub();

  UI.state.chatUnsub = onSnapshot(qy, async (snap)=>{
    UI.el.chatMsgs.innerHTML = "";

    const b = writeBatch(db);
    let needCommit = false;

    // ✅ اعكس النتائج حتى تطلع من القديم للجديد
    const docs = [];
    snap.forEach(d => docs.push(d));
    docs.reverse().forEach(d=>{
      const m = d.data() || {};
      const isPending = d.metadata?.hasPendingWrites;

      // Render
      const div = document.createElement("div");
      div.className = "msg" + (m.senderId===me ? " me": "");
      const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : "";
      const st = statusIconForMessage(m, me, otherId, !!isPending);

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
  });
}

function closeChat(){
  if (UI.state.chatUnsub) UI.state.chatUnsub();
  UI.state.chatUnsub = null;
  UI.hide(UI.el.chatBox);

  // ✅ رجوع سياقي عند الإغلاق (زر ✕)
  const rt = UI.state.chatReturnTo;
  const listingId = currentChat.listingId;

  // صفّر الشات الحالي بعد ما نقرأ منه
  currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };

  // من إعلان → ارجع للإعلان نفسه
  if (rt?.from === "details" && (rt.listingId || listingId)){
    const id = rt.listingId || listingId;
    try{ UI.actions.openDetails?.(id, null, true); }catch{}
    return;
  }

  // من Inbox → ارجع لصندوق المحادثات
  if (rt?.from === "inbox"){
    try{ UI.actions.openInbox?.(); }catch{}
    return;
  }

  // من صفحة بائع (احتياط)
  if (rt?.from === "seller" && rt.sellerId){
    try{ location.href = `./store.html?u=${encodeURIComponent(rt.sellerId)}`; }catch{}
    return;
  }

  // افتراضي: بس سكّر
}

async function sendMsg(){
  await ensureUser();

  const text = UI.el.chatInput.value.trim();
  if (!text) return;
  if (!currentChat.roomId) return;

  const me = auth.currentUser.uid;
  const otherId = currentChat.otherId;

  const msgsRef = collection(db, "chats", currentChat.roomId, "messages");
  const chatDocRef = doc(db, "chats", currentChat.roomId);

  // ✅ ضمان وجود وثيقة الشات قبل إرسال الرسالة (مهم مع القواعد)
  try{
    const snap = await getDoc(chatDocRef);
    if (!snap.exists()){
      await setDoc(chatDocRef, {
        listingId: currentChat.listingId,
        listingTitle: currentChat.listingTitle,
        buyerId: me,
        sellerId: otherId,
        participants: [me, otherId].sort(),
        updatedAt: serverTimestamp(),
        lastText: "",
        unread: { [me]: 0, [otherId]: 0 }
      }, { merge: true });
    }
  }catch{}

  // ✅ أرسل الرسالة
  await addDoc(msgsRef, {
    text,
    senderId: me,
    createdAt: serverTimestamp(),
    deliveredTo: {},
    readBy: {},
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
  await ensureUser();
  UI.showInboxPage();
  await loadInbox();
}

function closeInbox(){
  if (inboxUnsub) inboxUnsub();
  inboxUnsub = null;
  UI.hide(UI.el.inboxPage);
}

async function loadInbox(){
  await ensureUser();

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
        // ✅ In-app toast (مثل Messenger) + صوت خفيف
        try{
          const firstUnread = rows.find(r => Number((r.unread && r.unread[me]) || 0) > 0) || rows[0];
          const t = firstUnread?.listingTitle ? `📩 رسالة جديدة بخصوص: ${firstUnread.listingTitle}` : "📩 رسالة جديدة";
          UI.toast?.(`${t}  (${totalUnread})`, 2200);
          playBeep();
        }catch{}

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