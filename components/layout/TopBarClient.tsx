"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Lang } from "@/lib/i18n/lang";
import { t } from "@/lib/i18n/dict";
import { useEffect, useState } from "react";

export default function TopBarClient({ lang }: { lang: Lang }) {
  const copy = t(lang);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get("q") ?? "");

  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = new URL(window.location.href);
    const p = url.searchParams;
    const v = q.trim();
    if (v) p.set("q", v);
    else p.delete("q");
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b">
      <div className="mx-auto max-w-5xl px-3 py-2 flex items-center gap-3">
        <Link href={`/${lang}`} className="font-bold text-lg whitespace-nowrap">
          {copy.brand}
        </Link>

        <form onSubmit={submit} className="flex-1">
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder={copy.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>

        <nav className="flex items-center gap-2">
          <Link className="rounded-md border px-2 py-2 text-sm" href={`/${lang}/inbox`}>
            {copy.messages}
          </Link>
          <Link className="rounded-md border px-2 py-2 text-sm" href={`/${lang}/favorites`}>
            {copy.favorites}
          </Link>
          <Link className="rounded-md bg-blue-600 text-white px-3 py-2 text-sm" href={`/${lang}/post`}>
            {copy.postAd}
          </Link>
        </nav>
      </div>
    </header>
  );
}
