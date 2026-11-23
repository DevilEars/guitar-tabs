import { describe, expect, it } from 'vitest';
import { parseTab, tabToScore, scoreToTab, fretToMidi, midiToPitch, noteNameToMidi, STANDARD_TUNING, DROP_D_TUNING, formatTab } from '../src';
import type { Score } from '../src';

const pitchNames = (score: Score) => score.measures.flatMap((m) => m.notes.map((n) => n.pitches.map((p) => p.name).join('+')));

describe('tab -> pitch', () => {
  it('maps open strings in standard tuning to E2 A2 D3 G3 B3 E4', () => {
    expect([6, 5, 4, 3, 2, 1].map((s) => midiToPitch(fretToMidi(STANDARD_TUNING, s, 0)).name)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  });

  it('maps frets including 24 and honours tuning', () => {
    expect(midiToPitch(fretToMidi(STANDARD_TUNING, 1, 24)).name).toBe('E6');
    expect(midiToPitch(fretToMidi(STANDARD_TUNING, 3, 1)).name).toBe('G#3');
    expect(midiToPitch(fretToMidi(STANDARD_TUNING, 3, 1), { preferFlats: true }).name).toBe('Ab3');
    expect(midiToPitch(fretToMidi(DROP_D_TUNING, 6, 0)).name).toBe('D2');
    expect(noteNameToMidi('C4')).toBe(60);
  });

  it('converts a tab to a score with chords sorted low->high', () => {
    const tab = parseTab(`
e|-0---|
B|-1---|
G|-0---|
D|-2---|
A|-3---|
E|---5-|
`);
    const score = tabToScore(tab);
    expect(pitchNames(score)).toEqual(['C3+E3+G3+C4+E4', 'A2']);
    expect(score.measures[0].notes[0].duration).toEqual({ type: '8', dots: 0 });
  });

  it('auto-bars an unbarred tab into 4/4 measures', () => {
    const tab = parseTab(`
e|-0-0-0-0-0-0-0-0-0-0-
B|---------------------
G|---------------------
D|---------------------
A|---------------------
E|---------------------
`);
    const score = tabToScore(tab);
    expect(score.measures.map((m) => m.notes.length)).toEqual([8, 2]);
  });
});

describe('pitch -> tab fingering', () => {
  const score = (names: string[][]): Score => ({
    time: { beats: 4, beatType: 4 },
    tempo: 100,
    measures: [{ notes: names.map((ch) => ({ pitches: ch.map((n) => midiToPitch(noteNameToMidi(n))), duration: { type: '8', dots: 0 } })) }],
  });

  it('prefers open position for a C major scale', () => {
    const { tab, warnings } = scoreToTab(score([['C3'], ['D3'], ['E3'], ['F3'], ['G3'], ['A3'], ['B3'], ['C4']]), STANDARD_TUNING);
    expect(warnings).toEqual([]);
    expect(tab.measures[0].events.map((e) => e.notes.map((n) => `${n.string}:${n.fret}`).join())).toEqual([
      '5:3', '4:0', '4:2', '4:3', '3:0', '3:2', '2:0', '2:1',
    ]);
  });

  it('fingers chords with one note per string and a playable span', () => {
    const { tab } = scoreToTab(score([['C3', 'E3', 'G3', 'C4', 'E4'], ['A2', 'E3', 'A3', 'C#4', 'E4'], ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4']]), STANDARD_TUNING);
    for (const ev of tab.measures[0].events) {
      const strings = ev.notes.map((n) => n.string);
      expect(new Set(strings).size).toBe(strings.length);
      const fretted = ev.notes.map((n) => n.fret).filter((f) => f > 0);
      expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4);
      expect(ev.notes.every((n) => n.fret >= 0 && n.fret <= 24)).toBe(true);
    }
    expect(formatTab(tab).split('\n').slice(0, 6)).toEqual([
      'e|-0-0-0-|',
      'B|-1-2-0-|',
      'G|-0-2-1-|',
      'D|-2-2-2-|',
      'A|-3-0-2-|',
      'E|-----0-|',
    ]);
  });

  it('minimises hand movement: a high melody stays in position instead of jumping to open strings', () => {
    // A minor pentatonic lick: fits the 5th-position box (B5 B8 e5 e8) without shifting
    const { tab } = scoreToTab(score([['E4'], ['G4'], ['A4'], ['C5'], ['A4'], ['G4'], ['E4']]), STANDARD_TUNING);
    // No hand shifts: every fretted note lies in one 4-fret window (open strings are free, e.g. open e for E4)
    const fretted = tab.measures[0].events.map((e) => e.notes[0].fret).filter((f) => f > 0);
    expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
    expect(tab.measures[0].events[3].notes).toEqual([{ string: 1, fret: 8 }]);
  });

  it('drops out-of-range notes with a warning', () => {
    const { tab, warnings } = scoreToTab(score([['C2'], ['E2']]), STANDARD_TUNING);
    expect(warnings[0]).toMatch(/out of guitar range/);
    expect(tab.measures[0].events[0].notes).toEqual([]);
    expect(tab.measures[0].events[1].notes).toEqual([{ string: 6, fret: 0 }]);
  });

  it('uses the tuning it is given (drop D low D on the open 6th string)', () => {
    const { tab } = scoreToTab(score([['D2']]), DROP_D_TUNING);
    expect(tab.measures[0].events[0].notes).toEqual([{ string: 6, fret: 0 }]);
  });
});

describe('round trip tab -> notation -> tab', () => {
  const cases = [
    `
e|-----------------|-----------------|
B|-----------------|-----------------|
G|-----------------|-------------0---|
D|---------2---0---|-----------------|
A|-----3-------3---|---0---2---3-----|
E|-0---------------|-3---------------|
`,
    `
   q   q   h
e|-0---3---0---|
B|-1---0---1---|
G|-0---0---2---|
D|-2---0---2---|
A|-3---2---0---|
E|-----3-------|
`,
  ];
  it.each(cases)('re-fingering reproduces the same positions for open-position tabs (%#)', (src) => {
    const tab = parseTab(src);
    const back = scoreToTab(tabToScore(tab), tab.tuning).tab;
    expect(back).toEqual(tab);
  });

  it('always preserves pitches and rhythm, even when positions differ', () => {
    const tab = parseTab(`
e|-------------|
B|-------------|
G|-------------|
D|-------------|
A|--5--7--5----|
E|-------------|
`);
    const score = tabToScore(tab);
    const back = scoreToTab(score, tab.tuning).tab;
    expect(pitchNames(tabToScore(back))).toEqual(pitchNames(score));
    expect(back.measures[0].events.map((e) => e.duration)).toEqual(tab.measures[0].events.map((e) => e.duration));
  });

  it('with respectHints, keeps the original positions exactly', () => {
    const tab = parseTab(`
e|-------------|
B|-------------|
G|-------------|
D|-------------|
A|--5--7--5----|
E|-------------|
`);
    const back = scoreToTab(tabToScore(tab), tab.tuning, { respectHints: true }).tab;
    expect(back.measures[0].events.map((e) => e.notes)).toEqual(tab.measures[0].events.map((e) => e.notes.map(({ string, fret }) => ({ string, fret }))));
  });
});
