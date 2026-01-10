import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { SUPABASE } from "./config.js";

function assertConfig() {
  if (!SUPABASE?.url || !SUPABASE?.anonKey) {
    throw new Error("Supabase config missing: set SUPABASE.url and SUPABASE.anonKey in js/config.js");
  }
}

export function getSupabase() {
  assertConfig();
  // singleton
  if (!globalThis.__supabaseClient) {
    globalThis.__supabaseClient = createClient(SUPABASE.url, SUPABASE.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return globalThis.__supabaseClient;
}
