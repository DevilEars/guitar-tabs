import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { SyncEngine, TabRepository, type AuthProvider, type AuthUser } from '@guitar-tabs/library';
import { asyncStorageKV } from '../platform/kv';
import { uuid } from '../platform/uuid';
import { syncConfigured } from '../sync/config';
import { getSupabase, SupabaseAuth, SupabaseRemote } from '../sync/supabase';

export type SyncState =
  | { kind: 'local-only' } // no Supabase configured in this build
  | { kind: 'signed-out' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: string }
  | { kind: 'pending' } // local changes waiting for the next sync
  | { kind: 'offline'; message: string };

interface LibraryValue {
  repo: TabRepository;
  /** Bumps on every repository change, for re-rendering. */
  version: number;
  user: AuthUser | null;
  auth: AuthProvider | null;
  sync: SyncState;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<LibraryValue | null>(null);

export function useLibrary(): LibraryValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLibrary outside LibraryProvider');
  return v;
}

export function LibraryProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [repo, setRepo] = useState<TabRepository | null>(null);
  const [version, setVersion] = useState(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sync, setSync] = useState<SyncState>(syncConfigured ? { kind: 'signed-out' } : { kind: 'local-only' });
  const auth = useMemo<AuthProvider | null>(() => {
    const sb = getSupabase();
    return sb ? new SupabaseAuth(sb) : null;
  }, []);
  const engineRef = useRef<SyncEngine | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    TabRepository.open(asyncStorageKV, { uuid }).then((r) => alive && setRepo(r));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!repo) return;
    return repo.subscribe(() => setVersion((v) => v + 1));
  }, [repo]);

  useEffect(() => {
    if (!auth) return;
    void auth.getUser().then(setUser);
    return auth.onChange(setUser);
  }, [auth]);

  const syncNow = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSync({ kind: 'offline', message: 'No network connection' });
      return;
    }
    setSync({ kind: 'syncing' });
    try {
      const r = await engine.sync();
      setSync({ kind: 'synced', at: r.at });
    } catch (e) {
      setSync({ kind: 'offline', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  // (Re)build the sync engine when the user changes.
  useEffect(() => {
    const sb = getSupabase();
    if (!repo || !sb) return;
    if (!user) {
      engineRef.current = null;
      setSync({ kind: 'signed-out' });
      return;
    }
    engineRef.current = new SyncEngine(repo, new SupabaseRemote(sb, user.id), user.id);
    void syncNow();
  }, [repo, user, syncNow]);

  // Debounced sync after local changes; periodic and on-focus syncs.
  useEffect(() => {
    if (!repo || !user || !engineRef.current) return;
    const dirty = repo.all().some((d) => d.owner_id === user.id && d.dirty);
    if (!dirty) return;
    setSync((s) => (s.kind === 'syncing' ? s : s.kind === 'offline' ? s : { kind: 'pending' }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncNow(), 2000);
  }, [version, repo, user, syncNow]);

  useEffect(() => {
    if (!user) return;
    const iv = setInterval(() => void syncNow(), 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncNow());
    const onOnline = () => void syncNow();
    if (Platform.OS === 'web') window.addEventListener('online', onOnline);
    return () => {
      clearInterval(iv);
      sub.remove();
      if (Platform.OS === 'web') window.removeEventListener('online', onOnline);
    };
  }, [user, syncNow]);

  if (!repo) return <>{fallback}</>;
  return <Ctx.Provider value={{ repo, version, user, auth, sync, syncNow }}>{children}</Ctx.Provider>;
}
