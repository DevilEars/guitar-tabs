/**
 * Supabase connection, inlined at build time by Expo from EXPO_PUBLIC_* env vars.
 * The anon/publishable key is public by design (Row Level Security protects the data).
 * Never put a service-role key here.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const syncConfigured = /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
