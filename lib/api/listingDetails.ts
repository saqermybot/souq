import { supabaseRest } from "@/lib/supabase/rest";

export type ListingDetails = {
  id: string;
  owner_profile_id: string;
  category_id: number;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  city: string;
  condition: string;
  phone_public: string | null;
  attributes: Record<string, any>;
  favorites_count: number;
  views_count: number;
  created_at: string;
};

export type ListingImage = { id: string; listing_id: string; url: string; sort_order: number };

export type PublicSeller = { id: string; display_name: string | null; is_trader: boolean; created_at: string };

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

export async function getListing(id: string): Promise<ListingDetails> {
  const rows = await supabaseRest<ListingDetails[]>("/rest/v1/listings", {
    query: {
      select: "id,owner_profile_id,category_id,title,description,price,currency,city,condition,phone_public,attributes,favorites_count,views_count,created_at",
      id: `eq.${id}`,
      limit: "1",
    },
  });
  if (!rows?.[0]) throw new Error("Listing not found");
  return rows[0];
}

export async function getListingImages(listingId: string): Promise<ListingImage[]> {
  return supabaseRest<ListingImage[]>("/rest/v1/listing_images", {
    query: { select: "id,listing_id,url,sort_order", listing_id: `eq.${listingId}`, order: "sort_order.asc" },
  });
}

export async function getSellerPublic(profileId: string): Promise<PublicSeller | null> {
  const rows = await supabaseRest<PublicSeller[]>("/rest/v1/profiles", {
    query: { select: "id,display_name,is_trader,created_at", id: `eq.${profileId}`, limit: "1" },
  });
  return rows?.[0] ?? null;
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

export async function getSimilarListings(categoryId: number, excludeId: string, limit = 6) {
  return supabaseRest<any[]>("/rest/v1/listings", {
    query: {
      select: "id,title,price,currency,city,condition,created_at,favorites_count,views_count,status",
      status: "eq.active",
      category_id: `eq.${categoryId}`,
      id: `neq.${excludeId}`,
      order: "created_at.desc",
      limit: String(limit),
    },
  });
}
