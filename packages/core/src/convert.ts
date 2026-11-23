import type { Score, ScoreMeasure, ScoreNote, Tab, TabNote, TimeSignature } from './types';
import { durationQuarters, midiToPitch, type SpellOptions } from './pitch';
import { fingerScore, type FingeringOptions, type FingeringResult } from './fingering';

export interface TabToScoreOptions extends SpellOptions {
  time?: TimeSignature;
  tempo?: number;
  /**
   * If the tab has no bar lines (a single long measure), split it into measures of `time`.
   * Default true.
   */
  autoBar?: boolean;
}

/** MIDI (sounding) pitch of a string/fret. */
export function fretToMidi(tuning: readonly number[], string: number, fret: number): number {
  const open = tuning[string - 1];
  if (open === undefined) throw new RangeError(`String ${string} does not exist in a ${tuning.length}-string tuning`);
  return open + fret;
}

/**
 * Tab -> standard notation.
 * Pitches are concert (sounding) pitch. Guitar music is conventionally written one octave higher than it
 * sounds; renderers should use a treble clef with an "8" below (treble 8vb) - MusicXML export does this via
 * <clef-octave-change>-1</clef-octave-change>, and the app's VexFlow view shifts the written notes up an octave.
 */
export function tabToScore(tab: Tab, opts: TabToScoreOptions = {}): Score {
  const time = opts.time ?? { beats: 4, beatType: 4 };
  const notes = (m: Tab['measures'][number]): ScoreNote[] =>
    m.events.map((ev) => {
      const sorted = [...ev.notes].sort((a, b) => fretToMidi(tab.tuning, a.string, a.fret) - fretToMidi(tab.tuning, b.string, b.fret));
      return {
        pitches: sorted.map((n) => midiToPitch(fretToMidi(tab.tuning, n.string, n.fret), opts)),
        duration: ev.duration,
        positions: sorted.map((n): TabNote => ({ ...n })),
      };
    });
  let measures: ScoreMeasure[] = tab.measures.map((m) => ({ notes: notes(m) }));
  if ((opts.autoBar ?? true) && measures.length === 1) {
    const cap = (time.beats * 4) / time.beatType;
    const split: ScoreMeasure[] = [];
    let cur: ScoreNote[] = [];
    let len = 0;
    for (const n of measures[0].notes) {
      const q = durationQuarters(n.duration);
      if (len + q > cap + 1e-9 && cur.length) { split.push({ notes: cur }); cur = []; len = 0; }
      cur.push(n);
      len += q;
    }
    if (cur.length) split.push({ notes: cur });
    measures = split;
  }
  return { measures, time, tempo: opts.tempo ?? 100 };
}

/**
 * Standard notation -> tab. Positions are chosen by `fingerScore` (ignores any string/fret hints unless
 * `respectHints` is set).
 */
export function scoreToTab(score: Score, tuning: readonly number[], opts: FingeringOptions & { respectHints?: boolean } = {}): FingeringResult {
  return fingerScore(score, tuning, opts);
}
