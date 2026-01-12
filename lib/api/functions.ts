import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import type { GuestSession } from "@/lib/session/guest";

async function callFunction<T>(fn: string, body: any): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.error || `${fn} failed`);
  return data as T;
}

export async function recordListingView(listingId: string, guest: GuestSession) {
  return callFunction<{ ok: true; counted: boolean; views_count: number }>("listing_view", {
    guest_id: guest.guest_id,
    guest_secret: guest.guest_secret,
    listing_id: listingId,
  });
}

export async function toggleFavorite(listingId: string, guest: GuestSession) {
  return callFunction<{ ok: true; favorited: boolean; favorites_count?: number }>("favorites_toggle", {
    guest_id: guest.guest_id,
    guest_secret: guest.guest_secret,
    listing_id: listingId,
  });
}

export async function startConversation(listingId: string, guest: GuestSession) {
  return callFunction<{ ok: true; conversation_id: string }>("messages_start", {
    guest_id: guest.guest_id,
    guest_secret: guest.guest_secret,
    listing_id: listingId,
  });
}
