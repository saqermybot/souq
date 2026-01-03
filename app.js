import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, addDoc,
  query, where, orderBy, limit, getDocs, startAfter,
  serverTimestamp, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ Firebase config تبعك
const firebaseConfig = {
  apiKey: "AIzaSyAdZJuYm9tZ9H8Bw60zlzGy-Igt-qub0D8",
  authDomain: "souq-a0e16.firebaseapp.com",
  projectId: "souq-a0e16",
  storageBucket: "souq-a0e16.firebasestorage.app",
  messagingSenderId: "380896713624",
  appId: "1:380896713624:web:22b11fc1a19c93af85e9ed",
  measurementId: "G-WZC4VY0HK8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ====== UI refs
const loginBox = document.getElementById("loginBox");
const authBar = document.getElementById("authBar");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");

const cityFilter = document.getElementById("cityFilter");
const catFilter = document.getElementById("catFilter");
const btnApply = document.getElementById("btnApply");
const btnReset = document.getElementById("btnReset");

const listingsGrid = document.getElementById("listingsGrid");
const btnMore = document.getElementById("btnMore");

const details = document.getElementById("details");
const btnBack = document.getElementById("btnBack");
const dTitle = document.getElementById("dTitle");
const dMeta = document.getElementById("dMeta");
const dDesc = document.getElementById("dDesc");
const btnChat = document.getElementById("btnChat");

const chatBox = document.getElementById("chat");
const btnChatBack = document.getElementById("btnChatBack");
const chatInfo = document.getElementById("chatInfo");
const msgs = document.getElementById("msgs");
const msgText = document.getElementById("msgText");
const btnSend = document.getElementById("btnSend");

// ====== Data
const SY_CITIES = [
  "دمشق","ريف دمشق","حلب","حمص","حماة","اللاذقية","طرطوس","إدلب",
  "دير الزور","الرقة","الحسكة","درعا","السويداء","القنيطرة"
];

let lastListingDoc = null;
let currentListing = null;
let currentChatId = null;

// ====== Auth UI
btnLogin.onclick = async () => {
  const email = emailEl.value.trim();
  const pass = passEl.value.trim();
  await signInWithEmailAndPassword(auth, email, pass);
};

btnRegister.onclick = async () => {
  const email = emailEl.value.trim();
  const pass = passEl.value.trim();
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  await ensureUserDoc(cred.user);
  alert("تم إنشاء الحساب ✅");
};

function renderAuth(user) {
  if (!user) {
    authBar.innerHTML = "";
    loginBox.classList.remove("hidden");
    return;
  }
  loginBox.classList.add("hidden");
  authBar.innerHTML = `
    <span class="muted">${escapeHtml(user.email || user.uid)}</span>
    <button id="btnLogout" class="secondary">خروج</button>
  `;
  document.getElementById("btnLogout").onclick = () => signOut(auth);
}

async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || null,
      phone: user.phoneNumber || null,
      createdAt: serverTimestamp(),
      isBlocked: false
    });
  }
}

// ====== Filters
function initFilters() {
  cityFilter.innerHTML = `<option value="">كل المدن</option>` +
    SY_CITIES.map(c => `<option value="${c}">${c}</option>`).join("");

  catFilter.innerHTML = `<option value="">كل الأصناف</option>`;
}

async function loadCategories() {
  const qy = query(collection(db, "categories"), where("isActive", "==", true), orderBy("order", "asc"));
  const snap = await getDocs(qy);
  const opts = snap.docs.map(d => {
    const v = d.id;
    const n = d.data().name_ar || v;
    return `<option value="${v}">${escapeHtml(n)}</option>`;
  });
  catFilter.innerHTML = `<option value="">كل الأصناف</option>` + opts.join("");
}

// ====== Listings
async function loadListings(reset = false) {
  if (reset) {
    listingsGrid.innerHTML = "";
    lastListingDoc = null;
  }

  const wh = [];
  const city = cityFilter.value;
  const cat = catFilter.value;

  if (city) wh.push(where("city", "==", city));
  if (cat) wh.push(where("category", "==", cat));
  wh.push(where("isActive", "==", true));

  // ⚠️ لازم createdAt يكون موجود بالبيانات اللي من التطبيق لاحقًا
  // حالياً إذا بعض test docs بدون createdAt ممكن يطلع خطأ ترتيب.
  // فلو صار خطأ، احذف orderBy وخلينا مؤقتاً نرتب بدون createdAt.
  let qy = query(
    collection(db, "listings"),
    ...wh,
    orderBy("createdAt", "desc"),
    limit(10)
  );

  if (lastListingDoc) {
    qy = query(
      collection(db, "listings"),
      ...wh,
      orderBy("createdAt", "desc"),
      startAfter(lastListingDoc),
      limit(10)
    );
  }

  const snap = await getDocs(qy);
  if (snap.docs.length > 0) lastListingDoc = snap.docs[snap.docs.length - 1];

  snap.docs.forEach(d => {
    const data = d.data();
    const card = document.createElement("div");
    card.className = "card";
    card.style.margin = "0";
    card.innerHTML = `
      <div style="font-weight:700">${escapeHtml(data.title || "بدون عنوان")}</div>
      <div class="muted">${escapeHtml(data.city || "")} • ${escapeHtml(data.category || "")}</div>
      <div style="margin-top:6px">${data.price ?? ""} ${escapeHtml(data.currency || "")}</div>
      <button class="secondary" style="margin-top:10px">عرض</button>
    `;
    card.querySelector("button").onclick = () => openDetails(d.id, data);
    listingsGrid.appendChild(card);
  });
}

