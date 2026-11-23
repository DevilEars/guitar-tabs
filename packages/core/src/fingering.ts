import type { Score, Tab, TabNote } from './types';
import { MAX_FRET } from './tuning';

export interface FingeringOptions {
  maxFret?: number;
  /** Max distance between lowest and highest fretted (non-open) note in a chord. Default 4. */
  maxSpan?: number;
  /** Use string/fret hints stored on score notes when they are valid for this tuning. */
  respectHints?: boolean;
}

export interface FingeringResult {
  tab: Tab;
  /** Human-readable problems, e.g. out-of-range pitches that were dropped. */
  warnings: string[];
}

interface Candidate {
  notes: TabNote[];
  /** Representative hand position (lowest fretted note), or null if all open strings. */
  pos: number | null;
  cost: number;
}

/** All ways to put `pitches` on distinct strings. */
function chordCandidates(pitches: number[], tuning: readonly number[], maxFret: number, maxSpan: number): Candidate[] {
  const out: Candidate[] = [];
  const options = pitches.map((p) =>
    tuning.map((open, i) => ({ string: i + 1, fret: p - open })).filter((o) => o.fret >= 0 && o.fret <= maxFret),
  );
  const used = new Set<number>();
  const cur: TabNote[] = [];
  const rec = (k: number) => {
    if (k === pitches.length) {
      const fretted = cur.filter((n) => n.fret > 0).map((n) => n.fret);
      const lo = fretted.length ? Math.min(...fretted) : null;
      const hi = fretted.length ? Math.max(...fretted) : null;
      const span = lo === null ? 0 : hi! - lo;
      if (span > maxSpan) return;
      // static cost: prefer low frets, open strings, compact shapes
      const cost = cur.reduce((s, n) => s + n.fret * 0.15, 0) + (span > 3 ? 1 : 0) + (lo !== null && lo > 12 ? 1 : 0);
      out.push({ notes: cur.map((n) => ({ ...n })), pos: lo, cost });
      return;
    }
    for (const o of options[k]) {
      if (used.has(o.string)) continue;
      used.add(o.string);
      cur.push(o);
      rec(k + 1);
      cur.pop();
      used.delete(o.string);
    }
  };
  rec(0);
  return out;
}

/**
 * Choose string/fret positions for every note in a score.
 * Dynamic programming (Viterbi) over all events: each event's candidates are all playable assignments
 * (distinct strings, frets 0..maxFret, fretted span <= maxSpan). The hand is modelled as a 4-fret window;
 * cost = 0.15 per fret (prefer low frets/open strings) + stretch/high-position penalties + (1 + distance)
 * for every hand shift. The cheapest path over the whole piece wins. Pitches outside the instrument's range are dropped with a warning.
 */
