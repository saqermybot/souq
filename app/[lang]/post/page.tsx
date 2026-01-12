"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@/lib/i18n/lang";
import { useParams, useRouter } from "next/navigation";
import { ensureGuest } from "@/lib/session/guest";
import { getCategoryFields, getRootCategories } from "@/lib/api/postAd";
import DynamicFields from "@/components/forms/DynamicFields";
import UploadImages from "@/components/forms/UploadImages";
import { addListingImage, createListing } from "@/lib/api/functions";

export default function PostAdPage() {
  const params = useParams<{ lang: Lang }>();
  const lang = params.lang;
  const router = useRouter();

  const [categories, setCategories] = useState<any[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [fields, setFields] = useState<any[]>([]);
  const [attributes, setAttributes] = useState<Record<string, any>>({});

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [price, setPrice] = useState<string>("");
  const [currency, setCurrency] = useState("SYP");
  const [condition, setCondition] = useState<"new" | "used">("used");
  const [phonePublic, setPhonePublic] = useState("");

  const [listingId, setListingId] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<{ fileName: string; secureUrl: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => setCategories(await getRootCategories()))().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      if (!categoryId) return;
      setFields(await getCategoryFields(categoryId));
      setAttributes({});
    })().catch(() => {});
  }, [categoryId]);

  const categoryOptions = useMemo(() => categories ?? [], [categories]);

  const validate = () => {
    if (!categoryId) return lang === "ar" ? "اختر القسم" : "Select category";
    if (!title.trim()) return lang === "ar" ? "اكتب عنوان الإعلان" : "Enter title";
    if (!description.trim()) return lang === "ar" ? "اكتب الوصف" : "Enter description";
    if (!city.trim()) return lang === "ar" ? "اكتب المدينة" : "Enter city";

    for (const f of fields) {
      if (!f.required) continue;
      const v = attributes[f.key];
      if (v === undefined || v === null || v === "") {
        return (lang === "ar" ? "حقل مطلوب: " : "Required: ") + (lang === "ar" ? f.label_ar : f.label_en);
      }
    }
    return null;
  };

  const onCreate = async () => {
    const err = validate();
    if (err) return alert(err);

    setBusy(true);
    try {
      const guest = await ensureGuest();
      const res = await createListing({
        guest,
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId!,
        price: price.trim() === "" ? null : Number(price),
        currency,
        city: city.trim(),
        condition,
        phone_public: phonePublic.trim() ? phonePublic.trim() : null,
        attributes,
      });

      setListingId(res.listing_id);
      alert(lang === "ar" ? "تم إنشاء الإعلان. الآن ارفع الصور ثم احفظها." : "Listing created. Upload images now.");
    } catch (e: any) {
      alert(e?.message || (lang === "ar" ? "فشل إنشاء الإعلان" : "Failed to create listing"));
    } finally {
      setBusy(false);
    }
  };

  const onSaveImagesToDb = async () => {
    if (!listingId) return;
    if (!uploadedImages.length) return alert(lang === "ar" ? "ارفع صور أولاً" : "Upload images first");

    setBusy(true);
    try {
      const guest = await ensureGuest();
      for (let i = 0; i < uploadedImages.length; i++) {
        await addListingImage({
          guest,
          listing_id: listingId,
          url: uploadedImages[i].secureUrl,
          sort_order: i,
        });
      }
      router.push(`/${lang}/listing/${listingId}`);
    } catch (e: any) {
      alert(e?.message || (lang === "ar" ? "فشل حفظ الصور" : "Failed to save images"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{lang === "ar" ? "إضافة إعلان" : "Post an ad"}</h1>

      <div className="bg-white border rounded-lg p-3 space-y-2">
        <div className="font-semibold">{lang === "ar" ? "القسم" : "Category"}</div>
        <select
          className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
          disabled={busy}
        >
          <option value="">{lang === "ar" ? "اختر القسم..." : "Select category..."}</option>
          {categoryOptions.map((c: any) => (
            <option key={c.id} value={c.id}>
              {lang === "ar" ? c.name_ar : c.name_en}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border rounded-lg p-3 space-y-3">
        <div className="font-semibold">{lang === "ar" ? "معلومات الإعلان" : "Listing info"}</div>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">{lang === "ar" ? "العنوان" : "Title"} *</label>
          <input className="w-full border rounded-md px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">{lang === "ar" ? "الوصف" : "Description"} *</label>
          <textarea className="w-full border rounded-md px-3 py-2 text-sm min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm text-gray-700">{lang === "ar" ? "المدينة" : "City"} *</label>
            <input className="w-full border rounded-md px-3 py-2 text-sm" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-700">{lang === "ar" ? "الحالة" : "Condition"}</label>
            <select className="w-full border rounded-md px-3 py-2 text-sm bg-white" value={condition} onChange={(e) => setCondition(e.target.value as any)}>
              <option value="used">{lang === "ar" ? "مستعمل" : "Used"}</option>
              <option value="new">{lang === "ar" ? "جديد" : "New"}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 space-y-1">
            <label className="text-sm text-gray-700">{lang === "ar" ? "السعر" : "Price"}</label>
            <input className="w-full border rounded-md px-3 py-2 text-sm" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-700">{lang === "ar" ? "العملة" : "Currency"}</label>
            <select className="w-full border rounded-md px-3 py-2 text-sm bg-white" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="SYP">SYP</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">{lang === "ar" ? "رقم واتساب (اختياري)" : "WhatsApp number (optional)"}</label>
          <input className="w-full border rounded-md px-3 py-2 text-sm" value={phonePublic} onChange={(e) => setPhonePublic(e.target.value)} />
        </div>
      </div>

      {categoryId && fields.length > 0 && (
        <DynamicFields lang={lang} fields={fields} values={attributes} onChange={setAttributes} />
      )}

      {!listingId ? (
        <button onClick={onCreate} disabled={busy} className={`w-full rounded-md bg-blue-600 text-white py-3 font-semibold ${busy ? "opacity-70" : ""}`}>
          {lang === "ar" ? "نشر الإعلان" : "Create listing"}
        </button>
      ) : (
        <div className="space-y-3">
          <UploadImages lang={lang} listingId={listingId} onUploaded={setUploadedImages} />
          <button onClick={onSaveImagesToDb} disabled={busy} className={`w-full rounded-md bg-green-600 text-white py-3 font-semibold ${busy ? "opacity-70" : ""}`}>
            {lang === "ar" ? "حفظ الصور ونشر الإعلان" : "Save images & publish"}
          </button>
        </div>
      )}
    </div>
  );
}
