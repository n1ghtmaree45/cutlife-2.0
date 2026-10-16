import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL_ = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Cloud features exist only when both public settings are present at build time (forks run local-only). */
export const cloudEnabled = Boolean(URL_ && KEY);

let client: SupabaseClient | null = null;
export function getClient(): SupabaseClient {
  if (!cloudEnabled) throw new Error('Cloud is not configured');
  client ??= createClient(URL_!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return client;
}

/**
 * True when a previous sign-in is still stored on this device. Access tokens expire after an hour and cannot
 * be refreshed offline, so the app trusts the stored session to stay usable offline; the server (RLS) is the real gate.
 */
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) ?? ''; if (k.startsWith('sb-') && k.endsWith('-auth-token') && localStorage.getItem(k)) return true; }
  } catch { /* storage blocked */ }
  return false;
}
