/** A saved tab document. Timestamps are ISO-8601 UTC strings. */
export interface TabDoc {
  id: string;
  title: string;
  artist: string;
  /** Open-string MIDI numbers, string 1 (high) first. */
  tuning: number[];
  tempo: number;
  /** ASCII tab text. */
  content: string;
  created_at: string;
  updated_at: string;
  /** Soft-delete tombstone. */
  deleted_at: string | null;
}

/** Local bookkeeping that is never sent to the server. */
export interface LocalTabDoc extends TabDoc {
  /** Account the doc belongs to; null = created signed-out, not yet uploaded. */
  owner_id: string | null;
  /** Has local changes not yet pushed. */
  dirty: boolean;
  /** updated_at of the version last confirmed by the server (null = never synced). */
  synced_at: string | null;
}

/** Minimal async key/value store (AsyncStorage, localStorage, in-memory...). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Server side of sync. Implementations: Supabase, in-memory fake. Rows are scoped to the signed-in user. */
export interface RemoteTabStore {
  /** All rows of the current user, including soft-deleted ones. */
  listAll(): Promise<TabDoc[]>;
  /** Insert or update by id. */
  upsert(docs: TabDoc[]): Promise<void>;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

export type OAuthProvider = 'github' | 'google';

/** Auth behind an interface so providers (Supabase today) and OAuth methods can be added. */
export interface AuthProvider {
  getUser(): Promise<AuthUser | null>;
  onChange(cb: (user: AuthUser | null) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  sendMagicLink(email: string): Promise<void>;
  /** Not wired in the UI yet; enable the provider in Supabase first. */
  signInWithOAuth?(provider: OAuthProvider): Promise<void>;
  signOut(): Promise<void>;
}
