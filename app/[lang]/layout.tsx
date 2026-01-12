import type { Lang } from "@/lib/i18n/lang";
import { dirOf, isLang } from "@/lib/i18n/lang";
import TopBarClient from "@/components/layout/TopBarClient";

export default function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { lang: string };
}) {
  if (!isLang(params.lang)) throw new Error("Invalid lang");
  const lang = params.lang as Lang;

  return (
    <div dir={dirOf(lang)} data-lang={lang}>
      <TopBarClient lang={lang} />
      <main className="mx-auto max-w-5xl px-3 py-4">{children}</main>
    </div>
  );
}
