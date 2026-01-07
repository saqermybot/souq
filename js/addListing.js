// addListing.js (Deluxe UI + dynamic fields + organized saving)

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

/* =========================
   ✅ HELPERS
========================= */
function catToAr(catId){
  if (catId === "cars") return "سيارات";
  if (catId === "realestate") return "عقارات";
  if (catId === "electronics") return "إلكترونيات";

  // ✅ NEW
  if (catId === "clothing") return "ملابس و أحذية";

  return "";
}

function getCategoryId(){
  return (UI.el.aCat?.value || "").toString().trim();
}

// ✅ NEW: safe seller name (for store/profile page)
function getSafeSellerName() {
  const u = auth.currentUser;
  if (!u) return "مستخدم";

  const dn = (u.displayName || "").trim();
  if (dn) return dn;

  const em = (u.email || "").trim();
  if (em && em.includes("@")) return em.split("@")[0];

  return "مستخدم";
}

/* =========================
   ✅ INIT
========================= */
export function initAddListing() {
  UI.actions.openAdd = openAdd;

  if (UI.el.btnAddBack) UI.el.btnAddBack.onclick = () => UI.hide(UI.el.addBox);

  if (UI.el.btnClear) UI.el.btnClear.onclick = clearForm;
  if (UI.el.aImages) UI.el.aImages.onchange = previewImages;
  if (UI.el.btnPublish) UI.el.btnPublish.onclick = publish;

  ensureDynamicFields();
  if (UI.el.aCat) {
    UI.el.aCat.addEventListener("change", () => {
      syncDynamicFieldsVisibility();
    });
    syncDynamicFieldsVisibility();
  }
}

/* =========================
   ✅ DYNAMIC FIELDS (DELUXE)
========================= */
function ensureDynamicFields(){
  const imagesEl = UI.el.aImages;
  if (!imagesEl) return;

  // إذا موجود لا تعيد
  if (document.getElementById("dynamicFieldsWrap")) return;

  const wrap = document.createElement("div");
  wrap.id = "dynamicFieldsWrap";
  wrap.className = "deluxeDyn";

  wrap.innerHTML = `
    <div class="muted small" style="margin:6px 2px 10px">
      معلومات إضافية حسب الصنف
    </div>

    <!-- ✅ سيارات -->
    <div id="carFields" class="hidden">
      <div class="formGrid">
        <div class="field">
          <label class="flabel">نوع الإعلان</label>
          <select id="aTypeCar">
            <option value="">اختر (بيع / إيجار)</option>
            <option value="sale">بيع</option>
            <option value="rent">إيجار</option>
          </select>
        </div>

        <div class="field">
          <label class="flabel">سنة الموديل</label>
          <input id="aCarYear" type="number" min="1950" max="2035" placeholder="مثال: 2006" />
        </div>

        <div class="field span2">
          <label class="flabel">موديل السيارة</label>
          <input id="aCarModel" placeholder="مثال: كيا ريو / هيونداي i10" />
        </div>
      </div>
    </div>

    <!-- ✅ عقارات -->
    <div id="estateFields" class="hidden">
      <div class="formGrid">
        <div class="field">
          <label class="flabel">نوع الإعلان</label>
          <select id="aTypeEstate">
            <option value="">اختر (بيع / إيجار)</option>
            <option value="sale">بيع</option>
            <option value="rent">إيجار</option>
          </select>
        </div>

        <div class="field">
          <label class="flabel">عدد الغرف (اختياري)</label>
          <input id="aRooms" type="number" min="0" max="20" placeholder="مثال: 3" />
        </div>

        <div class="field span2">
          <label class="flabel">نوع العقار</label>
          <select id="aEstateKind">
            <option value="">اختر نوع العقار</option>
            <option value="شقة">شقة</option>
            <option value="بيت">بيت</option>
            <option value="محل">محل</option>
            <option value="أرض">أرض</option>
          </select>
        </div>
      </div>
    </div>

    <!-- ✅ إلكترونيات -->
    <div id="electFields" class="hidden">
      <div class="formGrid">
        <div class="field span2">
          <label class="flabel">نوع الإلكترونيات (اختياري)</label>
          <select id="aElectKind">
            <option value="">اختر النوع</option>
            <option value="موبايل">موبايل</option>
            <option value="تلفزيون">تلفزيون</option>
            <option value="كمبيوتر">كمبيوتر</option>
            <option value="ألعاب">ألعاب (بلايستيشن)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- ✅ NEW: ملابس و أحذية (القسم إلزامي) -->
    <div id="fashionFields" class="hidden">
      <div class="formGrid">
        <div class="field span2">
          <label class="flabel">القسم (إجباري)</label>
          <select id="aFashionGender" required>
            <option value="">اختر القسم</option>
            <option value="رجالي">رجالي</option>
            <option value="نسائي">نسائي</option>
            <option value="ولادي">ولادي</option>
          </select>
        </div>
      </div>
    </div>
  `;

  const parent = imagesEl.parentElement;
  if (!parent) return;

  parent.insertBefore(wrap, imagesEl);

  // اربط عناصر UI.el الجديدة
  UI.el.aTypeCar = document.getElementById("aTypeCar");
  UI.el.aCarModel = document.getElementById("aCarModel");
  UI.el.aCarYear = document.getElementById("aCarYear");

  UI.el.aTypeEstate = document.getElementById("aTypeEstate");
  UI.el.aEstateKind = document.getElementById("aEstateKind");
  UI.el.aRooms = document.getElementById("aRooms");

  UI.el.aElectKind = document.getElementById("aElectKind");

  // ✅ NEW (إجباري للملابس)
  UI.el.aFashionGender = document.getElementById("aFashionGender");
}

