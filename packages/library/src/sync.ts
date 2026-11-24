import type { LocalTabDoc, RemoteTabStore, TabDoc } from './types';
import { normalize, toTabDoc, type TabRepository } from './repository';

export interface SyncPlan {
  /** Local versions to upsert on the server. */
  push: TabDoc[];
  /** Server versions to write locally. */
  pull: TabDoc[];
}

const ts = (s: string) => Date.parse(s);

/**
 * Last-write-wins merge by updated_at. Deletes are tombstones (deleted_at + newer updated_at), so a delete
 * beats an older edit and a newer edit beats an older delete (the tab comes back).
 * Ties: server wins unless the local copy has unpushed changes with the identical timestamp (then nothing).
 */
export function planSync(local: LocalTabDoc[], remote: TabDoc[]): SyncPlan {
  const push: TabDoc[] = [];
  const pull: TabDoc[] = [];
  const remoteById = new Map(remote.map((r) => [r.id, normalize(r)]));
  const seen = new Set<string>();
  for (const l of local) {
    seen.add(l.id);
    const r = remoteById.get(l.id);
    if (!r) {
      // Never-uploaded docs, or docs the server lost. Tombstones of never-synced docs need not travel.
      if (!(l.deleted_at && l.synced_at === null)) push.push(toTabDoc(l));
      continue;
    }
    const lt = ts(l.updated_at), rt = ts(r.updated_at);
    if (lt > rt) push.push(toTabDoc(l));
    else if (rt > lt) pull.push(r);
    else if (!l.dirty && l.synced_at !== r.updated_at) pull.push(r);
  }
  for (const r of remoteById.values()) if (!seen.has(r.id)) pull.push(r);
  return { push, pull };
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  at: string;
}

/** Runs one sync round for a signed-in user. Serialises concurrent calls. */
export class SyncEngine {
  private running: Promise<SyncResult> | null = null;

  constructor(private repo: TabRepository, private remote: RemoteTabStore, private ownerId: string) {}

  sync(): Promise<SyncResult> {
    if (!this.running) {
      this.running = this.run().finally(() => { this.running = null; });
    }
    return this.running;
  }

  private async run(): Promise<SyncResult> {
    const remote = await this.remote.listAll();
    const local = this.repo.all().filter((d) => d.owner_id === this.ownerId);
    const plan = planSync(local, remote);
    if (plan.push.length) {
      await this.remote.upsert(plan.push);
      await this.repo.markPushed(plan.push);
    }
    if (plan.pull.length) {
      // Don't clobber edits made while we were talking to the server.
      const fresh = plan.pull.filter((r) => {
        const cur = this.repo.all().find((d) => d.id === r.id);
        return !cur || !cur.dirty || ts(cur.updated_at) < ts(r.updated_at);
      });
      await this.repo.applyRemote(fresh, this.ownerId);
    }
    const at = new Date().toISOString();
    await this.repo.setMeta(`lastSync:${this.ownerId}`, at);
    return { pushed: plan.push.length, pulled: plan.pull.length, at };
  }
}

/** In-memory server used by tests and as a reference implementation. */
export class FakeRemote implements RemoteTabStore {
  rows = new Map<string, TabDoc>();
  failNext = false;
  calls = { listAll: 0, upsert: 0 };
  async listAll(): Promise<TabDoc[]> {
    this.calls.listAll++;
    if (this.failNext) { this.failNext = false; throw new Error('offline'); }
    return [...this.rows.values()].map((r) => ({ ...r, tuning: [...r.tuning] }));
  }
  async upsert(docs: TabDoc[]): Promise<void> {
    this.calls.upsert++;
    for (const d of docs) this.rows.set(d.id, { ...d, tuning: [...d.tuning] });
  }
}
