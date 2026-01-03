import { db, auth } from "./firebase.js";
import { UI } from "./ui.js";
import { escapeHtml } from "./utils.js";
import { requireAuth } from "./auth.js";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function initChat(){
  UI.actions.openChat = openChat;
  UI.actions.closeChat = closeChat;
  UI.el.btnSend.onclick = sendMsg;
}

function chatRoomId(listingId, a, b){
  return `listing_${listingId}_${[a,b].sort().join("_")}`;
}

let currentChat = { listingId:null, roomId:null, otherId:null };

async function ensureRoom(roomId, me, other, listingId){
  const roomRef = doc(db, "chats", roomId);
  const snap = await getDoc(roomRef);

  if (!snap.exists()){
    // ✅ create room doc with participants
    await setDoc(roomRef, {
      participants: [me, other],
      listingId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  return roomRef;
}

async function openChat(listingId, listingTitle){
  try{ requireAuth(); }catch{ return; }

  UI.resetOverlays();
  UI.show(UI.el.chatBox);
  UI.el.chatTitle.textContent = `محادثة: ${listingTitle}`;

  const me = auth.currentUser.uid;
  const ownerId = UI.state.currentListing?.ownerId;
  const other = ownerId && ownerId !== me ? ownerId : null;

  if (!other){
    UI.el.chatMsgs.innerHTML = `<div class="muted">لا يمكن مراسلة نفسك.</div>`;
    return;
  }

  const roomId = chatRoomId(listingId, me, other);
  currentChat = { listingId, roomId, otherId: other };

  // ✅ create room (participants) if missing
  await ensureRoom(roomId, me, other, listingId);

  const msgsRef = collection(db, "chats", roomId, "messages");
  const qy = query(msgsRef, orderBy("createdAt","asc"), limit(50));

  if (UI.state.chatUnsub) UI.state.chatUnsub();

  UI.state.chatUnsub = onSnapshot(qy, (snap)=>{
    UI.el.chatMsgs.innerHTML = "";
    snap.forEach(d=>{
      const m = d.data();
      const div = document.createElement("div");
      div.className = "msg" + (m.senderId===me ? " me": "");
      const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : "";
      div.innerHTML = `
        <div>${escapeHtml(m.text || "")}</div>
        <div class="t">${escapeHtml(time)}</div>
      `;
      UI.el.chatMsgs.appendChild(div);
    });
    UI.el.chatMsgs.scrollTop = UI.el.chatMsgs.scrollHeight;
  });
}

function closeChat(){
  if (UI.state.chatUnsub) UI.state.chatUnsub();
  UI.state.chatUnsub = null;
  UI.hide(UI.el.chatBox);
}

async function sendMsg(){
  try{ requireAuth(); }catch{ return; }

  const text = UI.el.chatInput.value.trim();
  if (!text) return;
  if (!currentChat.roomId) return;

  const me = auth.currentUser.uid;
  const other = currentChat.otherId;
  const roomId = currentChat.roomId;

  // ✅ ensure room exists (safety)
  await ensureRoom(roomId, me, other, currentChat.listingId);

  const msgsRef = collection(db, "chats", roomId, "messages");

  await addDoc(msgsRef, {
    text,
    senderId: me,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 7*24*3600*1000) // للحذف لاحقاً عبر وظيفة تنظيف
  });

  UI.el.chatInput.value = "";
}