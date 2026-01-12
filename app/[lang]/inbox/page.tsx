"use client";

import { useEffect, useState } from "react";
import { ensureGuest } from "@/lib/session/guest";
import { getInbox } from "@/lib/api/functions";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Lang } from "@/lib/i18n/lang";

export default function InboxPage() {
  const params = useParams<{ lang: Lang }>();
  const lang = params.lang;

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const guest = await ensureGuest();
      const res = await getInbox(guest);
      setItems(res.items ?? []);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-3">
      <div className="font-semibold">{lang === "ar" ? "الرسائل" : "Inbox"}</div>

      {loading ? (
        <div className="text-sm text-gray-500">{lang === "ar" ? "تحميل..." : "Loading..."}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500">{lang === "ar" ? "لا توجد محادثات" : "No conversations"}</div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <Link
              key={it.conversation_id}
              href={`/${lang}/chat/${it.conversation_id}`}
              className="block bg-white border rounded-lg p-3"
            >
              <div className="font-semibold text-sm">
                {it?.listing?.title ?? (lang === "ar" ? "إعلان" : "Listing")}
              </div>
              <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                {it?.last_message?.body ?? ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
