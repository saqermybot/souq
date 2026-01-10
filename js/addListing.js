
// =========================
// Guest phone input (intl-tel-input)
// =========================
let phoneIti = null;
let syncPhoneNow = null;
function initPhoneInput(){
  const el = document.getElementById("aPhone");
  const out = document.getElementById("aPhoneE164");
  if(!el || !out) return;
  if(!window.intlTelInput) return;

  // ✅ Inline validation hint (creates a small line under the input)
  let hint = document.getElementById("aPhoneHint");
  if(!hint){
    hint = document.createElement("div");
    hint.id = "aPhoneHint";
    hint.className = "muted small";
    hint.style.marginTop = "6px";
    hint.style.direction = "rtl";
    // insert right after the hidden e164 input if possible, else after phone input
    try {
      out.insertAdjacentElement("afterend", hint);
    } catch {
      el.insertAdjacentElement("afterend", hint);
    }
  }

  if(phoneIti) return; // already
  phoneIti = window.intlTelInput(el, {
    separateDialCode: true,
    nationalMode: true,
    preferredCountries: ["sy","nl","tr","lb","jo","de","sa","ae","iq","eg"],
    // ✅ يقترح بلد المستخدم تلقائياً (مثل المواقع الكبيرة)
    initialCountry: "auto",
    geoIpLookup: (callback) => {
      // ipapi.co خفيف وبسيط — مع fallback لسوريا إذا فشل
      fetch("https://ipapi.co/json/")
        .then(r => r.json())
        .then(d => callback(((d && d.country_code) ? d.country_code : "SY").toLowerCase()))
        .catch(() => callback("sy"));
    },
    // ✅ ensures validation works even if utils.js loads a bit later
    utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@23.8.0/build/js/utils.js"
  });

  const sync = () => {
    const raw = (el.value || "").trim();
    // empty is OK (whatsapp optional)
    if(!raw){
      out.value = "";
      el.dataset.valid = "0";
      el.classList.remove("ok","bad");
      hint.textContent = "";
      return;
    }

    // Try strict validation first
    try {
      const ok = phoneIti.isValidNumber();
      out.value = ok ? phoneIti.getNumber() : phoneIti.getNumber();
      el.dataset.valid = ok ? "1" : "0";
      el.classList.toggle("ok", ok);
      el.classList.toggle("bad", !ok);
      hint.textContent = ok ? "✅ رقم صحيح" : "❌ رقم غير صحيح";
      return;
    } catch (e) {
      // utils may not be ready on some mobiles; fallback to a simple sanity check
      let e164 = "";
      try { e164 = (phoneIti.getNumber() || "").trim(); } catch {}
      const digits = (e164 || raw).replace(/\D/g, "");
      const okLoose = digits.length >= 8;
      out.value = okLoose && e164 ? e164 : "";
      el.dataset.valid = okLoose && e164 ? "1" : "0";
      el.classList.toggle("ok", okLoose);
      el.classList.toggle("bad", !okLoose);
      hint.textContent = okLoose ? "✅ يبدو رقم صحيح" : "❌ رقم غير صحيح";
    }
  };

  // expose for publish button (حتى لو المستخدم ما عمل blur)
  syncPhoneNow = sync;

  el.addEventListener("blur", sync);
  el.addEventListener("change", sync);
  el.addEventListener("input", () => { if((el.value||"").length >= 3) sync(); });

  // run once
  setTimeout(sync, 50);
}


// addListing.js (Deluxe UI + dynamic fields + organized saving)

import { db, auth } from "./firebase.js";
import { CLOUDINARY, MAX_IMAGES } from "./config.js";
import { UI } from "./ui.js";
import { ensureUser } from "./auth.js";
import { fileToResizedJpeg } from "./utils.js";
import { getGuestId } from "./guest.js";

