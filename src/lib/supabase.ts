import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/**
 * Supabase is opt-in. Set VITE_SUPABASE_ENABLED=true (plus URL and anon key) to persist in Supabase;
 * otherwise everything is stored in the browser so the app runs with no external service.
 */
export const supabaseEnabled =
  ((import.meta.env.VITE_SUPABASE_ENABLED as string | undefined) ?? '').toLowerCase() === 'true';

/** True when Supabase credentials are present. The client is optional: the app falls back to local storage. */
export const supabaseConfigured = supabaseEnabled && Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
