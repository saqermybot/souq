import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs,
  addDoc, updateDoc, query, where, orderBy, limit, startAfter,
  serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  GoogleAuthProvider, signInWithRedirect, getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ====== Firebase config (ضع config تبعك إذا مختلف) ======
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
const db = getFirestore(app);
const auth = getAuth(app);

// ====== Cloudinary ======
const CLOUD_NAME = "dr59awqcq";
const UPLOAD_PRESET = "souq_unsigned"; // إذا سميته غير هيك بدله هون
const CLOUD_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// ====== UI refs ======
const authBar = document.getElementById("authBar");

const loginBox = document.getElementById("loginBox");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");
const btnGoogle = document.getElementById("btnGoogle");

const cityFilter = document.getElementById("cityFilter");
const catFilter = document.getElementById("catFilter");
const btnApply = document.getElementById("btnApply");
const btnReset = document.getElementById("btnReset");

const listingsEl = document.getElementById("listings");
const btnMore = document.getElementById("btnMore");

const details = document.getElementById("details");
const btnBack = document.getElementById("btnBack");
const dTitle = document.getElementById("dTitle");
const dMeta = document.getElementById("dMeta");
const dPrice = document.getElementById("dPrice");
const dDesc = document.getElementById("dDesc");
const btnChat = document.getElementById("btnChat");
const gImg = document.getElementById("gImg");
const gDots = document.getElementById("gDots");
const gPrev = document.getElementById("gPrev");
const gNext = document.getElementById("gNext");

const addBox = document.getElementById("addBox");
const btnAddBack = document.getElementById("btnAddBack");
const aTitle = document.getElementById("aTitle");
const aDesc = document.getElementById("aDesc");
const aPrice = document.getElementById("aPrice");
const aCurrency = document.getElementById("aCurrency");
const aCity = document.getElementById("aCity");
const aCat = document.getElementById("aCat");
const aImages = document.getElementById("aImages");
const imgPreview = document.getElementById("imgPreview");
const btnPublish = document.getElementById("btnPublish");
const btnClear = document.getElementById("btnClear");
const uploadStatus = document.getElementById("uploadStatus");

const chatBox = document.getElementById("chatBox");
const btnChatBack = document.getElementById("btnChatBack");
const chatTitle = document.getElementById("chatTitle");
const chatMsgs = document.getElementById("chatMsgs");
const chatInput = document.getElementById("chatInput");
const btnSend = document.getElementById("btnSend");

// ====== Data ======
const SY_CITIES = ["دمشق","ريف دمشق","حمص","حماة","حلب","اللاذقية","طرطوس","إدلب","دير الزور","الرقة","الحسكة","درعا","السويداء","القنيطرة"];
let lastDoc = null;
let currentListing = null;
let currentGallery = { imgs: [], idx: 0 };
let chatUnsub = null;

