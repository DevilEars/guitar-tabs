import type { Articulation, Duration, DurationType, Tab, TabEvent, TabMeasure, TabNote } from './types';
import { EIGHTH } from './pitch';
import { inferTuningFromLabels, MAX_FRET, STANDARD_TUNING } from './tuning';

export interface ParseTabOptions {
  /** Open-string MIDI numbers, string 1 (highest) first. Defaults to standard tuning, or inferred from labels. */
  tuning?: readonly number[];
  /** Duration used when there is no rhythm line. Default: eighth note. */
  defaultDuration?: Duration;
}

export class TabParseError extends Error {
  constructor(message: string, public line?: number) {
    super(line !== undefined ? `Line ${line + 1}: ${message}` : message);
    this.name = 'TabParseError';
  }
}

const LABEL_RE = /^\s*([A-Ga-g][#b]?\d?)?\s*(?=[|:\-0-9])/;
const BODY_CHARS = /^[-0-9|:hpbrs/\\~xX()<>^.*v ]*$/;
const ARTICULATIONS = new Set(['h', 'p', '/', '\\', 'b', 'r', '~', 's']);
const RHYTHM_RE = /^[\swhqesWHQES.|\-]+$/;
const RHYTHM_MAP: Record<string, DurationType> = { w: 'w', h: 'h', q: 'q', e: '8', s: '16' };

interface TabLine {
  label?: string;
  /** column (in the raw line) where the body starts */
  start: number;
  body: string;
}

function asTabLine(raw: string): TabLine | null {
  const line = raw.replace(/\s+$/, '');
  const m = LABEL_RE.exec(line);
  if (!m) return null;
  const start = m[0].length;
  const body = line.slice(start);
  if (!BODY_CHARS.test(body)) return null;
  if ((body.match(/-/g) ?? []).length < 2) return null;
  return { label: m[1], start, body };
}

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';

/**
 * Parse ASCII guitar tab.
 *
 * - Systems are runs of N consecutive tab lines (N = number of strings), top line = string 1.
 * - Optional string labels ("e|", "B|", "D|"...) are used to infer the tuning if no tuning is given.
 * - Fret numbers 0-24; two adjacent digits are read as one fret if <= 24.
 * - Notes in the same column (or overlapping a 2-digit fret's columns) form a chord.
 * - `|` ends a measure. h/p/slide/bend symbols right after a fret are kept as the note's articulation.
 * - Optional rhythm line directly above a system: w h q e s (whole..16th), `.` after a letter = dotted.
 *   A marker applies to the event at its column and stays in effect until the next marker.
 *   Without a rhythm line every event gets `defaultDuration` (eighth).
 */
export function parseTab(text: string, options: ParseTabOptions = {}): Tab {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const n = options.tuning?.length ?? STANDARD_TUNING.length;
  const measures: TabMeasure[] = [];
  let labels: (string | undefined)[] | undefined;
  let duration: Duration = options.defaultDuration ?? EIGHTH;

  let i = 0;
  let systems = 0;
  while (i < lines.length) {
    const first = asTabLine(lines[i]);
    if (!first) { i++; continue; }
    // collect run of tab lines
    const run: TabLine[] = [];
    let j = i;
    while (j < lines.length) {
      const t = asTabLine(lines[j]);
      if (!t) break;
      run.push(t);
      j++;
    }
    if (run.length % n !== 0) {
      throw new TabParseError(`Found ${run.length} tab lines in a row; expected a multiple of ${n} strings`, i);
    }
    // rhythm line directly above this run
    const prev = i > 0 ? lines[i - 1] : undefined;
    const rhythmLine = prev && RHYTHM_RE.test(prev) && /[whqesWHQES]/.test(prev) ? prev : undefined;

    for (let s = 0; s < run.length; s += n) {
      const sys = run.slice(s, s + n);
      if (!labels) labels = sys.map((l) => l.label);
      const rhythm = s === 0 ? rhythmLine : undefined;
      duration = scanSystem(sys, rhythm, measures, duration);
      systems++;
    }
    i = j;
  }
  if (systems === 0) throw new TabParseError('No tab found (expected lines like "e|---0---|")');

  const tuning = options.tuning ? [...options.tuning] : labels && labels.some(Boolean) ? inferTuningFromLabels(labels) : [...STANDARD_TUNING];
  return { tuning, measures };
}

function scanSystem(sys: TabLine[], rhythm: string | undefined, measures: TabMeasure[], duration: Duration): Duration {
  const offset = sys[0].start;
  const len = Math.max(...sys.map((l) => l.body.length));
  const rows = sys.map((l) => l.body.padEnd(len, '-'));
  const rhythmRow = rhythm ? rhythm.slice(offset).padEnd(len, ' ') : undefined;
  let current: TabEvent[] = [];
  const flush = () => {
    if (current.length) measures.push({ events: current });
    current = [];
  };

  const readFret = (row: string, c: number): [number, number] => {
    if (isDigit(row[c + 1])) {
      const two = parseInt(row.slice(c, c + 2), 10);
      if (two <= MAX_FRET) return [two, 2];
    }
    return [parseInt(row[c], 10), 1];
  };

  let c = 0;
  while (c < len) {
    if (rows.some((r) => r[c] === '|')) { flush(); c++; continue; }
    if (!rows.some((r) => isDigit(r[c]))) { c++; continue; }
    const notes: (TabNote | undefined)[] = new Array(rows.length);
    let end = c + 1;
    rows.forEach((r, s) => {
      if (isDigit(r[c]) && !isDigit(r[c - 1])) {
        const [fret, w] = readFret(r, c);
        notes[s] = { string: s + 1, fret };
        const a = r[c + w];
        if (ARTICULATIONS.has(a)) notes[s]!.articulation = a as Articulation;
        end = Math.max(end, c + w);
      }
    });
    // notes starting inside a 2-digit fret's columns belong to the same chord
    for (let k = c + 1; k < end; k++) {
      rows.forEach((r, s) => {
        if (!notes[s] && isDigit(r[k]) && !isDigit(r[k - 1])) {
          const [fret, w] = readFret(r, k);
          notes[s] = { string: s + 1, fret };
          const a = r[k + w];
          if (ARTICULATIONS.has(a)) notes[s]!.articulation = a as Articulation;
          end = Math.max(end, k + w);
        }
      });
    }
    if (rhythmRow) {
      for (let k = c; k < end; k++) {
        const t = RHYTHM_MAP[rhythmRow[k]?.toLowerCase() ?? ''];
        if (t) { duration = { type: t, dots: rhythmRow[k + 1] === '.' ? 1 : 0 }; break; }
      }
    }
    current.push({ notes: notes.filter((x): x is TabNote => !!x), duration });
    c = end;
  }
  flush();
  return duration;
}
