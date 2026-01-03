import { db, auth } from "./firebase.js";
import { CLOUDINARY } from "./config.js";
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
  const files = Array.from(UI.el.aImages.files || []);

  // ✅ حد أقصى 3 صور
  const limited = files.slice(0, 3);

  UI.el.imgPreview.innerHTML = "";
  limited.forEach(f=>{
    const img = document.createElement("img");
    img.className="pimg";
    img.src = URL.createObjectURL(f);
    UI.el.imgPreview.appendChild(img);
  });

  // (اختياري) إذا اختار أكتر من 3، خبرّه
  if (files.length > 3) {
    UI.el.uploadStatus.textContent = "تم اختيار أول 3 صور فقط.";
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

  let files = Array.from(UI.el.aImages.files || []);
  files = files.slice(0, 3); // ✅ حد أقصى 3

  if (!title || !description || !price || !city || !category){
    return alert("كمّل كل الحقول");
  }

  if (files.length < 1){
    return alert("اختر صورة واحدة على الأقل");
  }

  UI.el.btnPublish.disabled = true;
  UI.el.uploadStatus.textContent = "جاري رفع الصور...";

  try{
    const images = [];

    for (let i=0;i<files.length;i++){
      UI.el.uploadStatus.textContent = `رفع صورة ${i+1}/${files.length} ...`;
      const resized = await fileToResizedJpeg(files[i], 1280, 0.82);
      const uploaded = await uploadToCloudinary(resized);
      images.push({
        url: uploaded.secure_url,
        publicId: uploaded.public_id
      });
    }

    UI.el.uploadStatus.textContent = "جاري نشر الإعلان...";

    await addDoc(collection(db,"listings"), {
      title,
      description,
      price,
      currency,
      city,
      category,
      images,               // ✅ صار Array of objects
      ownerId: auth.currentUser.uid,
      isActive: true,
      createdAt: serverTimestamp()
    });

    UI.el.uploadStatus.textContent = "تم نشر الإعلان ✅";
    clearForm();
    UI.hide(UI.el.addBox);
    await UI.actions.loadListings(true);

  }catch(e){
    alert(e?.message || "فشل النشر");
  }finally{
    UI.el.btnPublish.disabled = false;
  }
}

async function uploadToCloudinary(file){
  const cloudName = CLOUDINARY.cloudName;
  const uploadPreset = CLOUDINARY.uploadPreset;
  const folder = CLOUDINARY.folder;

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", uploadPreset);
  fd.append("folder", folder);

  const res = await fetch(url, { method:"POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Cloudinary upload failed");

  // ✅ يرجع {secure_url, public_id, ...}
  return data;
}