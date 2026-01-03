const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ✅ لما ينحذف listing -> احذف الصور من Cloudinary
exports.onListingDeleted = onDocumentDeleted("listings/{id}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  // نحن رح نخزن الصور بهالشكل:
  // images: [{ url, publicId }]
  const images = Array.isArray(data.images) ? data.images : [];
  const publicIds = images
    .map(x => x && (x.publicId || x.public_id))
    .filter(Boolean);

  if (!publicIds.length) return;

  // حذف الصور (واحدة واحدة أو بالتوازي)
  const results = await Promise.allSettled(
    publicIds.map(pid => cloudinary.uploader.destroy(pid, { invalidate: true }))
  );

  // ما بدنا نفشل الحذف إذا صورة وحدة فشلت — بس نسجل
  const failed = results.filter(r => r.status === "rejected");
  if (failed.length) {
    console.warn("Some Cloudinary deletes failed:", failed.map(f => f.reason?.message || f.reason));
  }
});