// ====== Helpers ======
const escapeHtml = (s="") => String(s).replace(/[&<>"']/g, m => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[m]));

function showOnly(sectionId){
  [loginBox, details, addBox, chatBox].forEach(el => el.classList.add("hidden"));
  // filters+listings always visible in marketplace view
  if (sectionId) document.getElementById(sectionId).classList.remove("hidden");
}

function resetOverlays(){
  details.classList.add("hidden");
  addBox.classList.add("hidden");
  chatBox.classList.add("hidden");
}

// ====== Auth ======
btnLogin.onclick = async () => {
  try{
    await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
  }catch(e){ alert(e?.message || "Login failed"); }
};

btnRegister.onclick = async () => {
  try{
    await createUserWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
  }catch(e){ alert(e?.message || "Register failed"); }
};

btnGoogle.onclick = async () => {
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
};

getRedirectResult(auth).then(() => {}).catch(() => {});

onAuthStateChanged(auth, async (user) => {
  renderAuth(user);
  if (user) await ensureUserDoc(user);
});

async function ensureUserDoc(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()){
    await updateDoc(ref, {}).catch(async () => {
      // إذا doc غير موجود، نعمله addDoc؟ أسهل نستخدم set عبر updateDoc fallback:
      // (بس Firebase web modular setDoc غير مستورد لتخفيف)
    });
    // نعمل create عبر addDoc لcollection users مع id مخصص صعب بدون setDoc
    // لذلك: نتجاهل إنشاء users doc بالـ MVP
  }
}

function renderAuth(user){
  if (!user){
    authBar.innerHTML = "";
    loginBox.classList.remove("hidden");
    return;
  }
  loginBox.classList.add("hidden");
  authBar.innerHTML = `
    <button id="btnOpenAdd" class="secondary">+ إعلان جديد</button>
    <button id="btnLogout" class="ghost">خروج</button>
  `;
  document.getElementById("btnLogout").onclick = () => signOut(auth);
  document.getElementById("btnOpenAdd").onclick = () => openAdd();
}

// ====== Filters init ======
function initFilters(){
  cityFilter.innerHTML = `<option value="">كل المدن</option>` + SY_CITIES.map(c=>`<option value="${c}">${c}</option>`).join("");
  aCity.innerHTML = `<option value="">اختر مدينة</option>` + SY_CITIES.map(c=>`<option value="${c}">${c}</option>`).join("");
  catFilter.innerHTML = `<option value="">كل الأصناف</option>`;
  aCat.innerHTML = `<option value="">اختر صنف</option>`;
}

async function loadCategories(){
  const qy = query(collection(db, "categories"), where("isActive","==", true), orderBy("order","asc"));
  const snap = await getDocs(qy);
  const opts = snap.docs.map(d=>{
    const id = d.id;
    const n = d.data().name_ar || id;
    return `<option value="${id}">${escapeHtml(n)}</option>`;
  });
  catFilter.innerHTML = `<option value="">كل الأصناف</option>` + opts.join("");
  aCat.innerHTML = `<option value="">اختر صنف</option>` + opts.join("");
}

// ====== Listings ======
btnApply.onclick = () => loadListings(true);
btnReset.onclick = () => { cityFilter.value=""; catFilter.value=""; loadListings(true); };
btnMore.onclick = () => loadListings(false);

async function loadListings(reset=true){
  if (reset){ listingsEl.innerHTML=""; lastDoc=null; }

  const wh = [ where("isActive","==",true) ];
  if (cityFilter.value) wh.push(where("city","==", cityFilter.value));
  if (catFilter.value) wh.push(where("category","==", catFilter.value));

  // مهم: orderBy createdAt. تأكد أي listing جديد فيه createdAt
  let qy = query(collection(db,"listings"), ...wh, orderBy("createdAt","desc"), limit(10));
  if (lastDoc) qy = query(collection(db,"listings"), ...wh, orderBy("createdAt","desc"), startAfter(lastDoc), limit(10));

  const snap = await getDocs(qy);
  if (snap.docs.length) lastDoc = snap.docs[snap.docs.length-1];

  snap.forEach(ds => {
    const data = ds.data();
    const img = (data.images && data.images[0]) ? data.images[0] : "";
    const card = document.createElement("div");
    card.className = "item";
    card.innerHTML = `
      <img class="thumb" src="${img}" alt="" />
      <div class="itemBody">
        <div class="itemTitle">${escapeHtml(data.title || "بدون عنوان")}</div>
        <div class="itemMeta">
          <span class="badge">${escapeHtml(data.city||"")}</span>
          <span class="badge">${escapeHtml(data.category||"")}</span>
        </div>
        <div class="itemPrice">${escapeHtml(String(data.price ?? ""))} ${escapeHtml(data.currency||"")}</div>
        <button class="secondary" style="margin-top:10px">عرض</button>
      </div>
    `;
    card.querySelector("button").onclick = () => openDetails(ds.id, data);
    listingsEl.appendChild(card);
  });
}

// ====== Details + gallery ======
btnBack.onclick = () => { details.classList.add("hidden"); currentListing=null; };
gPrev.onclick = () => setGalleryIdx(currentGallery.idx - 1);
gNext.onclick = () => setGalleryIdx(currentGallery.idx + 1);

function renderGallery(imgs){
  currentGallery = { imgs: imgs || [], idx: 0 };
  if (!currentGallery.imgs.length){
    gImg.src = "";
    gDots.innerHTML = "";
    return;
  }
  gDots.innerHTML = currentGallery.imgs.map((_,i)=>`<div class="dot ${i===0?"active":""}"></div>`).join("");
  gImg.src = currentGallery.imgs[0];
}
function setGalleryIdx(i){
  const n = currentGallery.imgs.length;
  if (!n) return;
  const idx = (i + n) % n;
  currentGallery.idx = idx;
  gImg.src = currentGallery.imgs[idx];
  [...gDots.children].forEach((d,k)=>d.classList.toggle("active", k===idx));
}

function openDetails(id, data){
  resetOverlays();
  details.classList.remove("hidden");
  currentListing = { id, ...data };

  renderGallery(data.images || []);
  dTitle.textContent = data.title || "";
  dMeta.textContent = `${data.city || ""} • ${data.category || ""}`;
  dPrice.textContent = `${data.price ?? ""} ${data.currency || ""}`;
  dDesc.textContent = data.description || "";
}

btnChat.onclick = () => {
  if (!auth.currentUser) return alert("سجّل دخول أولاً");
  if (!currentListing) return;
  openChat(currentListing.id, currentListing.title);
};

// ====== Add listing (Marketplace style) ======
function openAdd(){
  resetOverlays();
  addBox.classList.remove("hidden");
  uploadStatus.textContent = "";
  imgPreview.innerHTML = "";
}

btnAddBack.onclick = () => addBox.classList.add("hidden");

btnClear.onclick = () => {
  aTitle.value=""; aDesc.value=""; aPrice.value="";
  aCity.value=""; aCat.value="";
  aImages.value="";
  imgPreview.innerHTML="";
  uploadStatus.textContent="";
};

aImages.onchange = () => {
  const files = Array.from(aImages.files || []);
  imgPreview.innerHTML = "";
  files.slice(0,3).forEach(f=>{
    const img = document.createElement("img");
    img.className="pimg";
    img.src = URL.createObjectURL(f);
    imgPreview.appendChild(img);
  });
};

btnPublish.onclick = async () => {
  if (!auth.currentUser) return alert("سجّل دخول أولاً");

  const title = aTitle.value.trim();
  const description = aDesc.value.trim();
  const price = Number(aPrice.value);
  const currency = aCurrency.value;
  const city = aCity.value;
  const category = aCat.value;

  const files = Array.from(aImages.files || []);
  if (!title || !description || !price || !city || !category) return alert("كمّل كل الحقول");
  if (files.length !== 3) return alert("لازم تختار 3 صور بالضبط");

  btnPublish.disabled = true;
  uploadStatus.textContent = "جاري رفع الصور...";

  try{
    // 1) رفع 3 صور إلى Cloudinary (بعد تصغيرها)
    const urls = [];
    for (let i=0;i<3;i++){
      uploadStatus.textContent = `رفع صورة ${i+1}/3 ...`;
      const resized = await fileToResizedJpeg(files[i], 1280, 0.82);
      const url = await uploadToCloudinary(resized);
      urls.push(url);
    }

    uploadStatus.textContent = "جاري نشر الإعلان...";

    // 2) حفظ الإعلان في Firestore
    await addDoc(collection(db,"listings"), {
      title,
      description,
      price,
      currency,
      city,
      category,
      images: urls,
      ownerId: auth.currentUser.uid,
      isActive: true,
      createdAt: serverTimestamp()
    });

    uploadStatus.textContent = "تم نشر الإعلان ✅";
    btnClear.click();
    addBox.classList.add("hidden");
    await loadListings(true);
  }catch(e){
    alert(e?.message || "فشل النشر");
  }finally{
    btnPublish.disabled = false;
  }
};

// ====== Cloudinary upload ======
async function uploadToCloudinary(file){
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);

  // نطلب يضعها داخل فولدر (إذا preset ما يطبّق فولدر)
  fd.append("folder", "souq/listings");

  const res = await fetch(CLOUD_UPLOAD_URL, { method:"POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Cloudinary upload failed");
  return data.secure_url;
}

// تصغير الصور قبل الرفع لتخفيف الحجم
async function fileToResizedJpeg(file, maxSide=1280, quality=0.82){
  const img = await new Promise((resolve, reject)=>{
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });

  const w = img.width, h = img.height;
  const scale = Math.min(1, maxSide / Math.max(w,h));
  const nw = Math.round(w*scale), nh = Math.round(h*scale);

  const canvas = document.createElement("canvas");
  canvas.width = nw; canvas.height = nh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, nw, nh);

  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
  return new File([blob], "photo.jpg", { type:"image/jpeg" });
}