export function fingerScore(score: Score, tuning: readonly number[], opts: FingeringOptions = {}): FingeringResult {
  const maxFret = opts.maxFret ?? MAX_FRET;
  const maxSpan = opts.maxSpan ?? 4;
  const warnings: string[] = [];
  const lo = Math.min(...tuning);
  const hi = Math.max(...tuning) + maxFret;

  const events = score.measures.flatMap((m, mi) => m.notes.map((n, ni) => ({ n, mi, ni })));
  const layers: Candidate[][] = events.map(({ n, mi, ni }) => {
    if (n.pitches.length === 0) return [{ notes: [], pos: null, cost: 0 }];
    if (opts.respectHints && n.positions && n.positions.length === n.pitches.length) {
      const hinted = n.positions;
      const ok = hinted.every((h, k) => h && tuning[h.string - 1] !== undefined && tuning[h.string - 1] + h.fret === n.pitches[k].midi && h.fret >= 0 && h.fret <= maxFret)
        && new Set(hinted.map((h) => h!.string)).size === hinted.length;
      if (ok) {
        const fretted = hinted.filter((h) => h!.fret > 0).map((h) => h!.fret);
        return [{ notes: hinted.map((h) => ({ ...h! })), pos: fretted.length ? Math.min(...fretted) : null, cost: 0 }];
      }
    }
    let midis = [...new Set(n.pitches.map((p) => p.midi))].sort((a, b) => a - b);
    const out = midis.filter((m) => m < lo || m > hi);
    if (out.length) warnings.push(`Measure ${mi + 1}, note ${ni + 1}: ${out.join(', ')} out of guitar range, dropped`);
    midis = midis.filter((m) => m >= lo && m <= hi);
    if (midis.length > tuning.length) {
      warnings.push(`Measure ${mi + 1}, note ${ni + 1}: ${midis.length} notes but only ${tuning.length} strings; kept the top ${tuning.length}`);
      midis = midis.slice(-tuning.length);
    }
    let cands = chordCandidates(midis, tuning, maxFret, maxSpan);
    if (!cands.length) cands = chordCandidates(midis, tuning, maxFret, maxFret);
    while (!cands.length && midis.length > 1) {
      warnings.push(`Measure ${mi + 1}, note ${ni + 1}: chord not playable; dropped ${midis[0]}`);
      midis = midis.slice(1);
      cands = chordCandidates(midis, tuning, maxFret, maxFret);
    }
    return cands.length ? cands : [{ notes: [], pos: null, cost: 0 }];
  });

  // Viterbi over (candidate, hand position). The hand covers a 4-fret window [h, h+3]; open strings fit any
  // window. Moving the hand costs 1 + distance; staying put is free.
  const H = maxFret;
  const handRange = (c: Candidate): [number, number] => {
    const fretted = c.notes.filter((n) => n.fret > 0).map((n) => n.fret);
    if (!fretted.length) return [1, H];
    const lo = Math.min(...fretted);
    const hi = Math.max(...fretted);
    return hi - lo <= 3 ? [Math.max(1, hi - 3), lo] : [lo, lo];
  };
  const move = (a: number, b: number) => (a === b ? 0 : 1 + Math.abs(a - b));
  // cost[t][k][h], back[t][k][h] = [prevK, prevH]
  const cost: Float64Array[][] = [];
  const back: Int32Array[][] = [];
  layers.forEach((cands, t) => {
    // best previous cost per hand position
    let prevBest: Float64Array | undefined;
    let prevArg: Int32Array | undefined;
    if (t > 0) {
      prevBest = new Float64Array(H + 1).fill(Infinity);
      prevArg = new Int32Array(H + 1).fill(-1);
      cost[t - 1].forEach((row, k) => {
        for (let h = 1; h <= H; h++) if (row[h] < prevBest![h]) { prevBest![h] = row[h]; prevArg![h] = k; }
      });
    }
    cost[t] = [];
    back[t] = [];
    cands.forEach((c, k) => {
      const row = new Float64Array(H + 1).fill(Infinity);
      const bk = new Int32Array((H + 1) * 2).fill(-1);
      const [a, b] = handRange(c);
      for (let h = a; h <= b; h++) {
        if (!prevBest) { row[h] = c.cost + (h - 1) * 0.01; continue; }
        for (let h0 = 1; h0 <= H; h0++) {
          const v = prevBest[h0] + c.cost + move(h0, h);
          if (v < row[h]) { row[h] = v; bk[h * 2] = prevArg![h0]; bk[h * 2 + 1] = h0; }
        }
      }
      cost[t][k] = row;
      back[t][k] = bk;
    });
  });
  const choice: number[] = new Array(layers.length);
  if (layers.length) {
    const T = layers.length - 1;
    let bestK = 0, bestH = 1, best = Infinity;
    cost[T].forEach((row, k) => { for (let h = 1; h <= H; h++) if (row[h] < best) { best = row[h]; bestK = k; bestH = h; } });
    for (let t = T; t >= 0; t--) {
      choice[t] = bestK;
      const bk = back[t][bestK];
      const pk = bk[bestH * 2], ph = bk[bestH * 2 + 1];
      bestK = pk; bestH = ph;
    }
  }

  let idx = 0;
  const tab: Tab = {
    tuning: [...tuning],
    measures: score.measures.map((m) => ({
      events: m.notes.map((n) => {
        const c = layers[idx][choice[idx]];
        idx++;
        return { notes: [...c.notes].sort((a, b) => a.string - b.string), duration: n.duration };
      }),
    })),
  };
  return { tab, warnings };
}
