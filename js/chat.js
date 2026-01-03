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
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function initChat(){
  UI.actions.openChat = openChat;
  UI.actions.closeChat = closeChat;
  UI.el.btnSend.onclick = sendMsg;
}

function chatRoomId(listingId, a, b){
  return `listing_${listingId}_${[a,b].sort().join("_")}`;
}

let currentChat = { listingId:null, roomId:null, otherId:null, listingTitle:"" };

async function resolveOwnerId(listingId){
  // 1) من currentListing إن وجد
  const o1 = UI.state.currentListing?.ownerId;
  if (o1) return o1;

  // 2) من Firestore كـ fallback
  try{
    const snap = await getDoc(doc(db, "listings", listingId));
    if (snap.exists()) return snap.data()?.ownerId || null;
  }catch{}
  return null;
}

/**
 * openChat(listingId, listingTitle, ownerId?)
 * - ownerId optional لكن الأفضل تمريره من صفحة التفاصيل
 */
async function openChat(listingId, listingTitle = "إعلان", ownerId = null){
  try{ requireAuth(); }catch{ return; }

  UI.resetOverlays();
  UI.show(UI.el.chatBox);
  UI.el.chatTitle.textContent = `محادثة: ${listingTitle}`;

  const me = auth.currentUser.uid;

  // ✅ احصل على ownerId بشكل موثوق
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

  // ✅ أنشئ/حدّث وثيقة المحادثة الرئيسية (Meta) حتى نقدر نعمل Inbox لاحقاً
  const chatDocRef = doc(db, "chats", roomId);
  await setDoc(chatDocRef, {
    listingId,
    listingTitle,
    buyerId: me,
    sellerId: realOwnerId,
    participants: [me, realOwnerId].sort(),
    updatedAt: serverTimestamp(),
    lastText: ""
  }, { merge: true });

  const msgsRef = collection(db, "chats", roomId, "messages");
  const qy = query(msgsRef, orderBy("createdAt","asc"), limit(60));

  if (UI.state.chatUnsub) UI.state.chatUnsub();
  UI.state.chatUnsub = onSnapshot(qy, (snap)=>{
    UI.el.chatMsgs.innerHTML = "";
    snap.forEach(d=>{
      const m = d.data();
      const div = document.createElement("div");
      div.className = "msg" + (m.senderId===me ? " me": "");
      const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : "";
      div.innerHTML = `<div>${escapeHtml(m.text||"")}</div><div class="t">${escapeHtml(time)}</div>`;
      UI.el.chatMsgs.appendChild(div);
    });
    UI.el.chatMsgs.scrollTop = UI.el.chatMsgs.scrollHeight;
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

  const msgsRef = collection(db, "chats", currentChat.roomId, "messages");
  const chatDocRef = doc(db, "chats", currentChat.roomId);

  await addDoc(msgsRef, {
    text,
    senderId: me,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 7*24*3600*1000)
  });

  // ✅ حدّث الميتا (آخر رسالة + وقت)
  try{
    await updateDoc(chatDocRef, {
      lastText: text.slice(0, 120),
      updatedAt: serverTimestamp()
    });
  }catch{
    // لو فشل update لأي سبب، ما نوقف الإرسال
  }

  UI.el.chatInput.value = "";
}