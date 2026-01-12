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
export async function getInbox(guest: GuestSession) {
  return callFunction<{ ok: true; items: any[] }>("inbox", {
    guest_id: guest.guest_id,
    guest_secret: guest.guest_secret,
  });
}

export async function getConversation(conversationId: string, guest: GuestSession, before?: string) {
  return callFunction<{ ok: true; messages: any[]; next_before: string | null }>("conversation_get", {
    guest_id: guest.guest_id,
    guest_secret: guest.guest_secret,
    conversation_id: conversationId,
    limit: 50,
    before: before ?? null,
  });
}

export async function sendMessage(conversationId: string, text: string, guest: GuestSession) {
  return callFunction<{ ok: true }>("messages_send", {
    guest_id: guest.guest_id,
    guest_secret: guest.guest_secret,
    conversation_id: conversationId,
    body: text,
  });
}
export async function createListing(payload: {
  guest: GuestSession;
  title: string;
  description: string;
  category_id: number;
  price: number | null;
  currency: string;
  city: string;
  condition: "new" | "used";
  phone_public: string | null;
  attributes: Record<string, any>;
}) {
  const { guest, ...rest } = payload;
  return callFunction<{ ok: true; listing_id: string }>("listings_create", {
    guest_id: guest.guest_id,
    guest_secret: guest.guest_secret,
    ...rest,
  });
}

export async function cloudinarySign(payload: { folder?: string; public_id?: string; tags?: string[] }) {
  return callFunction<{
    ok: true;
    cloud_name: string;
    api_key: string;
    timestamp: number;
    signature: string;
    folder: string;
    public_id: string | null;
    tags: string[];
  }>("cloudinary_sign", payload);
}

export async function addListingImage(payload: {
  guest: GuestSession;
  listing_id: string;
  url: string;
  sort_order: number;
}) {
  const { guest, ...rest } = payload;
  return callFunction<{ ok: true }>("listing_images_add", {
    guest_id: guest.guest_id,
    guest_secret: guest.guest_secret,
    ...rest,
  });
}
