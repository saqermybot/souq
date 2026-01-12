"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Lang } from "@/lib/i18n/lang";
import { t } from "@/lib/i18n/dict";
import { getCategoryFields } from "@/lib/api/categories";

type Field = {
  key: string;
  label_ar: string;
  label_en: string;
  type: "text" | "number" | "select" | "boolean";
  options: any[];
  filterable: boolean;
  sort_order: number;
};

export default function SmartFiltersDrawer({ lang }: { lang: Lang }) {
  const copy = t(lang);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Field[]>([]);
  const [attrs, setAttrs] = useState<Record<string, string>>({});

  // base filters
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [city, setCity] = useState(sp.get("city") ?? "");
  const [min, setMin] = useState(sp.get("min") ?? "");
  const [max, setMax] = useState(sp.get("max") ?? "");
  const [condition, setCondition] = useState(sp.get("condition") ?? "");
  const [sort, setSort] = useState(sp.get("sort") ?? "newest");

  const categoryId = sp.get("cat");

  // load dynamic fields whenever cat changes
  useEffect(() => {
    (async () => {
      if (!categoryId) {
        setFields([]);
        setAttrs({});
        return;
      }

      const all = await getCategoryFields(Number(categoryId));
      const filterable = (all ?? []).filter((f) => f.filterable);
      setFields(filterable);

      // preload existing attr.* from URL
      const next: Record<string, string> = {};
      sp.forEach((v, k) => {
        if (k.startsWith("attr.")) next[k.replace("attr.", "")] = v;
      });
      setAttrs(next);
    })().catch(() => {});
  }, [categoryId, sp]);

  const apply = () => {
    const url = new URL(window.location.href);
    const p = url.searchParams;

    const setOrDel = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));

    // base
    setOrDel("q", q.trim());
    setOrDel("city", city.trim());
    setOrDel("min", min.trim());
    setOrDel("max", max.trim());
    setOrDel("condition", condition);
    setOrDel("sort", sort === "newest" ? "" : sort);

    // dynamic attrs
    Object.entries(attrs).forEach(([k, v]) => {
      if (v) p.set(`attr.${k}`, v);
      else p.delete(`attr.${k}`);
    });

    router.push(`${pathname}?${p.toString()}`);
    setOpen(false);
  };

  const clearAll = () => {
    const url = new URL(window.location.href);
    const p = url.searchParams;

    // keep selected category if exists
    const keepCat = p.get("cat");

    // remove everything
    p.forEach((_, key) => p.delete(key));

    if (keepCat) p.set("cat", keepCat);
    router.push(`${pathname}?${p.toString()}`);
    setOpen(false);
  };

  const labelOf = (f: Field) => (lang === "ar" ? f.label_ar : f.label_en);

  return (
    <>
      <button
        className="rounded-md border bg-white px-3 py-2 text-sm"
        onClick={() => setOpen(true)}
      >
        {lang === "ar" ? "فلترة" : "Filters"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 space-y-3 max-h-[85vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold">{lang === "ar" ? "فلترة" : "Filters"}</div>
              <button className="text-sm underline" onClick={() => setOpen(false)}>
                {lang === "ar" ? "إغلاق" : "Close"}
              </button>
            </div>

            {/* base */}
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder={copy.searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                className="border rounded-md px-3 py-2 text-sm"
                placeholder={lang === "ar" ? "المدينة" : "City"}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <select
                className="border rounded-md px-3 py-2 text-sm bg-white"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              >
                <option value="">{lang === "ar" ? "الحالة (الكل)" : "Condition (all)"}</option>
                <option value="used">{lang === "ar" ? "مستعمل" : "Used"}</option>
                <option value="new">{lang === "ar" ? "جديد" : "New"}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                className="border rounded-md px-3 py-2 text-sm"
                placeholder={lang === "ar" ? "السعر من" : "Min price"}
                type="number"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
              <input
                className="border rounded-md px-3 py-2 text-sm"
                placeholder={lang === "ar" ? "السعر إلى" : "Max price"}
                type="number"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </div>

            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">{lang === "ar" ? "الأحدث" : "Newest"}</option>
              <option value="price_asc">{lang === "ar" ? "الأرخص" : "Price: Low → High"}</option>
              <option value="price_desc">{lang === "ar" ? "الأغلى" : "Price: High → Low"}</option>
              <option value="views">{lang === "ar" ? "الأكثر مشاهدة" : "Most viewed"}</option>
              <option value="favorites">{lang === "ar" ? "الأكثر حفظاً" : "Most saved"}</option>
            </select>

            {/* dynamic */}
            {fields.length > 0 && (
              <div className="pt-2 border-t space-y-3">
                <div className="font-semibold text-sm">
                  {lang === "ar" ? "فلاتر حسب القسم" : "Category filters"}
                </div>

                {fields.map((f) => {
                  const v = attrs[f.key] ?? "";

                  if (f.type === "select") {
                    return (
                      <select
                        key={f.key}
                        className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                        value={v}
                        onChange={(e) => setAttrs({ ...attrs, [f.key]: e.target.value })}
                      >
                        <option value="">{labelOf(f)}</option>
                        {(f.options ?? []).map((o: any) => (
                          <option key={o.value} value={o.value}>
                            {lang === "ar" ? o.label_ar : o.label_en}
                          </option>
                        ))}
                      </select>
                    );
                  }

                  return (
                    <input
                      key={f.key}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      placeholder={labelOf(f)}
                      type={f.type === "number" ? "number" : "text"}
                      value={v}
                      onChange={(e) => setAttrs({ ...attrs, [f.key]: e.target.value })}
                    />
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button className="rounded-md border py-3 text-sm font-semibold" onClick={clearAll}>
                {lang === "ar" ? "مسح" : "Clear"}
              </button>
              <button className="rounded-md bg-blue-600 text-white py-3 text-sm font-semibold" onClick={apply}>
                {lang === "ar" ? "تطبيق" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
