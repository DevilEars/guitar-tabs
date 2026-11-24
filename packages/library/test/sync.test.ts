import { describe, expect, it } from 'vitest';
import { FakeRemote, MemoryKeyValueStore, SyncEngine, planSync, type TabDoc } from '../src';
import { clock, openRepo } from './helpers';

const U = 'user-1';

async function device(remote: FakeRemote, c = clock()) {
  const { repo } = await openRepo(new MemoryKeyValueStore(), c);
  return { repo, engine: new SyncEngine(repo, remote, U), c };
}

describe('sync', () => {
  it('pushes new local tabs and pulls them on another device', async () => {
    const remote = new FakeRemote();
    const c = clock();
    const a = await device(remote, c);
    const t = await a.repo.create({ title: 'Song', content: 'e|-0-|' }, U);
    expect(await a.engine.sync()).toMatchObject({ pushed: 1, pulled: 0 });
    expect(remote.rows.get(t.id)?.content).toBe('e|-0-|');
    expect(a.repo.get(t.id)).toMatchObject({ dirty: false, synced_at: t.updated_at });

    const b = await device(remote, c);
    expect(await b.engine.sync()).toMatchObject({ pushed: 0, pulled: 1 });
    expect(b.repo.list(U).map((d) => d.title)).toEqual(['Song']);
    // second sync is a no-op
    expect(await b.engine.sync()).toMatchObject({ pushed: 0, pulled: 0 });
  });

  it('last write wins on conflicting edits', async () => {
    const remote = new FakeRemote();
    const c = clock();
    const a = await device(remote, c);
    const b = await device(remote, c);
    const t = await a.repo.create({ title: 'Song', content: 'base' }, U);
    await a.engine.sync();
    await b.engine.sync();

    c.advance();
    await a.repo.update(t.id, { content: 'from A' });
    c.advance();
    await b.repo.update(t.id, { content: 'from B (newer)' });

    await a.engine.sync(); // A pushes its edit
    await b.engine.sync(); // B is newer: pushes over A
    await a.engine.sync(); // A pulls B's version
    expect(remote.rows.get(t.id)?.content).toBe('from B (newer)');
    expect(a.repo.get(t.id)?.content).toBe('from B (newer)');
    expect(b.repo.get(t.id)?.content).toBe('from B (newer)');
  });

  it('older local edit loses to a newer server version', async () => {
    const remote = new FakeRemote();
    const c = clock();
    const a = await device(remote, c);
    const b = await device(remote, c);
    const t = await a.repo.create({ content: 'base' }, U);
    await a.engine.sync();
    await b.engine.sync();
    c.advance();
    await a.repo.update(t.id, { content: 'old edit, synced late' });
    c.advance();
    await b.repo.update(t.id, { content: 'newer edit' });
    await b.engine.sync();
    const r = await a.engine.sync();
    expect(r.pulled).toBe(1);
    expect(a.repo.get(t.id)?.content).toBe('newer edit');
    expect(a.repo.get(t.id)?.dirty).toBe(false);
  });

  it('propagates soft deletes, and a newer edit beats an older delete', async () => {
    const remote = new FakeRemote();
    const c = clock();
    const a = await device(remote, c);
    const b = await device(remote, c);
    const t1 = await a.repo.create({ title: 'deleted' }, U);
    const t2 = await a.repo.create({ title: 'resurrected' }, U);
    await a.engine.sync();
    await b.engine.sync();

    c.advance();
    await a.repo.remove(t1.id);
    await a.repo.remove(t2.id);
    c.advance();
    await b.repo.update(t2.id, { content: 'edited after the delete' });

    await a.engine.sync();
    expect(remote.rows.get(t1.id)?.deleted_at).not.toBeNull();
    await b.engine.sync();
    expect(b.repo.get(t1.id)).toBeUndefined();
    expect(b.repo.get(t2.id)?.content).toBe('edited after the delete');
    await a.engine.sync();
    expect(a.repo.get(t2.id)?.content).toBe('edited after the delete');
    expect(remote.rows.get(t2.id)?.deleted_at).toBeNull();
  });

  it('does not upload signed-out tabs until claimed, then uploads them', async () => {
    const remote = new FakeRemote();
    const a = await device(remote);
    await a.repo.create({ title: 'offline tab' });
    expect(await a.engine.sync()).toMatchObject({ pushed: 0 });
    expect(remote.rows.size).toBe(0);
    await a.repo.claimUnowned(U);
    expect(await a.engine.sync()).toMatchObject({ pushed: 1 });
    expect([...remote.rows.values()][0].title).toBe('offline tab');
  });

  it('keeps local changes when the server is unreachable and retries later', async () => {
    const remote = new FakeRemote();
    const a = await device(remote);
    const t = await a.repo.create({ content: 'x' }, U);
    remote.failNext = true;
    await expect(a.engine.sync()).rejects.toThrow('offline');
    expect(a.repo.get(t.id)?.dirty).toBe(true);
    await a.engine.sync();
    expect(a.repo.get(t.id)?.dirty).toBe(false);
  });

  it('an edit made during an in-flight push stays dirty', async () => {
    const remote = new FakeRemote();
    const c = clock();
    const a = await device(remote, c);
    const t = await a.repo.create({ content: 'v1' }, U);
    const origUpsert = remote.upsert.bind(remote);
    remote.upsert = async (docs: TabDoc[]) => {
      c.advance();
      await a.repo.update(t.id, { content: 'v2 typed during sync' });
      await origUpsert(docs);
    };
    await a.engine.sync();
    expect(a.repo.get(t.id)).toMatchObject({ content: 'v2 typed during sync', dirty: true });
    remote.upsert = origUpsert;
    await a.engine.sync();
    expect(remote.rows.get(t.id)?.content).toBe('v2 typed during sync');
  });

  it('planSync normalises Postgres timestamps and skips tombstones of never-synced docs', () => {
    const base = { id: 'a', title: 't', artist: '', tuning: [64], tempo: 100, content: '', created_at: '2026-01-01T00:00:00Z', deleted_at: null };
    const plan = planSync(
      [{ ...base, updated_at: '2026-01-01T00:00:00.000Z', owner_id: U, dirty: false, synced_at: '2026-01-01T00:00:00.000Z' },
       { ...base, id: 'b', updated_at: '2026-01-02T00:00:00.000Z', deleted_at: '2026-01-02T00:00:00.000Z', owner_id: U, dirty: true, synced_at: null }],
      [{ ...base, updated_at: '2026-01-01T00:00:00+00:00' }],
    );
    expect(plan).toEqual({ push: [], pull: [] });
  });

  it('concurrent sync() calls share one round', async () => {
    const remote = new FakeRemote();
    const a = await device(remote);
    await a.repo.create({}, U);
    await Promise.all([a.engine.sync(), a.engine.sync()]);
    expect(remote.calls.listAll).toBe(1);
  });
});
