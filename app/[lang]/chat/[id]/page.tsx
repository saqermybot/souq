"use client";

import { useEffect, useState } from "react";
import { ensureGuest } from "@/lib/session/guest";
import { getConversation, sendMessage } from "@/lib/api/functions";
import { useParams } from "next/navigation";
import type { Lang } from "@/lib/i18n/lang";

export default function ChatPage() {
  const params = useParams<{ lang: Lang; id: string }>();
  const lang = params.lang;
  const conversationId = params.id;

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const guest = await ensureGuest();
    const res = await getConversation(conversationId, guest);
    setMessages(res.messages ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const onSend = async () => {
    const msg = text.trim();
    if (!msg) return;

    setBusy(true);
    try {
      const guest = await ensureGuest();
      await sendMessage(conversationId, msg, guest);
      setText("");
      await load();
    } catch {
      alert(lang === "ar" ? "تعذر إرسال الرسالة" : "Failed to send message");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="font-semibold">{lang === "ar" ? "المحادثة" : "Chat"}</div>

      <div className="bg-white border rounded-lg p-3 space-y-2 min-h-[45vh]">
        {loading ? (
          <div className="text-sm text-gray-500">{lang === "ar" ? "تحميل..." : "Loading..."}</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-gray-500">{lang === "ar" ? "لا توجد رسائل بعد" : "No messages yet"}</div>
        ) : (
          messages
            .slice()
            .reverse()
            .map((m) => (
              <div key={m.id} className="text-sm">
                <div className="text-gray-900">{m.body}</div>
                <div className="text-xs text-gray-500">
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            ))
        )}
      </div>

      <div className="bg-white border rounded-lg p-3 flex gap-2">
        <input
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          placeholder={lang === "ar" ? "اكتب رسالة..." : "Write a message..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          onClick={onSend}
          disabled={busy}
          className={`px-4 py-2 rounded-md bg-blue-600 text-white text-sm ${busy ? "opacity-70" : ""}`}
        >
          {lang === "ar" ? "إرسال" : "Send"}
        </button>
      </div>
    </div>
  );
}