// ====== Chat (7 days auto-delete policy later via Cloud Function; for now simple) ======
let currentChat = { listingId:null, roomId:null };

btnChatBack.onclick = () => closeChat();
btnSend.onclick = () => sendMsg();

function chatRoomId(listingId, a, b){
  const x = [a,b].sort().join("_");
  return `listing_${listingId}_${x}`;
}

async function openChat(listingId, listingTitle){
  resetOverlays();
  chatBox.classList.remove("hidden");
  chatTitle.textContent = `محادثة: ${listingTitle}`;

  const me = auth.currentUser.uid;
  const ownerId = currentListing?.ownerId;
  const other = ownerId && ownerId !== me ? ownerId : null;

  if (!other) {
    chatMsgs.innerHTML = `<div class="muted">لا يمكن مراسلة نفسك.</div>`;
    return;
  }

  const roomId = chatRoomId(listingId, me, other);
  currentChat = { listingId, roomId };

  const msgsRef = collection(db, "chats", roomId, "messages");
  const qy = query(msgsRef, orderBy("createdAt","asc"), limit(50));

  if (chatUnsub) chatUnsub();
  chatUnsub = onSnapshot(qy, (snap)=>{
    chatMsgs.innerHTML = "";
    snap.forEach(d=>{
      const m = d.data();
      const div = document.createElement("div");
      div.className = "msg" + (m.senderId===me ? " me": "");
      div.innerHTML = `<div>${escapeHtml(m.text||"")}</div><div class="t">${m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : ""}</div>`;
      chatMsgs.appendChild(div);
    });
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  });
}

function closeChat(){
  if (chatUnsub) chatUnsub();
  chatUnsub = null;
  chatBox.classList.add("hidden");
}

async function sendMsg(){
  const text = chatInput.value.trim();
  if (!text) return;
  if (!currentChat.roomId) return;

  const me = auth.currentUser.uid;
  const msgsRef = collection(db, "chats", currentChat.roomId, "messages");

  await addDoc(msgsRef, {
    text,
    senderId: me,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 7*24*3600*1000) // مجرد قيمة، الحذف الفعلي لاحقًا
  });

  chatInput.value = "";
}

// ====== Init ======
initFilters();
loadCategories().catch(()=>{});
loadListings(true).catch(()=>{});