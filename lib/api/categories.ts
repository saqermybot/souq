import { supabaseRest } from "@/lib/supabase/rest";

export type CategoryField = {
  key: string;
  label_ar: string;
  label_en: string;
  type: "text" | "number" | "select" | "boolean";
  required: boolean;
  options: any[];
  filterable: boolean;
  sort_order: number;
};

export async function getCategoryFields(categoryId: number): Promise<CategoryField[]> {
  return supabaseRest<CategoryField[]>("/rest/v1/category_fields", {
    query: {
      select: "key,label_ar,label_en,type,required,options,filterable,sort_order",
      category_id: `eq.${categoryId}`,
      is_active: "eq.true",
      order: "sort_order.asc",
    },
  });
}
