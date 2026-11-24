import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStore, STORAGE_KEY, TabRepository } from '../src';
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
    expect(JSON.parse((await kv.getItem(STORAGE_KEY))!).version).toBe(1);
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
});
