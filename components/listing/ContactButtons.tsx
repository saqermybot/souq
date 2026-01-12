"use client";

import { useState } from "react";
import { ensureGuest } from "@/lib/session/guest";
import { startConversation } from "@/lib/api/functions";
import { useRouter } from "next/navigation";

export default function ContactButtons({
  lang,
  phonePublic,
  listingId,
}: {
  lang: "ar" | "en";
  phonePublic: string | null;
  listingId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onMessage = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const guest = await ensureGuest();
      const res = await startConversation(listingId, guest);
      router.push(`/${lang}/chat/${res.conversation_id}`);
    } catch {
      alert(lang === "ar" ? "تعذر بدء المحادثة" : "Failed to start chat");
    } finally {
      setBusy(false);
    }
  };

  const whatsappHref = phonePublic ? `https://wa.me/${phonePublic.replace(/\D/g, "")}` : null;

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={onMessage}
        disabled={busy}
        className={`rounded-md bg-blue-600 text-white py-3 text-sm font-semibold ${busy ? "opacity-70" : ""}`}
      >
        {lang === "ar" ? "رسالة" : "Message"}
      </button>

      {whatsappHref ? (
        <a href={whatsappHref} target="_blank" rel="noreferrer" className="rounded-md border py-3 text-sm font-semibold text-center bg-white">
          WhatsApp
        </a>
      ) : (
        <button disabled className="rounded-md border py-3 text-sm font-semibold bg-gray-100 text-gray-400">
          WhatsApp
        </button>
      )}
    </div>
  );
}
