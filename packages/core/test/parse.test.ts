import { describe, expect, it } from 'vitest';
import { parseTab, formatTab, TabParseError, STANDARD_TUNING, DROP_D_TUNING } from '../src';

const RIFF = `
e|-----------------|-----------------|
B|-----------------|-----------------|
G|-----------------|-----------------|
D|---------2---0---|-------------5---|
A|-----3-------3---|---0---2---3-----|
E|-0---------------|-3---------------|
`;

describe('parseTab', () => {
  it('parses single notes, bars, standard tuning and default eighth durations', () => {
    const tab = parseTab(RIFF);
    expect(tab.tuning).toEqual([...STANDARD_TUNING]);
    expect(tab.measures).toHaveLength(2);
    expect(tab.measures[0].events.map((e) => e.notes)).toEqual([
      [{ string: 6, fret: 0 }],
      [{ string: 5, fret: 3 }],
      [{ string: 4, fret: 2 }],
      [{ string: 4, fret: 0 }, { string: 5, fret: 3 }],
    ]);
    expect(tab.measures[0].events.every((e) => e.duration.type === '8' && e.duration.dots === 0)).toBe(true);
  });

  it('parses stacked chords and two-digit frets', () => {
    const tab = parseTab(`
e|--0---12--|
B|--1---12--|
G|--0---13--|
D|--2---14--|
A|--3---14--|
E|------12--|
`);
    const [c, e] = tab.measures[0].events;
    expect(c.notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['1:0', '2:1', '3:0', '4:2', '5:3']);
    expect(e.notes.map((n) => n.fret)).toEqual([12, 12, 13, 14, 14, 12]);
  });

  it('treats a single digit inside a two-digit fret column as part of the same chord', () => {
    const tab = parseTab(`
e|--10--|
B|---8--|
G|------|
D|------|
A|------|
E|------|
`);
    expect(tab.measures[0].events).toHaveLength(1);
    expect(tab.measures[0].events[0].notes).toEqual([{ string: 1, fret: 10 }, { string: 2, fret: 8 }]);
  });

  it('keeps h/p/slide articulations', () => {
    const tab = parseTab(`
e|-------------|
B|-------------|
G|--5h7p5--7/9-|
D|-------------|
A|-------------|
E|-------------|
`);
    expect(tab.measures[0].events.map((e) => e.notes[0])).toEqual([
      { string: 3, fret: 5, articulation: 'h' },
      { string: 3, fret: 7, articulation: 'p' },
      { string: 3, fret: 5 },
      { string: 3, fret: 7, articulation: '/' },
      { string: 3, fret: 9 },
    ]);
  });

  it('reads an optional rhythm line (sticky markers, dots)', () => {
    const tab = parseTab(`
   q   e   e   q.      e
e|-0---1---3---0-------1--|
B|------------------------|
G|------------------------|
D|------------------------|
A|------------------------|
E|------------------------|
`);
    expect(tab.measures[0].events.map((e) => e.duration)).toEqual([
      { type: 'q', dots: 0 }, { type: '8', dots: 0 }, { type: '8', dots: 0 }, { type: 'q', dots: 1 }, { type: '8', dots: 0 },
    ]);
  });

  it('infers drop-D tuning from labels and accepts an explicit tuning', () => {
    const text = `
e|---|
B|---|
G|---|
D|-0-|
A|-0-|
D|-0-|
`;
    expect(parseTab(text).tuning).toEqual([...DROP_D_TUNING]);
    expect(parseTab(text, { tuning: STANDARD_TUNING }).tuning).toEqual([...STANDARD_TUNING]);
  });

  it('handles multiple systems and tabs without labels', () => {
    const tab = parseTab(`
|-0-|
|---|
|---|
|---|
|---|
|---|

|---|
|-1-|
|---|
|---|
|---|
|---|
`);
    expect(tab.measures.map((m) => m.events[0].notes[0])).toEqual([{ string: 1, fret: 0 }, { string: 2, fret: 1 }]);
  });

  it('errors clearly on malformed input', () => {
    expect(() => parseTab('hello world')).toThrow(TabParseError);
    expect(() => parseTab('e|---0---|\nB|---1---|\n')).toThrow(/multiple of 6/);
  });

  it('formatTab output parses back to the same model', () => {
    for (const src of [RIFF, `
   q   e   e   q.      e
e|-0---1---3---0-------1--|
B|------------------------|
G|-----------------10-----|
D|-----------------12-----|
A|------------------------|
E|------------------------|
`]) {
      const tab = parseTab(src);
      expect(parseTab(formatTab(tab))).toEqual(tab);
    }
  });
});