import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  setDoc
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

      // ✅ UX: after changing category, scroll to the extra fields area
      requestAnimationFrame(() => {
        const anchor = document.getElementById("dynamicFieldsWrap") || UI.el.aCat;
        if (anchor && typeof anchor.scrollIntoView === "function") {
          anchor.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
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
<!-- ✅ سيارات -->
    <div id="carFields" class="hidden">
      <div class="formGrid">

	        <!-- ✅ سطر واحد: (بيع/إيجار) + السنة -->
	        <div class="inlineRow">
	          <div class="field select-wrapper">
	            <select id="aTypeCar">
	              <option value="">بيع / إيجار</option>
	              <option value="sale">بيع</option>
	              <option value="rent">إيجار</option>
	            </select>
	            <span class="arrow">›</span>
	          </div>
	          <div class="field">
	            <div class="select-wrapper">
	              <select id="aCarYear">
	                <option value="">السنة</option>
	              </select>
	              <span class="arrow">›</span>
	            </div>
	          </div>
	        </div>

        <div class="field span2">
<input id="aCarModel" placeholder="مثال: كيا ريو / هيونداي i10" />
        </div>
      </div>
    </div>

    <!-- ✅ عقارات -->
    <div id="estateFields" class="hidden">
      <div class="formGrid">

        <!-- ✅ سطر واحد: نوع الإعلان + عدد الغرف -->
        <div class="inlineRow span2">
          <div class="field select-wrapper">
            <select id="aTypeEstate">
            <option value="">نوع الإعلان (بيع / إيجار)</option>
            <option value="sale">بيع</option>
            <option value="rent">إيجار</option>
          </select>
            <span class="arrow">›</span>
          </div>
          <div class="field">
            <div class="select-wrapper">
	              <select id="aRooms">
	                <option value="">غرف</option>
	              </select>
	              <span class="arrow">›</span>
	            </div>
          </div>
        </div>

        <div class="field span2">
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

  const anchor = document.getElementById("dynWrapAnchor");
  const parent = anchor.parentElement;
  if (!parent) return;

  if (anchor) parent.insertBefore(wrap, anchor);
  else parent.appendChild(wrap);

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

  // ✅ UX: always start at top when opening Add Listing
  requestAnimationFrame(() => {
    const inner = document.querySelector("#addBox .pageInner");
    if (inner) inner.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function clearForm() {
  if (UI.el.aTitle) UI.el.aTitle.value = "";
  if (UI.el.aDesc) UI.el.aDesc.value = "";
  if (UI.el.aPrice) UI.el.aPrice.value = "";
  if (UI.el.aCurrency) UI.el.aCurrency.value = "SYP";
  const placeEl = document.getElementById("aPlaceText");
  if (placeEl) placeEl.value = "";
  // ✅ clear city/area visible controls
  if (UI.el.aCity) UI.el.aCity.value = "";
  const areaEl = document.getElementById("aArea");
  if (areaEl) areaEl.value = "";
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

function validateForm({ title, description, price, city, placeText, catId, files, extra }) {
  if (!title) return "اكتب عنوان الإعلان";
  if (title.length < 3) return "العنوان قصير جداً";
  if (!description) return "اكتب وصف الإعلان";
  if (description.length < 10) return "الوصف قصير جداً";
  if (!price || Number.isNaN(price) || price <= 0) return "اكتب سعر صحيح";
  // ✅ المدينة (إجباري)
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
  await ensureUser();
  if (publishing) return;

  const title = (UI.el.aTitle?.value || "").trim();
  const description = (UI.el.aDesc?.value || "").trim();
  const price = Number(UI.el.aPrice?.value || 0);
  const currency = (UI.el.aCurrency?.value || "SYP").trim();
  // ✅ الموقع: مدينة (إجباري) + منطقة/شارع (اختياري)
  const city = (UI.el.aCity?.value || "").trim();
  const area = (document.getElementById("aArea")?.value || "").trim();
  const placeText = (city ? (area ? `${city} - ${area}` : city) : "").trim();
  const placeHidden = document.getElementById("aPlaceText");
  if (placeHidden) placeHidden.value = placeText;

  const categoryId = getCategoryId();
  const categoryNameAr = catToAr(categoryId);

  const extra = collectExtraFields(categoryId);
  const files = Array.from(UI.el.aImages?.files || []).slice(0, MAX_IMAGES);

  const err = validateForm({ title, description, price, city, placeText, catId: categoryId, files, extra });
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

    const guestId = getGuestId();
    const sellerName = auth.currentUser?.isAnonymous ? "زائر" : getSafeSellerName();
    const sellerEmail = auth.currentUser?.isAnonymous ? null : ((auth.currentUser?.email || "").trim() || null);

    
    // ✅ تأكد من مزامنة رقم الهاتف قبل التحقق (حتى لو المستخدم ضغط نشر بدون blur)
    try { if (typeof syncPhoneNow === "function") syncPhoneNow(); } catch {}

    // ✅ WhatsApp/Phone is OPTIONAL الآن (لأن الشات شغال)
    // إذا المستخدم كتب رقم: لازم يكون صحيح، غير هيك نخليه فاضي.
    const phoneE164 = (document.getElementById("aPhoneE164")?.value || "").trim();
    const phoneRaw = (document.getElementById("aPhone")?.value || "").trim();
    const phoneValid = document.getElementById("aPhone")?.dataset?.valid === "1";

    let finalPhone = null;
    if (phoneRaw) {
      if (!phoneValid || !phoneE164) {
        alert("رقم الهاتف غير صحيح. اختر بلدك ثم اكتب رقم صحيح، أو اتركه فارغاً واستخدم الشات.");
        return;
      }
      finalPhone = phoneE164;

      // ✅ خزّن رقم الهاتف على حساب الزائر/المستخدم (حتى لو Anonymous) فقط إذا موجود
      try {
        const uref = doc(db, "users", auth.currentUser.uid);
        await setDoc(uref, {
          displayName: sellerName,
          phone: finalPhone,
          whatsapp: finalPhone,
          updatedAt: serverTimestamp(),
          isAnonymous: !!auth.currentUser.isAnonymous
        }, { merge: true });
      } catch (e) {
        console.warn("Failed to save user phone", e);
      }
    }
    // 📍 الموقع النصّي (بدون خريطة)
    const city = (placeText.split(/[-–—,،]/)[0] || "").trim();

    await addDoc(collection(db, "listings"), {
      title,
      description,
      price,
      currency,
      city: city || null,
      placeText: placeText,

      categoryId,
      categoryNameAr,
      category: categoryNameAr || categoryId,

      ...extra,

      images: urls,

      // ✅ optional contact (keep keys to avoid any edge-case rule stripping)
      contact: { phone: finalPhone || null, whatsapp: finalPhone || null },


      sellerName,
      sellerEmail,
      uid: auth.currentUser.uid,

      ownerType: auth.currentUser.isAnonymous ? "anon" : "auth",
      ownerId: auth.currentUser.uid,
      guestId: auth.currentUser.isAnonymous ? guestId : null,

      isActive: true,
      createdAt: serverTimestamp(),
      expiresAt
    });

    setStatus("تم نشر الإعلان ✅");

    clearForm();
    UI.hide(UI.el.addBox);

    await reloadListingsWithRetry();

  } catch (e) {
    // friendlier errors for users
    const msgRaw = (e && (e.message || e.code)) ? String(e.message || e.code) : "";
    const isPerm = msgRaw.toLowerCase().includes("permission") || String(e?.code||"").includes("permission-denied");
    if (isPerm) {
      alert("فشل النشر بسبب صلاحيات (Permissions).\n\nإذا أنت زائر: جرّب تحديث الصفحة ثم أعد المحاولة.\nوإذا استمرت المشكلة: أخبر الإدارة.");
    } else {
      alert(e?.message || "فشل النشر");
    }
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhoneInput);
} else {
  initPhoneInput();
}
