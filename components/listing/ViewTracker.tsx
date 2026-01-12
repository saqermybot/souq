"use client";

import { useEffect } from "react";
import { ensureGuest } from "@/lib/session/guest";
import { recordListingView } from "@/lib/api/functions";

export default function ViewTracker({ listingId }: { listingId: string }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const guest = await ensureGuest();
        if (cancelled) return;
        await recordListingView(listingId, guest);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [listingId]);

  return null;
}
