import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalize, type AuthProvider, type AuthUser, type OAuthProvider, type RemoteTabStore, type TabDoc } from '@guitar-tabs/library';
import { SUPABASE_ANON_KEY, SUPABASE_URL, syncConfigured } from './config';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!syncConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
    });
  }
  return client;
}

/** Where magic links / OAuth send the user back to. */
export function redirectUrl(): string {
  if (Platform.OS === 'web') return `${window.location.origin}${window.location.pathname}`;
  return Linking.createURL('auth-callback');
}

const COLUMNS = 'id,title,artist,tuning,tempo,content,created_at,updated_at,deleted_at';

export class SupabaseRemote implements RemoteTabStore {
  constructor(private sb: SupabaseClient, private userId: string) {}

  async listAll(): Promise<TabDoc[]> {
    // RLS limits rows to auth.uid(); the filter just makes intent explicit.
    const { data, error } = await this.sb.from('tabs').select(COLUMNS).eq('user_id', this.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => normalize(r as TabDoc));
  }

  async upsert(docs: TabDoc[]): Promise<void> {
    const rows = docs.map((d) => ({ ...d, user_id: this.userId }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await this.sb.from('tabs').upsert(rows.slice(i, i + 200), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
  }
}

export class SupabaseAuth implements AuthProvider {
  constructor(private sb: SupabaseClient) {
    if (Platform.OS !== 'web') {
      // Magic-link / OAuth return on Android: guitartabs://auth-callback?code=...
      const handle = (url: string | null) => {
        if (!url) return;
        const code = Linking.parse(url).queryParams?.code;
        if (typeof code === 'string') void this.sb.auth.exchangeCodeForSession(code);
      };
      void Linking.getInitialURL().then(handle);
      Linking.addEventListener('url', (e) => handle(e.url));
    }
  }

  private toUser(u: { id: string; email?: string | null } | null | undefined): AuthUser | null {
    return u ? { id: u.id, email: u.email ?? null } : null;
  }

  async getUser(): Promise<AuthUser | null> {
    const { data } = await this.sb.auth.getSession();
    return this.toUser(data.session?.user);
  }

  onChange(cb: (user: AuthUser | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_e, session) => cb(this.toUser(session?.user)));
    return () => data.subscription.unsubscribe();
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async signUpWithPassword(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  }

  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl() } });
    if (error) throw new Error(error.message);
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<void> {
    const { error } = await this.sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirectUrl() } });
    if (error) throw new Error(error.message);
  }

  async signOut(): Promise<void> {
    const { error } = await this.sb.auth.signOut();
    if (error) throw new Error(error.message);
  }
}
