import type { Lang } from "./lang";

export const t = (lang: Lang) => {
  const ar = {
    brand: "سوق سوريا",
    searchPlaceholder: "ابحث عن أي شيء...",
    categories: "الأقسام",
    latest: "الأحدث",
    favorites: "المفضلة",
    messages: "الرسائل",
    postAd: "أضف إعلان",
  };

  const en = {
    brand: "Souq Syria",
    searchPlaceholder: "Search anything...",
    categories: "Categories",
    latest: "Latest",
    favorites: "Favorites",
    messages: "Messages",
    postAd: "Post ad",
  };

  return lang === "ar" ? ar : en;
};
