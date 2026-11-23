import type { Duration, Pitch } from './types';

const SHARP_NAMES: [string, number][] = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
];
const FLAT_NAMES: [string, number][] = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0],
  ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
];
const STEP_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface SpellOptions {
  preferFlats?: boolean;
}

/** MIDI number -> spelled pitch. Octave uses scientific pitch notation (MIDI 60 = C4). */
export function midiToPitch(midi: number, opts: SpellOptions = {}): Pitch {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new RangeError(`Invalid MIDI number ${midi}`);
  const pc = midi % 12;
  const [step, alter] = (opts.preferFlats ? FLAT_NAMES : SHARP_NAMES)[pc];
  const octave = Math.floor(midi / 12) - 1;
  return { midi, step, alter, octave, name: `${step}${alter === 1 ? '#' : alter === -1 ? 'b' : ''}${octave}` };
}

export function stepToMidi(step: string, alter: number, octave: number): number {
  const s = STEP_SEMITONE[step.toUpperCase()];
  if (s === undefined) throw new Error(`Invalid step ${step}`);
  return (octave + 1) * 12 + s + alter;
}

/** Parse "C#4", "Eb2", "a3" -> MIDI number. */
export function noteNameToMidi(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`Invalid note name "${name}"`);
  return stepToMidi(m[1], m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, parseInt(m[3], 10));
}

/** Length of a duration in quarter notes. */
export function durationQuarters(d: Duration): number {
  const base = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 }[d.type];
  return d.dots ? base * 1.5 : base;
}

export const EIGHTH: Duration = { type: '8', dots: 0 };
