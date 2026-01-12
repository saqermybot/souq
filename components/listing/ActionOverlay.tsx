"use client";

import { useEffect, useState } from "react";
import { ensureGuest } from "@/lib/session/guest";
import { toggleFavorite } from "@/lib/api/functions";
import { getFavLocal, setFavLocal } from "@/lib/session/favoritesLocal";

export default function ActionOverlay({
  lang,
  listingId,
  initialFavoritesCount,
}: {
  lang: "ar" | "en";
  listingId: string;
  initialFavoritesCount: number;
}) {
  const [favCount, setFavCount] = useState(initialFavoritesCount ?? 0);
  const [favorited, setFavorited] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setFavorited(getFavLocal(listingId)), [listingId]);

  const onBack = () => history.back();

  const onShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ url });
      else await navigator.clipboard.writeText(url);
    } catch {}
  };

  const onToggle = async () => {
    if (busy) return;
    setBusy(true);

    const optimisticNext = !favorited;
    setFavorited(optimisticNext);
    setFavLocal(listingId, optimisticNext);
    setFavCount((c) => (optimisticNext ? c + 1 : Math.max(c - 1, 0)));

    try {
      const guest = await ensureGuest();
      const res = await toggleFavorite(listingId, guest);
      setFavorited(res.favorited);
      setFavLocal(listingId, res.favorited);
      if (typeof res.favorites_count === "number") setFavCount(res.favorites_count);
    } catch {
      const rollback = !optimisticNext;
      setFavorited(rollback);
      setFavLocal(listingId, rollback);
      setFavCount((c) => (rollback ? c + 1 : Math.max(c - 1, 0)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
      <button onClick={onBack} className="bg-white/80 backdrop-blur px-3 py-2 rounded-md text-sm border">
        {lang === "ar" ? "خلف" : "Back"}
      </button>

      <div className="flex items-center gap-2">
        <button onClick={onShare} className="bg-white/80 backdrop-blur px-3 py-2 rounded-md text-sm border">
          {lang === "ar" ? "مشاركة" : "Share"}
        </button>

        <button
          onClick={onToggle}
          disabled={busy}
          className={`px-3 py-2 rounded-md text-sm border backdrop-blur ${
            favorited ? "bg-green-500/30" : "bg-white/80"
          } ${busy ? "opacity-70" : ""}`}
        >
          <span className={favorited ? "text-green-700" : "text-gray-800"}>♥</span>
          {favCount > 0 && <span className="ml-2 text-xs text-gray-900">{favCount}</span>}
        </button>
      </div>
    </div>
  );
}
