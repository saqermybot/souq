import { supabaseRest } from "@/lib/supabase/rest";

export type Category = {
  id: number;
  parent_id: number | null;
  slug: string;
  name_ar: string;
  name_en: string;
  sort_order: number;
};

export type ListingImage = {
  listing_id: string;
  url: string;
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

export async function getFirstImagesForListings(listingIds: string[]): Promise<Record<string, string>> {
  if (listingIds.length === 0) return {};
  const inList = `in.(${listingIds.join(",")})`;

  const images = await supabaseRest<ListingImage[]>("/rest/v1/listing_images", {
    query: {
      select: "listing_id,url,sort_order",
      listing_id: inList,
      order: "sort_order.asc",
    },
  });

  const map: Record<string, string> = {};
  for (const img of images) {
    if (!map[img.listing_id]) map[img.listing_id] = img.url;
  }
  return map;
}
