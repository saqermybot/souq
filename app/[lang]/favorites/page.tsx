"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Lang } from "@/lib/i18n/lang";
import { ensureGuest } from "@/lib/session/guest";
import { getFavorites } from "@/lib/api/functions";
import ListingCard from "@/components/listing/ListingCard";
import { getFirstImagesForListings } from "@/lib/api/home";

export default function FavoritesPage() {
  const params = useParams<{ lang: Lang }>();
  const lang = params.lang;

  const [items, setItems] = useState<any[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const guest = await ensureGuest();
      const res = await getFavorites(guest);

      // res.items = [{ favorited_at, listing }]
      const listings = (res.items ?? [])
        .map((x: any) => x.listing)
        .filter(Boolean);

      setItems(listings);

      const ids = listings.map((l: any) => l.id);
      const imgs = await getFirstImagesForListings(ids);
      setImages(imgs);

      setLoading(false);
    })().catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-3">
      <div className="font-semibold">{lang === "ar" ? "المفضلة" : "Favorites"}</div>

      {loading ? (
        <div className="text-sm text-gray-500">{lang === "ar" ? "تحميل..." : "Loading..."}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500">
          {lang === "ar" ? "لا يوجد إعلانات محفوظة" : "No saved listings"}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {items.map((l: any) => (
            <ListingCard
              key={l.id}
              lang={lang}
              id={l.id}
              title={l.title}
              city={l.city}
              price={l.price}
              currency={l.currency}
              imageUrl={images[l.id]}
              favoritesCount={l.favorites_count}
              viewsCount={l.views_count}
            />
          ))}
        </div>
      )}
    </div>
  );
}
