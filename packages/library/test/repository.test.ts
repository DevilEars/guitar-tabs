import { describe, expect, it } from 'vitest';
import { INDEX_KEY, LEGACY_STORAGE_KEY, MemoryKeyValueStore, TabRepository, docKey, type KeyValueStore } from '../src';
import { clock, openRepo, uuid } from './helpers';

describe('TabRepository', () => {
  it('creates, lists newest first, and persists across reopen', async () => {
    const { repo, kv, c } = await openRepo();
    const a = await repo.create({ title: 'Riff A', content: 'e|-0-|' });
    c.advance();
    const b = await repo.create({ title: 'Riff B', artist: 'Band' });
    expect(repo.list(null).map((d) => d.title)).toEqual(['Riff B', 'Riff A']);
    expect(a.dirty && a.synced_at === null && a.owner_id === null).toBe(true);
    await repo.flush();
    const again = await TabRepository.open(kv, { uuid });
    expect(again.get(a.id)?.content).toBe('e|-0-|');
    expect(again.get(b.id)?.artist).toBe('Band');
    const index = JSON.parse((await kv.getItem(INDEX_KEY))!);
    expect(index.version).toBe(2);
    expect(index.ids.sort()).toEqual([a.id, b.id].sort());
    expect(JSON.parse((await kv.getItem(docKey(a.id)))!).content).toBe('e|-0-|');
  });

  it('renames/updates with a newer updated_at and blank titles fall back', async () => {
    const { repo, c } = await openRepo();
    const d = await repo.create({ title: 'Old' });
    c.advance();
    const u = await repo.update(d.id, { title: '  New  ', content: 'x' });
    expect(u.title).toBe('New');
    expect(Date.parse(u.updated_at)).toBeGreaterThan(Date.parse(d.updated_at));
    expect((await repo.update(d.id, { title: '   ' })).title).toBe('Untitled tab');
  });

  it('timestamps are strictly increasing even within the same millisecond', async () => {
    const { repo } = await openRepo(); // clock never advances
    const d = await repo.create({});
    const u1 = await repo.update(d.id, { content: '1' });
    const u2 = await repo.update(d.id, { content: '2' });
    expect(Date.parse(u2.updated_at)).toBeGreaterThan(Date.parse(u1.updated_at));
  });

  it('duplicates with a new id and "(copy)" title', async () => {
    const { repo } = await openRepo();
    const d = await repo.create({ title: 'Song', content: 'abc', tempo: 90 });
    const copy = await repo.duplicate(d.id);
    expect(copy.id).not.toBe(d.id);
    expect(copy).toMatchObject({ title: 'Song (copy)', content: 'abc', tempo: 90 });
  });

  it('hard-deletes never-synced tabs, soft-deletes synced ones', async () => {
    const { repo } = await openRepo();
    const local = await repo.create({ title: 'local' });
    await repo.remove(local.id);
    expect(repo.all().find((d) => d.id === local.id)).toBeUndefined();

    const synced = await repo.create({ title: 'synced' }, 'user-1');
    await repo.markPushed([synced]);
    await repo.remove(synced.id);
    const tomb = repo.all().find((d) => d.id === synced.id)!;
    expect(tomb.deleted_at).not.toBeNull();
    expect(tomb.dirty).toBe(true);
    expect(repo.get(synced.id)).toBeUndefined();
    expect(repo.list('user-1')).toEqual([]);
  });

  it('filters by owner and search text', async () => {
    const { repo } = await openRepo();
    await repo.create({ title: 'Mine', artist: 'Metallica' }, 'u1');
    await repo.create({ title: 'Theirs' }, 'u2');
    await repo.create({ title: 'Signed-out tab', content: 'blackbird' });
    expect(repo.list('u1').map((d) => d.title).sort()).toEqual(['Mine', 'Signed-out tab']);
    expect(repo.list(null).map((d) => d.title)).toEqual(['Signed-out tab']);
    expect(repo.list('u1', 'metal').map((d) => d.title)).toEqual(['Mine']);
    expect(repo.list('u1', 'BLACKBIRD').map((d) => d.title)).toEqual(['Signed-out tab']);
  });

  it('claims unowned tabs for an account', async () => {
    const { repo } = await openRepo();
    await repo.create({ title: 'a' });
    await repo.create({ title: 'b' });
    expect(await repo.claimUnowned('u1')).toBe(2);
    expect(repo.unowned()).toEqual([]);
    expect(repo.all().every((d) => d.owner_id === 'u1' && d.dirty)).toBe(true);
  });

  it('exports and re-imports a JSON backup (newer wins, unknown added)', async () => {
    const { repo, c } = await openRepo();
    const d = await repo.create({ title: 'Keep', content: 'v1' });
    const backup = repo.exportBackup(null);
    c.advance();
    await repo.update(d.id, { content: 'v2' });

    const { repo: other } = await openRepo(new MemoryKeyValueStore(), clock());
    expect(await other.importBackup(backup, null)).toEqual({ added: 1, updated: 0, skipped: 0 });
    expect(other.get(d.id)?.content).toBe('v1');
    // importing the older backup into the newer repo changes nothing
    expect(await repo.importBackup(backup, null)).toEqual({ added: 0, updated: 0, skipped: 1 });
    expect(repo.get(d.id)?.content).toBe('v2');
    await expect(repo.importBackup('{"foo":1}', null)).rejects.toThrow(/backup/);
  });

  it('notifies subscribers on change', async () => {
    const { repo } = await openRepo();
    let calls = 0;
    const off = repo.subscribe(() => calls++);
    await repo.create({});
    off();
    await repo.create({});
    expect(calls).toBe(1);
  });

  it('stores one value per tab so no value hits the Android ~2 MB row limit', async () => {
    // Fake AsyncStorage-on-Android: rejects values over 2 MB like SQLiteBlobTooBigException / CursorWindow.
    const limited = new MemoryKeyValueStore();
    const strict: KeyValueStore = {
      getItem: (k) => limited.getItem(k),
      removeItem: (k) => limited.removeItem(k),
      setItem: async (k, v) => { if (v.length > 2 * 1024 * 1024) throw new Error('Row too big to fit into CursorWindow'); return limited.setItem(k, v); },
    };
    const repo = await TabRepository.open(strict, { uuid });
    const big = 'e|' + '-'.repeat(900 * 1024) + '|';
    for (let i = 0; i < 4; i++) await repo.create({ title: `big ${i}`, content: big }); // ~3.6 MB total
    await repo.flush();
    const again = await TabRepository.open(strict, { uuid });
    expect(again.list(null)).toHaveLength(4);
    expect(Math.max(...[...limited.data.values()].map((v) => v.length))).toBeLessThan(2 * 1024 * 1024);
  });

  it('removes the stored value when a never-synced tab is deleted', async () => {
    const { repo, kv } = await openRepo();
    const d = await repo.create({ title: 'gone' });
    await repo.remove(d.id);
    await repo.flush();
    expect(await kv.getItem(docKey(d.id))).toBeNull();
    expect(JSON.parse((await kv.getItem(INDEX_KEY))!).ids).toEqual([]);
  });

  it('migrates a v1 single-value library to per-tab storage', async () => {
    const kv = new MemoryKeyValueStore();
    const doc = { id: 'old-1', title: 'Old tab', artist: '', tuning: [], tempo: 100, content: 'x', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null, owner_id: null, dirty: true, synced_at: null };
    await kv.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, docs: { 'old-1': doc }, meta: { 'uploadPrompt:u1': 'declined' } }));
    const repo = await TabRepository.open(kv, { uuid });
    expect(repo.get('old-1')?.title).toBe('Old tab');
    expect(repo.getMeta('uploadPrompt:u1')).toBe('declined');
    expect(await kv.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(await kv.getItem(docKey('old-1'))).not.toBeNull();
    const again = await TabRepository.open(kv, { uuid });
    expect(again.get('old-1')?.title).toBe('Old tab');
  });
});
