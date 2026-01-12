export type Lang = "ar" | "en";

export function isLang(x: string): x is Lang {
  return x === "ar" || x === "en";
}

export function dirOf(lang: Lang) {
  return lang === "ar" ? "rtl" : "ltr";
}
