import { midiToPitch } from './pitch';

/** Standard tuning, string 1 (high e) first: E4 B3 G3 D3 A2 E2. */
export const STANDARD_TUNING: readonly number[] = [64, 59, 55, 50, 45, 40];
export const DROP_D_TUNING: readonly number[] = [64, 59, 55, 50, 45, 38];
export const MAX_FRET = 24;

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function labelPitchClass(label: string): number | undefined {
  const m = /^([A-Ga-g])([#b]?)/.exec(label);
  if (!m) return undefined;
  const base = PC[m[1].toUpperCase()];
  return (base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/**
 * Infer a tuning from string labels like ["e","B","G","D","A","D"].
 * Each string is moved to the nearest pitch (within +-6 semitones) of the
 * corresponding standard string that has the labelled pitch class. Labels
 * with an explicit octave ("D2") are taken literally.
 */
export function inferTuningFromLabels(labels: (string | undefined)[], base: readonly number[] = STANDARD_TUNING): number[] {
  return base.map((open, i) => {
    const label = labels[i];
    if (!label) return open;
    const withOctave = /^([A-Ga-g])([#b]?)(\d)$/.exec(label);
    const pc = labelPitchClass(label);
    if (pc === undefined) return open;
    if (withOctave) {
      return (parseInt(withOctave[3], 10) + 1) * 12 + pc;
    }
    let diff = (pc - (open % 12) + 12) % 12;
    if (diff > 6) diff -= 12;
    return open + diff;
  });
}

/** Labels for printing: note names without octave; highest string lower-case if it duplicates the lowest name. */
export function tuningLabels(tuning: readonly number[]): string[] {
  const names = tuning.map((m) => midiToPitch(m).name.replace(/-?\d+$/, ''));
  const last = names[names.length - 1];
  if (names.length > 1 && names[0] === last) names[0] = names[0].toLowerCase();
  return names;
}
