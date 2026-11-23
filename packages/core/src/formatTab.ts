import type { Duration, Tab } from './types';
import { tuningLabels } from './tuning';

export interface FormatTabOptions {
  /** Emit a rhythm line above each system. Default: only if any duration differs from an eighth. */
  rhythm?: boolean;
  /** Measures per system (line). Default 4. */
  measuresPerLine?: number;
}

const RHYTHM_LETTER: Record<string, string> = { w: 'w', h: 'h', q: 'q', '8': 'e', '16': 's' };
const sameDur = (a: Duration, b: Duration) => a.type === b.type && a.dots === b.dots;

/** Render a Tab model back to ASCII tab (inverse of parseTab). */
export function formatTab(tab: Tab, opts: FormatTabOptions = {}): string {
  const labels = tuningLabels(tab.tuning);
  const lw = Math.max(...labels.map((l) => l.length));
  const n = tab.tuning.length;
  const showRhythm = opts.rhythm ?? tab.measures.some((m) => m.events.some((e) => !sameDur(e.duration, { type: '8', dots: 0 })));
  const perLine = opts.measuresPerLine ?? 4;
  const out: string[] = [];
  for (let m0 = 0; m0 < tab.measures.length; m0 += perLine) {
    const rows = labels.map((l) => l.padEnd(lw, ' ') + '|');
    let rhythm = ' '.repeat(lw + 1);
    let prev: Duration | undefined;
    for (const measure of tab.measures.slice(m0, m0 + perLine)) {
      for (let s = 0; s < n; s++) rows[s] += '-';
      rhythm += ' ';
      for (const ev of measure.events) {
        const cells = Array.from({ length: n }, (_, s) => {
          const note = ev.notes.find((x) => x.string === s + 1);
          return note ? `${note.fret}${note.articulation ?? ''}` : '';
        });
        const w = Math.max(1, ...cells.map((x) => x.length));
        for (let s = 0; s < n; s++) rows[s] += cells[s].padEnd(w, '-') + '--';
        const mark = !prev || !sameDur(prev, ev.duration) ? RHYTHM_LETTER[ev.duration.type] + (ev.duration.dots ? '.' : '') : '';
        rhythm += mark.padEnd(w + 2, ' ');
        prev = ev.duration;
      }
      for (let s = 0; s < n; s++) rows[s] += '|';
      rhythm += ' ';
    }
    if (showRhythm) out.push(rhythm.replace(/\s+$/, ''));
    out.push(...rows, '');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}
