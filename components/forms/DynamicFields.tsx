"use client";

import type { CategoryField } from "@/lib/api/postAd";

export default function DynamicFields({
  lang,
  fields,
  values,
  onChange,
}: {
  lang: "ar" | "en";
  fields: CategoryField[];
  values: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
}) {
  const setVal = (key: string, val: any) => onChange({ ...values, [key]: val });

  return (
    <div className="bg-white border rounded-lg p-3 space-y-3">
      <div className="font-semibold">{lang === "ar" ? "معلومات إضافية" : "Additional details"}</div>

      <div className="space-y-3">
        {fields.map((f) => {
          const label = lang === "ar" ? f.label_ar : f.label_en;
          const v = values[f.key] ?? "";

          if (f.type === "select") {
            return (
              <div key={f.key} className="space-y-1">
                <label className="text-sm text-gray-700">{label} {f.required ? "*" : ""}</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                  value={v}
                  onChange={(e) => setVal(f.key, e.target.value)}
                >
                  <option value="">{lang === "ar" ? "اختر..." : "Select..."}</option>
                  {(f.options ?? []).map((o: any) => (
                    <option key={o.value} value={o.value}>
                      {lang === "ar" ? o.label_ar : o.label_en}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div key={f.key} className="space-y-1">
              <label className="text-sm text-gray-700">{label} {f.required ? "*" : ""}</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm"
                type={f.type === "number" ? "number" : "text"}
                value={v}
                onChange={(e) =>
                  setVal(
                    f.key,
                    f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value
                  )
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
