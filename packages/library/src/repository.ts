import type { KeyValueStore, LocalTabDoc, TabDoc } from './types';

/** v1: everything in one JSON value (kept only to migrate old installs). */
export const LEGACY_STORAGE_KEY = 'guitar-tabs:library:v1';
/** v2: small index (ids + meta) plus one value per tab. */
export const INDEX_KEY = 'guitar-tabs:index:v2';
export const docKey = (id: string) => `guitar-tabs:doc:${id}`;
export const DEFAULT_TUNING = [64, 59, 55, 50, 45, 40];

export interface RepositoryOptions {
  now?: () => string;
  uuid?: () => string;
}

export interface NewTab {
  title?: string;
  artist?: string;
  tuning?: number[];
  tempo?: number;
  content?: string;
}

export type TabPatch = Partial<Pick<TabDoc, 'title' | 'artist' | 'tuning' | 'tempo' | 'content'>>;

interface LegacyStored {
  version: 1;
  docs: Record<string, LocalTabDoc>;
  meta: Record<string, string>;
}

interface StoredIndex {
  version: 2;
  ids: string[];
  meta: Record<string, string>;
}

const ts = (s: string) => Date.parse(s);

/** Strictly increasing ISO timestamps even if the clock returns the same millisecond twice. */
function monotonic(now: () => string): () => string {
  let last = 0;
  return () => {
    let t = ts(now());
    if (t <= last) t = last + 1;
    last = t;
    return new Date(t).toISOString();
  };
}

/**
 * Local-first tab store. Everything lives in memory and is written through to a key/value store
 * (AsyncStorage on Android, localStorage on web): one value per tab plus a small index. Storing per tab keeps
 * every value well under Android AsyncStorage's ~2 MB-per-row limit (SQLite CursorWindow), which a single
 * JSON value for the whole library would hit. Works signed-out and offline.
 */
export class TabRepository {
  private docs = new Map<string, LocalTabDoc>();
  private meta = new Map<string, string>();
  private listeners = new Set<() => void>();
  private writing: Promise<void> = Promise.resolve();
  private readonly now: () => string;
  private readonly uuid: () => string;