function openDetails(id, data) {
  currentListing = { id, ...data };
  details.classList.remove("hidden");
  chatBox.classList.add("hidden");

  dTitle.textContent = data.title || "";
  dMeta.textContent = `${data.city || ""} • ${data.category || ""} • ${data.price ?? ""} ${data.currency || ""}`;
  dDesc.textContent = data.description || "";
}

btnBack.onclick = () => {
  details.classList.add("hidden");
  chatBox.classList.add("hidden");
};

// ====== Chat (محادثة لكل إعلان + أسبوع حذف (MVP))
btnChat.onclick = async () => {
  if (!auth.currentUser) return alert("لازم تسجل دخول أولًا");
  if (!currentListing) return;

  const me = auth.currentUser.uid;
  const seller = currentListing.ownerId;
  if (!seller) return alert("ownerId غير موجود بالإعلان (حطّه بالـ listing)");

  const buyer = me;
  const chatId = [currentListing.id, seller, buyer].join("_");
  currentChatId = chatId;

  const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;

  await setDoc(doc(db, "chats", chatId), {
    listingId: currentListing.id,
    userA: seller,
    userB: buyer,
    lastMessage: "",
    lastAt: serverTimestamp(),
    expiresAtMs,
  }, { merge: true });

  details.classList.add("hidden");
  chatBox.classList.remove("hidden");
  chatInfo.textContent = `إعلان: ${currentListing.title || ""}`;

  await loadMessagesOnce();
};

btnChatBack.onclick = () => {
  chatBox.classList.add("hidden");
  details.classList.remove("hidden");
};

btnSend.onclick = async () => {
  const text = msgText.value.trim();
  if (!text || !currentChatId || !auth.currentUser) return;

  const me = auth.currentUser.uid;
  const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;

  await addDoc(collection(db, "chats", currentChatId, "messages"), {
    senderId: me,
    text,
    createdAt: serverTimestamp()
  });

  await updateDoc(doc(db, "chats", currentChatId), {
    lastMessage: text,
    lastAt: serverTimestamp(),
    expiresAtMs
  });

  msgText.value = "";
  await loadMessagesOnce();
};

async function loadMessagesOnce() {
  msgs.innerHTML = "";
  const qy = query(
    collection(db, "chats", currentChatId, "messages"),
    orderBy("createdAt", "asc"),
    limit(50)
  );
  const snap = await getDocs(qy);
  const me = auth.currentUser.uid;

  snap.docs.forEach(d => {
    const m = d.data();
    const div = document.createElement("div");
    div.className = "msg " + (m.senderId === me ? "me" : "other");
    div.textContent = m.text || "";
    msgs.appendChild(div);
  });

  msgs.scrollTop = msgs.scrollHeight;
}

// تنظيف محادثات منتهية للمستخدم (MVP)
async function cleanupExpiredChatsForUser(user) {
  const now = Date.now();
  const qA = query(collection(db, "chats"), where("userA", "==", user.uid));
  const qB = query(collection(db, "chats"), where("userB", "==", user.uid));
  const [sA, sB] = await Promise.all([getDocs(qA), getDocs(qB)]);
  const all = [...sA.docs, ...sB.docs];

  for (const d of all) {
    const data = d.data();
    if ((data.expiresAtMs || 0) < now) {
      await deleteDoc(doc(db, "chats", d.id));
    }
  }
}

// ====== Events
btnApply.onclick = () => loadListings(true);
btnReset.onclick = () => { cityFilter.value = ""; catFilter.value = ""; loadListings(true); };
btnMore.onclick = () => loadListings(false);

// ====== Bootstrap
initFilters();
loadCategories().then(() => loadListings(true));

onAuthStateChanged(auth, async (user) => {
  renderAuth(user);
  if (user) {
    await ensureUserDoc(user);
    await cleanupExpiredChatsForUser(user);
  }
});

// ====== Helpers
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
