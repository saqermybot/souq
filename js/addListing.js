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

// ✅ لنظافة الذاكرة (object URLs)
let previewUrls = [];

/* =========================
   ✅ Helpers للسيارات
========================= */

function isCarsCategory(categoryValue = "") {
  const v = String(categoryValue || "").trim().toLowerCase();
  return v === "سيارات" || v === "cars";
}

function getElMaybe(id) {
  return document.getElementById(id);
}

function getCarFields() {
  // IDs المقترحة (غير إجبارية)
  const aType = getElMaybe("aType");
  const aCarModel = getElMaybe("aCarModel");
  const aCarYear = getElMaybe("aCarYear");

  return {
    typeId: aType ? String(aType.value || "").trim() : "",
    model: aCarModel ? String(aCarModel.value || "").trim() : "",
    year: aCarYear ? String(aCarYear.value || "").trim() : ""
  };
}

function clearCarFields() {
  const aType = getElMaybe("aType");
  const aCarModel = getElMaybe("aCarModel");
  const aCarYear = getElMaybe("aCarYear");

  if (aType) aType.value = "";
  if (aCarModel) aCarModel.value = "";
  if (aCarYear) aCarYear.value = "";
}

function validateCarFields({ typeId, model, year }) {
  // إذا ما في عناصر بالصفحة، ما نعمل فشل
  // (يعني لسه ما ركبت الـ UI تبع السيارات)
  const aType = getElMaybe("aType");
  const aCarModel = getElMaybe("aCarModel");
  const aCarYear = getElMaybe("aCarYear");
  const hasCarUI = !!(aType || aCarModel || aCarYear);
  if (!hasCarUI) return null;

  if (!typeId) return "اختر نوع الإعلان (بيع أو إيجار)";
  if (typeId !== "sale" && typeId !== "rent") return "نوع الإعلان غير صحيح";

  if (!model) return "اكتب موديل السيارة";
  if (model.length < 2) return "موديل السيارة قصير جداً";

  if (!year) return "اكتب سنة السيارة";
  const y = Number(year);
  const nowY = new Date().getFullYear();
  if (Number.isNaN(y) || y < 1970 || y > nowY + 1) return "سنة السيارة غير صحيحة";

  return null;
}

/* ========================= */

export function initAddListing() {
  // ✅ أهم شي: ربط زر "+ إعلان جديد" بفتح صفحة الإضافة
  UI.actions.openAdd = openAdd;

  // زر رجوع
  if (UI.el.btnAddBack) UI.el.btnAddBack.onclick = () => UI.hide(UI.el.addBox);

  UI.el.btnClear.onclick = clearForm;
  UI.el.aImages.onchange = previewImages;
  UI.el.btnPublish.onclick = publish;
}

function openAdd() {
  UI.resetOverlays();
  UI.show(UI.el.addBox);
  setStatus("");
  UI.el.imgPreview.innerHTML = "";
  cleanupPreviewUrls();
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

  // ✅ سيارات
  clearCarFields();

  setStatus("");
  cleanupPreviewUrls();
}

function setStatus(msg = "") {
  if (UI.el.uploadStatus) UI.el.uploadStatus.textContent = msg;
}

function cleanupPreviewUrls(){
  try{
    previewUrls.forEach(u => URL.revokeObjectURL(u));
  }catch{}
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

function validateForm({ title, description, price, city, category, files }) {
  if (!title) return "اكتب عنوان الإعلان";
  if (title.length < 3) return "العنوان قصير جداً";
  if (!description) return "اكتب وصف الإعلان";
  if (description.length < 10) return "الوصف قصير جداً";
  if (!price || Number.isNaN(price) || price <= 0) return "اكتب سعر صحيح";
  if (!city) return "اختر المدينة";
  if (!category) return "اختر الصنف";
  if (!files.length) return `اختر صورة واحدة على الأقل (حد أقصى ${MAX_IMAGES})`;
  return null;
}

async function publish() {
  try {
    requireAuth();
  } catch {
    return;
  }

  if (publishing) return;

  const title = UI.el.aTitle.value.trim();
  const description = UI.el.aDesc.value.trim();
  const price = Number(UI.el.aPrice.value);
  const currency = UI.el.aCurrency.value;
  const city = UI.el.aCity.value;
  const category = UI.el.aCat.value;

  const files = Array.from(UI.el.aImages.files || []).slice(0, MAX_IMAGES);

  const err = validateForm({ title, description, price, city, category, files });
  if (err) return alert(err);

  // ✅ سيارات: تحقق إضافي
  const isCars = isCarsCategory(category);
  const car = getCarFields();
  if (isCars) {
    const carErr = validateCarFields(car);
    if (carErr) return alert(carErr);
  }

  publishing = true;
  UI.el.btnPublish.disabled = true;
  UI.el.btnClear.disabled = true;
  setStatus("جاري تجهيز الصور...");

  try {
    // ✅ رفع صور
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      setStatus(`رفع صورة ${i + 1}/${files.length} ...`);
      const resized = await fileToResizedJpeg(files[i], 1280, 0.82);
      const secureUrl = await uploadToCloudinary(resized);
      urls.push(secureUrl);
    }

    setStatus("جاري نشر الإعلان...");

    // ✅ انتهاء الصلاحية: 15 يوم من الآن (مبدئياً)
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    // ✅ payload
    const payload = {
      title,
      description,
      price,
      currency,
      city,
      category,
      images: urls,
      ownerId: auth.currentUser.uid,
      isActive: true,
      createdAt: serverTimestamp(),
      expiresAt
    };

    // ✅ إضافة بيانات السيارات (فقط إذا الصنف سيارات)
    if (isCars) {
      payload.typeId = car.typeId; // sale / rent
      payload.car = {
        model: car.model,
        year: Number(car.year)
      };
    }

    await addDoc(collection(db, "listings"), payload);

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

async function reloadListingsWithRetry() {
  const delays = [150, 600, 1200];
  for (let i = 0; i < delays.length; i++) {
    try {
      await UI.actions.loadListings(true);
      return;
    } catch {
      await wait(delays[i]);
    }
  }
  try { await UI.actions.loadListings(true); } catch {}
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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