function syncDynamicFieldsVisibility(){
  const catId = getCategoryId();

  const carBox = document.getElementById("carFields");
  const estBox = document.getElementById("estateFields");
  const eleBox = document.getElementById("electFields");
  const fashBox = document.getElementById("fashionFields");

  if (carBox) carBox.classList.toggle("hidden", catId !== "cars");
  if (estBox) estBox.classList.toggle("hidden", catId !== "realestate");
  if (eleBox) eleBox.classList.toggle("hidden", catId !== "electronics");

  const isFashion = (catId === "clothing");
  if (fashBox) fashBox.classList.toggle("hidden", !isFashion);
}

/* =========================
   ✅ OPEN/CLEAR
========================= */
function openAdd() {
  UI.resetOverlays();
  UI.show(UI.el.addBox);
  setStatus("");
  if (UI.el.imgPreview) UI.el.imgPreview.innerHTML = "";
  cleanupPreviewUrls();
  ensureDynamicFields();
  syncDynamicFieldsVisibility();
}

function clearForm() {
  if (UI.el.aTitle) UI.el.aTitle.value = "";
  if (UI.el.aDesc) UI.el.aDesc.value = "";
  if (UI.el.aPrice) UI.el.aPrice.value = "";
  if (UI.el.aCurrency) UI.el.aCurrency.value = "SYP";
  if (UI.el.aCity) UI.el.aCity.value = "";
  if (UI.el.aCat) UI.el.aCat.value = "";
  if (UI.el.aImages) UI.el.aImages.value = "";
  if (UI.el.imgPreview) UI.el.imgPreview.innerHTML = "";

  setStatus("");
  cleanupPreviewUrls();

  if (UI.el.aTypeCar) UI.el.aTypeCar.value = "";
  if (UI.el.aCarModel) UI.el.aCarModel.value = "";
  if (UI.el.aCarYear) UI.el.aCarYear.value = "";

  if (UI.el.aTypeEstate) UI.el.aTypeEstate.value = "";
  if (UI.el.aEstateKind) UI.el.aEstateKind.value = "";
  if (UI.el.aRooms) UI.el.aRooms.value = "";

  if (UI.el.aElectKind) UI.el.aElectKind.value = "";

  // ✅ NEW
  if (UI.el.aFashionGender) UI.el.aFashionGender.value = "";

  syncDynamicFieldsVisibility();
}

function setStatus(msg = "") {
  if (UI.el.uploadStatus) UI.el.uploadStatus.textContent = msg;
}

/* =========================
   ✅ IMAGES PREVIEW
========================= */
function cleanupPreviewUrls(){
  try { previewUrls.forEach(u => URL.revokeObjectURL(u)); } catch {}
  previewUrls = [];
}

