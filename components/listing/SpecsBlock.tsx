"use client";

import { useMemo, useState } from "react";
import type { CategoryField } from "@/lib/api/listingDetails";

function displayValue(field: CategoryField, value: any, lang: "ar" | "en") {
  if (value == null || value === "") return "—";
  if (field.type === "select" && Array.isArray(field.options)) {
    const opt = field.options.find((o: any) => o?.value === value);
    if (opt) return lang === "ar" ? opt.label_ar : opt.label_en;
  }
  return String(value);
}

export default function SpecsBlock({
  lang,
  fields,
  attributes,
  maxPrimary = 8,
}: {
  lang: "ar" | "en";
  fields: CategoryField[];
  attributes: Record<string, any>;
  maxPrimary?: number;
}) {
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    return (fields ?? []).map((f) => ({
      key: f.key,
      label: lang === "ar" ? f.label_ar : f.label_en,
      value: displayValue(f, attributes?.[f.key], lang),
    }));
  }, [fields, attributes, lang]);

  const primary = rows.slice(0, maxPrimary);
  const rest = rows.slice(maxPrimary);

  return (
    <section className="bg-white rounded-lg border p-3 space-y-3">
      <h3 className="font-semibold">{lang === "ar" ? "المواصفات" : "Specs"}</h3>

      <div className="space-y-2">
        {primary.map((r) => (
          <div key={r.key} className="flex justify-between gap-3 text-sm">
            <div className="text-gray-600">{r.label}</div>
            <div className="font-medium">{r.value}</div>
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <button onClick={() => setOpen((v) => !v)} className="text-sm text-blue-700 underline">
          {open ? (lang === "ar" ? "إخفاء" : "Hide") : (lang === "ar" ? "عرض المزيد" : "Show more")}
        </button>
      )}

      {open && rest.length > 0 && (
        <div className="pt-2 border-t space-y-2">
          {rest.map((r) => (
            <div key={r.key} className="flex justify-between gap-3 text-sm">
              <div className="text-gray-600">{r.label}</div>
              <div className="font-medium">{r.value}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
