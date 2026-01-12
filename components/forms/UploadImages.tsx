"use client";

import { useState } from "react";
import { cloudinarySign } from "@/lib/api/functions";

type Uploaded = { fileName: string; secureUrl: string };

export default function UploadImages({
  listingId,
  onUploaded,
  lang,
}: {
  listingId: string;
  onUploaded: (images: Uploaded[]) => void;
  lang: "ar" | "en";
}) {
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<Uploaded[]>([]);

  const uploadOne = async (file: File) => {
    const sign = await cloudinarySign({
      folder: "souq-syria/listings",
      public_id: `${listingId}/${crypto.randomUUID()}`,
      tags: ["listing", listingId],
    });

    const fd = new FormData();
    fd.append("file", file);
    fd.append("api_key", sign.api_key);
    fd.append("timestamp", String(sign.timestamp));
    fd.append("signature", sign.signature);
    fd.append("folder", sign.folder);
    if (sign.public_id) fd.append("public_id", sign.public_id);
    if (sign.tags?.length) fd.append("tags", sign.tags.join(","));

    const upRes = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloud_name}/image/upload`, {
      method: "POST",
      body: fd,
    });
    const up = await upRes.json();
    if (!upRes.ok) throw new Error(up?.error?.message || "Cloudinary upload failed");

    return { fileName: file.name, secureUrl: up.secure_url as string };
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    setBusy(true);
    try {
      const results: Uploaded[] = [];
      for (const f of files) results.push(await uploadOne(f));
      const next = [...uploaded, ...results];
      setUploaded(next);
      onUploaded(next);
    } catch (err: any) {
      alert(err?.message || (lang === "ar" ? "فشل رفع الصور" : "Upload failed"));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <div className="bg-white border rounded-lg p-3 space-y-3">
      <div className="font-semibold">{lang === "ar" ? "الصور" : "Images"}</div>

      <input type="file" accept="image/*" multiple disabled={busy} onChange={onPick} className="block w-full text-sm" />
      {busy && <div className="text-sm text-gray-500">{lang === "ar" ? "جاري رفع الصور..." : "Uploading..."}</div>}

      {uploaded.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {uploaded.map((u) => (
            <div key={u.secureUrl} className="aspect-square bg-gray-100 rounded overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.secureUrl} alt={u.fileName} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
