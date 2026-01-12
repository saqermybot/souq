import type { Lang } from "@/lib/i18n/lang";
import { isLang } from "@/lib/i18n/lang";
import Gallery from "@/components/listing/Gallery";
import ActionOverlay from "@/components/listing/ActionOverlay";
import ContactButtons from "@/components/listing/ContactButtons";
import SpecsBlock from "@/components/listing/SpecsBlock";
import ViewTracker from "@/components/listing/ViewTracker";
import ListingCard from "@/components/listing/ListingCard";
import { getFirstImagesForListings } from "@/lib/api/home";
import { getCategoryFields, getListing, getListingImages, getSellerPublic, getSimilarListings } from "@/lib/api/listingDetails";

export default async function ListingPage({ params }: { params: { lang: string; id: string } }) {
  if (!isLang(params.lang)) throw new Error("Invalid lang");
  const lang = params.lang as Lang;

  const listing = await getListing(params.id);

  const [images, seller, fields, similar] = await Promise.all([
    getListingImages(listing.id),
    getSellerPublic(listing.owner_profile_id),
    getCategoryFields(listing.category_id),
    getSimilarListings(listing.category_id, listing.id, 6),
  ]);

  const similarImages = await getFirstImagesForListings(similar.map((s: any) => s.id));
  const sellerName = seller?.display_name || (lang === "ar" ? "بائع" : "Seller");

  return (
    <div className="space-y-4">
      <ViewTracker listingId={listing.id} />

      <div className="relative">
        <Gallery images={images} title={listing.title} />
        <ActionOverlay lang={lang} listingId={listing.id} initialFavoritesCount={listing.favorites_count ?? 0} />
      </div>

      <section className="bg-white rounded-lg border p-3 space-y-2">
        <div className="text-sm text-gray-600">{sellerName} • {listing.city}</div>
        <h1 className="text-lg font-bold leading-snug">{listing.title}</h1>
        <div className="text-xl font-extrabold">{listing.price == null ? "—" : listing.price.toLocaleString()} {listing.currency}</div>
      </section>

      <ContactButtons lang={lang} phonePublic={listing.phone_public} listingId={listing.id} />

      <SpecsBlock lang={lang} fields={fields as any} attributes={listing.attributes ?? {}} />

      <section className="bg-white rounded-lg border p-3 space-y-2">
        <h3 className="font-semibold">{lang === "ar" ? "الوصف" : "Description"}</h3>
        <p className="text-sm leading-6 whitespace-pre-wrap">{listing.description}</p>
      </section>

      <section className="bg-white rounded-lg border p-3 text-sm text-gray-700">
        <div className="flex flex-wrap gap-4">
          <div>👁 {listing.views_count ?? 0}</div>
          <div>♥ {listing.favorites_count ?? 0}</div>
          <div>{lang === "ar" ? "رقم الإعلان" : "Listing"}: {listing.id}</div>
          <div>{new Date(listing.created_at).toLocaleDateString()}</div>
        </div>
      </section>

      {similar.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">{lang === "ar" ? "إعلانات مشابهة" : "Similar listings"}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {similar.map((s: any) => (
              <ListingCard
                key={s.id}
                lang={lang}
                id={s.id}
                title={s.title}
                city={s.city}
                price={s.price}
                currency={s.currency}
                imageUrl={similarImages[s.id]}
                favoritesCount={s.favorites_count}
                viewsCount={s.views_count}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
