import Link from "next/link";
import type { Lang } from "@/lib/i18n/lang";

export default function ListingCard(props: {
  lang: Lang;
  id: string;
  title: string;
  city: string;
  price: number | null;
  currency: string;
  imageUrl?: string;
  favoritesCount?: number;
  viewsCount?: number;
}) {
  const { lang, id, title, city, price, currency, imageUrl, favoritesCount, viewsCount } = props;

  return (
    <Link
      href={`/${lang}/listing/${id}`}
      className="block rounded-lg border bg-white overflow-hidden hover:shadow-sm transition"
    >
      <div className="aspect-[4/3] bg-gray-100">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
            No image
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="font-semibold line-clamp-2">{title}</div>
        <div className="text-sm text-gray-600 mt-1">{city}</div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="font-bold">
            {price == null ? "—" : price.toLocaleString()} {currency}
          </div>
          <div className="text-xs text-gray-500 flex gap-2">
            {typeof favoritesCount === "number" && <span>♥ {favoritesCount}</span>}
            {typeof viewsCount === "number" && <span>👁 {viewsCount}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