  private constructor(private kv: KeyValueStore, opts: RepositoryOptions) {
    this.now = monotonic(opts.now ?? (() => new Date().toISOString()));
    this.uuid = opts.uuid ?? (() => (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID());
  }

  static async open(kv: KeyValueStore, opts: RepositoryOptions = {}): Promise<TabRepository> {
    const repo = new TabRepository(kv, opts);
    const rawIndex = await kv.getItem(INDEX_KEY);
    if (rawIndex) {
      const index = JSON.parse(rawIndex) as StoredIndex;
      for (const [k, v] of Object.entries(index.meta ?? {})) repo.meta.set(k, v);
      const values = await Promise.all(index.ids.map((id) => kv.getItem(docKey(id))));
      values.forEach((raw) => {
        if (!raw) return;
        const d = JSON.parse(raw) as LocalTabDoc;
        repo.docs.set(d.id, d);
      });
      return repo;
    }
    const legacy = await kv.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as LegacyStored;
      for (const d of Object.values(parsed.docs ?? {})) repo.docs.set(d.id, d);
      for (const [k, v] of Object.entries(parsed.meta ?? {})) repo.meta.set(k, v);
      await repo.persist(repo.docs.keys());
      await repo.flush();
      await kv.removeItem(LEGACY_STORAGE_KEY);
    }
    return repo;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Resolves when all pending writes have reached the key/value store. */
  flush(): Promise<void> {
    return this.writing;
  }

  /** Write the given tabs (or delete their values if they're gone) and the index. Writes are serialised. */
  private persist(changed: Iterable<string> = []): Promise<void> {
    const writes: [string, string | null][] = [...new Set(changed)].map((id) => {
      const d = this.docs.get(id);
      return [docKey(id), d ? JSON.stringify(d) : null];
    });
    const index: StoredIndex = { version: 2, ids: [...this.docs.keys()], meta: Object.fromEntries(this.meta) };
    const indexJson = JSON.stringify(index);
    this.writing = this.writing.then(async () => {
      // Docs first, index last: a crash in between leaves at worst an unreferenced value, never a dangling id.
      for (const [key, value] of writes) {
        if (value === null) await this.kv.removeItem(key);
        else await this.kv.setItem(key, value);
      }
      await this.kv.setItem(INDEX_KEY, indexJson);
    });
    this.listeners.forEach((l) => l());
    return this.writing;
  }

  /** Visible tabs for the current account: its own plus signed-out (unowned) ones. Newest first. */
  list(ownerId: string | null, query = ''): LocalTabDoc[] {
    const q = query.trim().toLowerCase();
    return [...this.docs.values()]
      .filter((d) => !d.deleted_at && (d.owner_id === null || d.owner_id === ownerId))
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.artist.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
      .sort((a, b) => ts(b.updated_at) - ts(a.updated_at));
  }

  /** Every doc, including tombstones and other accounts' cached docs. */
  all(): LocalTabDoc[] {
    return [...this.docs.values()];
  }

  get(id: string): LocalTabDoc | undefined {
    const d = this.docs.get(id);
    return d && !d.deleted_at ? d : undefined;
  }

  async create(input: NewTab = {}, ownerId: string | null = null): Promise<LocalTabDoc> {
    const t = this.now();
    const doc: LocalTabDoc = {
      id: this.uuid(),
      title: input.title?.trim() || 'Untitled tab',
      artist: input.artist ?? '',
      tuning: input.tuning ?? [...DEFAULT_TUNING],
      tempo: input.tempo ?? 100,
      content: input.content ?? '',
      created_at: t,
      updated_at: t,
      deleted_at: null,
      owner_id: ownerId,
      dirty: true,
      synced_at: null,
    };
    this.docs.set(doc.id, doc);
    await this.persist([doc.id]);
    return doc;
  }

  async update(id: string, patch: TabPatch): Promise<LocalTabDoc> {
    const d = this.get(id);
    if (!d) throw new Error(`Tab ${id} not found`);
    const next: LocalTabDoc = { ...d, ...patch, updated_at: this.now(), dirty: true };
    if (patch.title !== undefined) next.title = patch.title.trim() || 'Untitled tab';
    this.docs.set(id, next);
    await this.persist([id]);
    return next;
  }

  async duplicate(id: string): Promise<LocalTabDoc> {
    const d = this.get(id);
    if (!d) throw new Error(`Tab ${id} not found`);
    return this.create({ title: `${d.title} (copy)`, artist: d.artist, tuning: [...d.tuning], tempo: d.tempo, content: d.content }, d.owner_id);
  }

  /** Soft delete. Docs the server has never seen are removed outright. */
  async remove(id: string): Promise<void> {
    const d = this.docs.get(id);
    if (!d || d.deleted_at) return;
    if (d.synced_at === null) {
      this.docs.delete(id);
    } else {
      const t = this.now();
      this.docs.set(id, { ...d, deleted_at: t, updated_at: t, dirty: true });
    }
    await this.persist([id]);
  }

  /** Unowned (signed-out) tabs that could be uploaded to an account. */
  unowned(): LocalTabDoc[] {
    return [...this.docs.values()].filter((d) => d.owner_id === null && !d.deleted_at);
  }

  /** Attach signed-out tabs to an account so the next sync uploads them. */
  async claimUnowned(ownerId: string): Promise<number> {
    const list = this.unowned();
    for (const d of list) this.docs.set(d.id, { ...d, owner_id: ownerId, dirty: true });
    if (list.length) await this.persist(list.map((d) => d.id));
    return list.length;
  }

  // ---- sync support ----

  /** Replace/insert docs with server versions (clean). */
  async applyRemote(docs: TabDoc[], ownerId: string): Promise<void> {
    for (const r of docs) this.docs.set(r.id, { ...r, owner_id: ownerId, dirty: false, synced_at: r.updated_at });
    if (docs.length) await this.persist(docs.map((d) => d.id));
  }

  /** Mark pushed docs clean, unless they were edited again while the push was in flight. */
  async markPushed(pushed: TabDoc[]): Promise<void> {
    const changed: string[] = [];
    for (const p of pushed) {
      const d = this.docs.get(p.id);
      if (d && d.updated_at === p.updated_at) {
        this.docs.set(p.id, { ...d, dirty: false, synced_at: p.updated_at });
        changed.push(p.id);
      }
    }
    if (changed.length) await this.persist(changed);
  }

  getMeta(key: string): string | undefined {
    return this.meta.get(key);
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
    await this.persist([]);
  }

  // ---- backup ----

  exportBackup(ownerId: string | null): string {
    const tabs = this.list(ownerId).map(toTabDoc);
    return JSON.stringify({ format: 'guitar-tabs-backup', version: 1, exported_at: this.now(), tabs }, null, 2);
  }

  /** Import a backup: unknown ids are added, known ids are replaced only if the backup copy is newer. */
  async importBackup(json: string, ownerId: string | null): Promise<{ added: number; updated: number; skipped: number }> {
    const parsed = JSON.parse(json);
    if (parsed?.format !== 'guitar-tabs-backup' || !Array.isArray(parsed.tabs)) throw new Error('Not a Guitar Tabs backup file');
    let added = 0, updated = 0, skipped = 0;
    const changed: string[] = [];
    for (const raw of parsed.tabs as TabDoc[]) {
      if (typeof raw?.id !== 'string' || typeof raw.content !== 'string') { skipped++; continue; }
      const cur = this.docs.get(raw.id);
      const doc = normalize(raw);
      if (!cur) {
        this.docs.set(doc.id, { ...doc, owner_id: ownerId, dirty: true, synced_at: null });
        changed.push(doc.id);
        added++;
      } else if (ts(doc.updated_at) > ts(cur.updated_at)) {
        this.docs.set(doc.id, { ...cur, ...doc, dirty: true });
        changed.push(doc.id);
        updated++;
      } else skipped++;
    }
    await this.persist(changed);
    return { added, updated, skipped };
  }
}

export function toTabDoc(d: TabDoc): TabDoc {
  return {
    id: d.id, title: d.title, artist: d.artist, tuning: [...d.tuning], tempo: d.tempo, content: d.content,
    created_at: d.created_at, updated_at: d.updated_at, deleted_at: d.deleted_at,
  };
}

/** Normalise timestamps (Postgres returns "+00:00", we store "Z") and defaults. */
export function normalize(d: TabDoc): TabDoc {
  const iso = (s: string) => new Date(s).toISOString();
  return {
    id: d.id,
    title: d.title ?? 'Untitled tab',
    artist: d.artist ?? '',
    tuning: Array.isArray(d.tuning) ? d.tuning.map(Number) : [...DEFAULT_TUNING],
    tempo: Number(d.tempo) || 100,
    content: d.content ?? '',
    created_at: iso(d.created_at),
    updated_at: iso(d.updated_at),
    deleted_at: d.deleted_at ? iso(d.deleted_at) : null,
  };
}
