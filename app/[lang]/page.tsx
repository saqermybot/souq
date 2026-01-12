import type { Lang } from "@/lib/i18n/lang";
import { isLang } from "@/lib/i18n/lang";
import { t } from "@/lib/i18n/dict";
import ListingCard from "@/components/listing/ListingCard";
import { getRootCategories, getFirstImagesForListings } from "@/lib/api/home";
import { searchListings } from "@/lib/api/searchListings";

export default async function HomePage({
  params,
  searchParams,
}: {
  params: { lang: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (!isLang(params.lang)) throw new Error("Invalid lang");
  const lang = params.lang as Lang;
  const copy = t(lang);

  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string") sp[k] = v;

  const [categories, listings] = await Promise.all([
    getRootCategories(),
    searchListings({ ...sp, limit: "24" }),
  ]);

  const images = await getFirstImagesForListings(listings.map((l) => l.id));

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{copy.categories}</h2>
          {/* Drawer الذكي سنضيفه في الدفعة 2 */}
          <a className="rounded-md border bg-white px-3 py-2 text-sm" href="#">
            {lang === "ar" ? "فلترة" : "Filters"}
          </a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {categories.map((c) => (
            <a
              key={c.id}
              href={`/${lang}?cat=${c.id}`}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              title={lang === "ar" ? c.name_ar : c.name_en}
            >
              {lang === "ar" ? c.name_ar : c.name_en}
            </a>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{copy.latest}</h2>
          <div className="text-sm text-gray-500">
            {listings.length} {lang === "ar" ? "نتيجة" : "results"}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {listings.map((l) => (
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
      </section>
    </div>
  );
}
