import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

type Opts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: any;
  cache?: RequestCache;
};

function buildUrl(path: string, query?: Record<string, string>) {
  const url = new URL(`${SUPABASE_URL}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

export async function supabaseRest<T>(path: string, opts: Opts = {}): Promise<T> {
  const url = buildUrl(path, opts.query);

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: opts.cache ?? "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase REST ${res.status} ${res.statusText}\nURL: ${url}\nBody: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : (null as T);
}