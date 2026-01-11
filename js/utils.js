export const escapeHtml = (s="") => String(s).replace(/[&<>"']/g, m => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[m]));

export function debounce(fn, ms=250){
  let t=null;
  return (...args)=>{
    clearTimeout(t);
    t=setTimeout(()=>fn(...args), ms);
  };
}

export async function fileToResizedJpeg(file, maxSide=1280, quality=0.82){
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

export function formatPrice(price, currency){
  if (price == null || price === "" || Number.isNaN(Number(price))) return "";
  const n = Number(price);

  // Format with thousands separators (Arabic/Syria locale works well for Arabic UI)
  const formatted = new Intl.NumberFormat("ar-SY").format(n);

  const c = (currency || "SYP").toString().trim().toUpperCase();

  // Common symbols
  if (c === "SYP" || c === "SYR" || c === "SP" || c === "S.P") return `${formatted} ل.س`;
  if (c === "USD" || c === "$") return `${formatted} $`;
  if (c === "EUR" || c === "€") return `${formatted} €`;

  return `${formatted} ${c}`.trim();
}