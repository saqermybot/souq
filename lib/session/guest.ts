import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

const LS_GUEST_ID = "mp_guest_id";
const LS_GUEST_SECRET = "mp_guest_secret";

export type GuestSession = {
  guest_id: string;
  guest_secret: string;
};

export function getGuestLocal(): Partial<GuestSession> {
  if (typeof window === "undefined") return {};
  return {
    guest_id: localStorage.getItem(LS_GUEST_ID) ?? undefined,
    guest_secret: localStorage.getItem(LS_GUEST_SECRET) ?? undefined,
  };
}

export function setGuestLocal(s: GuestSession) {
  localStorage.setItem(LS_GUEST_ID, s.guest_id);
  localStorage.setItem(LS_GUEST_SECRET, s.guest_secret);
}

export async function ensureGuest(): Promise<GuestSession> {
  const current = getGuestLocal();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/guest_init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      guest_id: current.guest_id,
      guest_secret: current.guest_secret,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.error || "guest_init failed");

  const session: GuestSession = {
    guest_id: data.guest_id,
    guest_secret: data.guest_secret,
  };

  setGuestLocal(session);
  return session;
}