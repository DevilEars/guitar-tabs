import { MemoryKeyValueStore, TabRepository } from '../src';

/** Controllable clock + deterministic ids. */
export function clock(start = Date.parse('2026-01-01T00:00:00.000Z')) {
  let t = start;
  return {
    now: () => new Date(t).toISOString(),
    advance: (ms = 1000) => { t += ms; },
  };
}

let n = 0;
export const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

export async function openRepo(kv = new MemoryKeyValueStore(), c = clock()) {
  const repo = await TabRepository.open(kv, { now: c.now, uuid });
  return { repo, kv, c };
}
