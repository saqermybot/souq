import { db, auth } from "./firebase.js";
import { CLOUDINARY, MAX_IMAGES } from "./config.js";
import { UI } from "./ui.js";
import { requireAuth } from "./auth.js";
import { fileToResizedJpeg } from "./utils.js";

import {
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let publishing = false;
let previewUrls = [];

export function initAddListing() {
  UI.actions.openAdd = openAdd;

  // زر رجوع
  if (UI.el.btnAddBack) UI.el.btnAddBack.onclick = () => UI.hide(UI.el.addBox);

  UI.el.btnClear.onclick = clearForm;
  UI.el.aImages.onchange = previewImages;
  UI.el.btnPublish.onclick = publish;

  // ✅ أنشئ الحقول الإضافية إذا غير موجودة
  ensureDynamicFields();

  // ✅ تبديل تلقائي حسب الصنف
  UI.el.aCat.addEventListener("change", syncDynamicFieldsVisibility);
  syncDynamicFieldsVisibility();
}

function ensureDynamicFields(){
  // مكان ممتاز نحط فيه الحقول قبل الصور
  const anchor = UI.el.aImages?.closest(".row") || UI.el.aImages?.parentElement || UI.el.addBox;
  if (!anchor) return;

  // لو الحقول موجودة ما نعيد إنشاءها
  if (document.getElementById("carFields") || document.getElementById("estateFields")) return;

  const wrap = document.createElement("div");
  wrap.id = "dynamicFieldsWrap";
  wrap.className = "box"; // إذا عندك class box، وإلا عادي

  wrap.innerHTML = `
    <!-- ✅ سيارات -->
    <div id="carFields" class="hidden">
      <div class="row">
        <label class="muted small">نوع الإعلان</label>
        <select id="aType" class="input">
          <option value="">اختر (بيع / إيجار)</option>
          <option value="بيع">بيع</option>
          <option value="إيجار">إيجار</option>
        </select>
      </div>

      <div class="row">
        <label class="muted small">موديل السيارة</label>
        <input id="aCarModel" class="input" placeholder="مثال: كيا ريو / هيونداي i10" />
      </div>

      <div class="row">
        <label class="muted small">سنة الصنع</label>
        <input id="aCarYear" class="input" type="number" min="1950" max="2035" placeholder="مثال: 2006" />
      </div>
    </div>

    <!-- ✅ عقارات -->
    <div id="estateFields" class="hidden">
      <div class="row">
        <label class="muted small">نوع الإعلان</label>
        <select id="aTypeEstate" class="input">
          <option value="">اختر (بيع / إيجار)</option>
          <option value="بيع">بيع</option>
          <option value="إيجار">إيجار</option>
        </select>
      </div>

      <div class="row">
        <label class="muted small">نوع العقار</label>
        <select id="aEstateKind" class="input">
          <option value="">اختر نوع العقار</option>
          <option value="شقة">شقة</option>
          <option value="محل">محل</option>
          <option value="أرض">أرض</option>
          <option value="بيت">بيت</option>
        </select>
      </div>

      <div class="row">
        <label class="muted small">عدد الغرف (اختياري)</label>
        <input id="aRooms" class="input" type="number" min="0" max="20" placeholder="مثال: 3" />
      </div>
    </div>
  `;

  // إدخال الحقول قبل قسم الصور
  anchor.parentElement?.insertBefore(wrap, anchor);

  // خزن refs بسيطة (مو ضروري بس مفيد)
  UI.el.aType = document.getElementById("aType");
  UI.el.aCarModel = document.getElementById("aCarModel");
  UI.el.aCarYear = document.getElementById("aCarYear");

  UI.el.aTypeEstate = document.getElementById("aTypeEstate");
  UI.el.aEstateKind = document.getElementById("aEstateKind");
  UI.el.aRooms = document.getElementById("aRooms");
}

function syncDynamicFieldsVisibility(){
  const cat = (UI.el.aCat?.value || "").trim();

  const carBox = document.getElementById("carFields");
  const estBox = document.getElementById("estateFields");

  if (carBox) carBox.classList.toggle("hidden", cat !== "سيارات");
  if (estBox) estBox.classList.toggle("hidden", cat !== "عقارات");
}

function openAdd() {
  UI.resetOverlays();
  UI.show(UI.el.addBox);
  setStatus("");
  UI.el.imgPreview.innerHTML = "";
  cleanupPreviewUrls();
  syncDynamicFieldsVisibility();
}

function clearForm() {
  UI.el.aTitle.value = "";
  UI.el.aDesc.value = "";
  UI.el.aPrice.value = "";
  UI.el.aCurrency.value = "SYP";
  UI.el.aCity.value = "";
  UI.el.aCat.value = "";
  UI.el.aImages.value = "";
  UI.el.imgPreview.innerHTML = "";
  setStatus("");
  cleanupPreviewUrls();

  // ✅ تفريغ الحقول الديناميكية
  document.getElementById("aType") && (document.getElementById("aType").value = "");
  document.getElementById("aCarModel") && (document.getElementById("aCarModel").value = "");
  document.getElementById("aCarYear") && (document.getElementById("aCarYear").value = "");

  document.getElementById("aTypeEstate") && (document.getElementById("aTypeEstate").value = "");
  document.getElementById("aEstateKind") && (document.getElementById("aEstateKind").value = "");
  document.getElementById("aRooms") && (document.getElementById("aRooms").value = "");
}

function setStatus(msg = "") {
  if (UI.el.uploadStatus) UI.el.uploadStatus.textContent = msg;
}

function cleanupPreviewUrls(){
  try{ previewUrls.forEach(u => URL.revokeObjectURL(u)); }catch{}
  previewUrls = [];
}

function previewImages() {
  cleanupPreviewUrls();

  const filesAll = Array.from(UI.el.aImages.files || []);
  const files = filesAll.slice(0, MAX_IMAGES);

  UI.el.imgPreview.innerHTML = "";

  files.forEach((f) => {
    const img = document.createElement("img");
    img.className = "pimg";
    const u = URL.createObjectURL(f);
    previewUrls.push(u);
    img.src = u;
    UI.el.imgPreview.appendChild(img);
  });

  if (filesAll.length > MAX_IMAGES) {
    setStatus(`تم اختيار أول ${MAX_IMAGES} صور فقط (حد أقصى).`);
  } else if (files.length === 0) {
    setStatus("");
  } else {
    setStatus(`مختار ${files.length} صورة.`);
  }
}

function validateForm({ title, description, price, city, category, files, extra }) {
  if (!title) return "اكتب عنوان الإعلان";
  if (title.length < 3) return "العنوان قصير جداً";
  if (!description) return "اكتب وصف الإعلان";
  if (description.length < 10) return "الوصف قصير جداً";
  if (!price || Number.isNaN(price) || price <= 0) return "اكتب سعر صحيح";
  if (!city) return "اختر المدينة";
  if (!category) return "اختر الصنف";
  if (!files.length) return `اختر صورة واحدة على الأقل (حد أقصى ${MAX_IMAGES})`;

  // ✅ شروط إضافية حسب الصنف
  if (category === "سيارات") {
    if (!extra.type) return "اختر (بيع/إيجار) للسيارة";
    if (!extra.carModel) return "اكتب موديل السيارة";
    if (!extra.carYear) return "اكتب سنة السيارة";
  }
  if (category === "عقارات") {
    if (!extra.type) return "اختر (بيع/إيجار) للعقار";
    if (!extra.estateKind) return "اختر نوع العقار";
  }

  return null;
}

async function publish() {
  try { requireAuth(); } catch { return; }
  if (publishing) return;

  const title = UI.el.aTitle.value.trim();
  const description = UI.el.aDesc.value.trim();
  const price = Number(UI.el.aPrice.value);
  const currency = UI.el.aCurrency.value;
  const city = UI.el.aCity.value;
  const category = UI.el.aCat.value; // عربي

  // ✅ جمع الحقول الإضافية
  const extra = collectExtraFields(category);

  const files = Array.from(UI.el.aImages.files || []).slice(0, MAX_IMAGES);

  const err = validateForm({ title, description, price, city, category, files, extra });
  if (err) return alert(err);

  publishing = true;
  UI.el.btnPublish.disabled = true;
  UI.el.btnClear.disabled = true;
  setStatus("جاري تجهيز الصور...");

  try {
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      setStatus(`رفع صورة ${i + 1}/${files.length} ...`);
      const resized = await fileToResizedJpeg(files[i], 1280, 0.82);
      const secureUrl = await uploadToCloudinary(resized);
      urls.push(secureUrl);
    }

    setStatus("جاري نشر الإعلان...");

    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    await addDoc(collection(db, "listings"), {
      title,
      description,
      price,
      currency,
      city,
      category,

      // ✅ اضافات حسب الصنف
      ...extra,

      images: urls,
      ownerId: auth.currentUser.uid,
      isActive: true,
      createdAt: serverTimestamp(),
      expiresAt
    });

    setStatus("تم نشر الإعلان ✅");

    clearForm();
    UI.hide(UI.el.addBox);

    await reloadListingsWithRetry();

  } catch (e) {
    alert(e?.message || "فشل النشر");
  } finally {
    publishing = false;
    UI.el.btnPublish.disabled = false;
    UI.el.btnClear.disabled = false;
    setTimeout(() => setStatus(""), 1500);
  }
}

