import { supabaseRest } from "@/lib/supabase/rest";

export type SearchParams = Record<string, string | undefined> & {
  q?: string;
  cat?: string;
  city?: string;
  min?: string;
  max?: string;
  condition?: string;
  sort?: string;
  limit?: string;
};

export type Listing = {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  city: string;
  condition: string;
  created_at: string;
  favorites_count: number;
  views_count: number;
  status: string;
};

function escLike(s: string) {
  return s.replace(/[%_]/g, (m) => `\\${m}`);
}

export async function searchListings(sp: SearchParams): Promise<Listing[]> {
  const limit = Math.min(Math.max(Number(sp.limit ?? "24"), 1), 60);

  let order = "created_at.desc";
  if (sp.sort === "price_asc") order = "price.asc.nullslast";
  if (sp.sort === "price_desc") order = "price.desc.nullslast";
  if (sp.sort === "views") order = "views_count.desc";
  if (sp.sort === "favorites") order = "favorites_count.desc";

  const query: Record<string, string> = {
    select: "id,title,price,currency,city,condition,created_at,favorites_count,views_count,status",
    status: "eq.active",
    order,
    limit: String(limit),
  };

  if (sp.cat) query.category_id = `eq.${sp.cat}`;
  if (sp.city) query.city = `ilike.%${escLike(sp.city)}%`;
  if (sp.condition === "new" || sp.condition === "used") query.condition = `eq.${sp.condition}`;

  // price range
  if (sp.min && !sp.max) query.price = `gte.${sp.min}`;
  if (sp.max) {
    const minPart = sp.min ? `price.gte.${sp.min}` : null;
    const maxPart = `price.lte.${sp.max}`;
    query.and = `(${[minPart, maxPart].filter(Boolean).join(",")})`;
  }

  // text search: title OR description
  if (sp.q && sp.q.trim()) {
    const q = escLike(sp.q.trim());
    query.or = `(title.ilike.%${q}%,description.ilike.%${q}%)`;
  }

  // dynamic attributes: attr.<key>=value → attributes->>key=eq.value
  for (const [k, v] of Object.entries(sp)) {
    if (!v) continue;
    if (k.startsWith("attr.")) {
      const key = k.slice("attr.".length);
      query[`attributes->>${key}`] = `eq.${v}`;
    }
  }

  return supabaseRest<Listing[]>("/rest/v1/listings", { query });
}