function previewImages() {
  cleanupPreviewUrls();

  const filesAll = Array.from(UI.el.aImages?.files || []);
  const files = filesAll.slice(0, MAX_IMAGES);

  if (UI.el.imgPreview) UI.el.imgPreview.innerHTML = "";

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

/* =========================
   ✅ EXTRA FIELDS + VALIDATION
========================= */
function collectExtraFields(catId){
  if (catId === "cars") {
    const typeId = (UI.el.aTypeCar?.value || "").trim();
    const carModel = (UI.el.aCarModel?.value || "").trim();
    const y = Number(UI.el.aCarYear?.value || 0);
    const carYear = (y >= 1950 && y <= 2035) ? y : null;

    return {
      typeId,
      carModel,
      carYear,
      car: { typeId, model: carModel, year: carYear }
    };
  }

  if (catId === "realestate") {
    const typeId = (UI.el.aTypeEstate?.value || "").trim();
    const estateKind = (UI.el.aEstateKind?.value || "").trim();
    const r = Number(UI.el.aRooms?.value || 0);
    const rooms = (r >= 0 && r <= 20) ? r : null;

    return {
      typeId,
      estateKind,
      rooms,
      estate: { typeId, kind: estateKind, rooms }
    };
  }

  if (catId === "electronics") {
    const kind = (UI.el.aElectKind?.value || "").trim();
    return { electronics: { kind }, electKind: kind };
  }

  // ✅ NEW: ملابس و أحذية (القسم إلزامي) -> نخزنها باسم gender للفلترة
  if (catId === "clothing") {
    const gender = (UI.el.aFashionGender?.value || "").trim();
    return {
      gender,
      fashion: { gender }
    };
  }

  return {};
}

function validateForm({ title, description, price, city, catId, files, extra }) {
  if (!title) return "اكتب عنوان الإعلان";
  if (title.length < 3) return "العنوان قصير جداً";
  if (!description) return "اكتب وصف الإعلان";
  if (description.length < 10) return "الوصف قصير جداً";
  if (!price || Number.isNaN(price) || price <= 0) return "اكتب سعر صحيح";
  if (!city) return "اختر المدينة";
  if (!catId) return "اختر الصنف";
  if (!files.length) return `اختر صورة واحدة على الأقل (حد أقصى ${MAX_IMAGES})`;

  if (catId === "cars") {
    if (!extra.typeId) return "اختر (بيع/إيجار) للسيارة";
    if (!extra.carModel) return "اكتب موديل السيارة";
    if (!extra.carYear) return "اكتب سنة الموديل";
  }

  if (catId === "realestate") {
    if (!extra.typeId) return "اختر (بيع/إيجار) للعقار";
    if (!extra.estateKind) return "اختر نوع العقار";
  }

  // ✅ NEW (إجباري فعلياً)
  if (catId === "clothing") {
    if (!extra.gender) return "اختر القسم (رجالي / نسائي / ولادي)";
  }

  return null;
}

/* =========================
   ✅ PUBLISH
========================= */
async function publish() {
  try { requireAuth(); } catch { return; }
  if (publishing) return;

  const title = (UI.el.aTitle?.value || "").trim();
  const description = (UI.el.aDesc?.value || "").trim();
  const price = Number(UI.el.aPrice?.value || 0);
  const currency = (UI.el.aCurrency?.value || "SYP").trim();
  const city = (UI.el.aCity?.value || "").trim();

  const categoryId = getCategoryId();
  const categoryNameAr = catToAr(categoryId);

  const extra = collectExtraFields(categoryId);
  const files = Array.from(UI.el.aImages?.files || []).slice(0, MAX_IMAGES);

  const err = validateForm({ title, description, price, city, catId: categoryId, files, extra });
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

    const sellerName = getSafeSellerName();
    const sellerEmail = (auth.currentUser?.email || "").trim() || null;

    await addDoc(collection(db, "listings"), {
      title,
      description,
      price,
      currency,
      city,

      categoryId,
      categoryNameAr,
      category: categoryNameAr || categoryId,

      ...extra,

      images: urls,

      sellerName,
      sellerEmail,
      uid: auth.currentUser.uid,

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
    console.error("publish error:", e);
  } finally {
    publishing = false;
    UI.el.btnPublish.disabled = false;
    UI.el.btnClear.disabled = false;
    setTimeout(() => setStatus(""), 1500);
  }
}

/* =========================
   ✅ RELOAD HELPERS
========================= */
async function reloadListingsWithRetry() {
  const delays = [150, 600, 1200];
  for (let i = 0; i < delays.length; i++) {
    try { await UI.actions.loadListings(true); return; }
    catch { await wait(delays[i]); }
  }
  try { await UI.actions.loadListings(true); } catch {}
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* =========================
   ✅ CLOUDINARY UPLOAD (with timeout)
========================= */
async function uploadToCloudinary(file) {
  const { cloudName, uploadPreset, folder } = CLOUDINARY;
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", uploadPreset);
  fd.append("folder", folder);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 35000);

  let res, data;
  try {
    res = await fetch(url, { method: "POST", body: fd, signal: controller.signal });
    data = await res.json();
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("انقطع رفع الصورة (Timeout). جرّب صورة أصغر أو شبكة أفضل.");
    }
    throw new Error("فشل الاتصال لرفع الصور. جرّب مرة ثانية.");
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) throw new Error(data?.error?.message || "Cloudinary upload failed");
  return data.secure_url;
}