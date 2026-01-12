import { supabaseRest } from "@/lib/supabase/rest";

export type Category = {
  id: number;
  parent_id: number | null;
  slug: string;
  name_ar: string;
  name_en: string;
  sort_order: number;
};

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

export async function getRootCategories(): Promise<Category[]> {
  return supabaseRest<Category[]>("/rest/v1/categories", {
    query: {
      select: "id,parent_id,slug,name_ar,name_en,sort_order",
      parent_id: "is.null",
      is_active: "eq.true",
      order: "sort_order.asc",
    },
  });
}

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