function collectExtraFields(category){
  // القيم الافتراضية
  let type = "";
  let carModel = "";
  let carYear = null;

  let estateKind = "";
  let rooms = null;

  if (category === "سيارات") {
    type = (document.getElementById("aType")?.value || "").trim();
    carModel = (document.getElementById("aCarModel")?.value || "").trim();

    const y = Number(document.getElementById("aCarYear")?.value || 0);
    carYear = y >= 1950 ? y : null;

    return { type, carModel, carYear };
  }

  if (category === "عقارات") {
    type = (document.getElementById("aTypeEstate")?.value || "").trim();
    estateKind = (document.getElementById("aEstateKind")?.value || "").trim();

    const r = Number(document.getElementById("aRooms")?.value || 0);
    rooms = r > 0 ? r : null;

    return { type, estateKind, rooms };
  }

  // أصناف ثانية لاحقاً
  return {};
}

async function reloadListingsWithRetry() {
  const delays = [150, 600, 1200];
  for (let i = 0; i < delays.length; i++) {
    try { await UI.actions.loadListings(true); return; } catch { await wait(delays[i]); }
  }
  try { await UI.actions.loadListings(true); } catch {}
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function uploadToCloudinary(file) {
  const { cloudName, uploadPreset, folder } = CLOUDINARY;
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", uploadPreset);
  fd.append("folder", folder);

  const res = await fetch(url, { method: "POST", body: fd });
  const data = await res.json();

  if (!res.ok) throw new Error(data?.error?.message || "Cloudinary upload failed");
  return data.secure_url;
}