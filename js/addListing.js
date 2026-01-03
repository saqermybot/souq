import { db, auth } from "./firebase.js";
import { CLOUDINARY, MAX_IMAGES } from "./config.js";
import { UI } from "./ui.js";
import { requireAuth } from "./auth.js";
import { fileToResizedJpeg } from "./utils.js";

import {
  addDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function initAddListing(){
  UI.el.btnClear.onclick = clearForm;
  UI.el.aImages.onchange = previewImages;
  UI.el.btnPublish.onclick = publish;
}

function clearForm(){
  UI.el.aTitle.value="";
  UI.el.aDesc.value="";
  UI.el.aPrice.value="";
  UI.el.aCity.value="";
  UI.el.aCat.value="";
  UI.el.aImages.value="";
  UI.el.imgPreview.innerHTML="";
  UI.el.uploadStatus.textContent="";
}

function previewImages(){
  const filesAll = Array.from(UI.el.aImages.files || []);
  const files = filesAll.slice(0, MAX_IMAGES);

  UI.el.imgPreview.innerHTML = "";
  files.forEach(f=>{
    const img = document.createElement("img");
    img.className="pimg";
    img.src = URL.createObjectURL(f);
    UI.el.imgPreview.appendChild(img);
  });

  if (filesAll.length > MAX_IMAGES){
    UI.el.uploadStatus.textContent = `تم اختيار أول ${MAX_IMAGES} صور فقط.`;
  } else {
    UI.el.uploadStatus.textContent = "";
  }
}

async function publish(){
  try{ requireAuth(); }catch{ return; }

  const title = UI.el.aTitle.value.trim();
  const description = UI.el.aDesc.value.trim();
  const price = Number(UI.el.aPrice.value);
  const currency = UI.el.aCurrency.value;
  const city = UI.el.aCity.value;
  const category = UI.el.aCat.value;

  let files = Array.from(UI.el.aImages.files || []).slice(0, MAX_IMAGES);

  if (!title || !description || !price || !city || !category){
    return alert("كمّل كل الحقول");
  }
  if (files.length < 1){
    return alert("اختر صورة واحدة على الأقل (حد أقصى 3)");
  }

  UI.el.btnPublish.disabled = true;
  UI.el.uploadStatus.textContent = "جاري رفع الصور...";

  try{
    const images = [];
    for (let i=0;i<files.length;i++){
      UI.el.uploadStatus.textContent = `رفع صورة ${i+1}/${files.length} ...`;
      const resized = await fileToResizedJpeg(files[i], 1280, 0.82);
      const uploaded = await uploadToCloudinary(resized);
      images.push(uploaded.secure_url); // نخليها string بسيط الآن
    }

    UI.el.uploadStatus.textContent = "جاري نشر الإعلان...";

    await addDoc(collection(db,"listings"), {
      title,
      description,
      price,
      currency,
      city,
      category,
      images,
      ownerId: auth.currentUser.uid,
      isActive: true,
      createdAt: serverTimestamp()
    });

    UI.el.uploadStatus.textContent = "تم نشر الإعلان ✅";
    clearForm();
    UI.hide(UI.el.addBox);

    // أعد تحميل بعد لحظة لحتى createdAt يوصل
    setTimeout(() => UI.actions.loadListings(true), 800);

  }catch(e){
    alert(e?.message || "فشل النشر");
  }finally{
    UI.el.btnPublish.disabled = false;
  }
}

async function uploadToCloudinary(file){
  const { cloudName, uploadPreset, folder } = CLOUDINARY;
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", uploadPreset);
  fd.append("folder", folder);

  const res = await fetch(url, { method:"POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Cloudinary upload failed");
  return data;
}