import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import { XMLValidator } from 'fast-xml-parser';
import { parseTab, tabToScore, scoreToMusicXml, musicXmlToScore, scoreToMidi, scoreToTab, scoreToPlayback, DROP_D_TUNING } from '../src';

const SRC = `
   q   e   e   q.      e
e|-0---1---3---0-------1--|-----------------|
B|-1-------------------3--|-----------------|
G|-0----------------------|-----------------|
D|-2----------------------|---------2---0---|
A|-3----------------------|-----3-------3---|
E|------------------------|-0---------------|
`;

describe('MusicXML', () => {
  const tab = parseTab(SRC);
  const score = tabToScore(tab);
  const xml = scoreToMusicXml(score, { title: 'Test & <riff>', tuning: tab.tuning });

  it('is well-formed XML with the expected structure', () => {
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain('<score-partwise version="4.0">');
    expect(xml).toContain('<clef-octave-change>-1</clef-octave-change>');
    expect(xml).toContain('Test &amp; &lt;riff>');
    expect((xml.match(/<measure /g) ?? []).length).toBe(2);
    expect((xml.match(/<chord\/>/g) ?? []).length).toBe(4 + 1 + 1);
    expect(xml).toContain('<pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>1</voice><type>quarter</type>');
    expect(xml).toContain('<type>quarter</type><dot/>');
  });

  it('measure durations add up (divisions=8)', () => {
    const measures = xml.split('<measure ').slice(1);
    const sums = measures.map((m) =>
      m.split('<note>').slice(1).filter((n) => !n.includes('<chord/>')).reduce((s, n) => s + Number(/<duration>(\d+)<\/duration>/.exec(n)![1]), 0),
    );
    expect(sums).toEqual([8 + 4 + 4 + 12 + 4, 4 * 4]);
  });

  it('imports its own export: notes, rhythm, tuning and tab positions survive', () => {
    const imported = musicXmlToScore(xml);
    expect(imported.warnings).toEqual([]);
    expect(imported.tuning).toEqual(tab.tuning);
    expect(imported.score).toEqual(score);
    expect(scoreToTab(imported.score, imported.tuning!, { respectHints: true }).tab).toEqual(tab);
  });

  it('imports simple third-party MusicXML without tab info and fingers it', () => {
    const external = `<?xml version="1.0"?>
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Gtr</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>E</step><octave>2</octave></pitch><duration>2</duration><type>quarter</type></note>
<note><rest/><duration>2</duration><type>quarter</type></note>
<note><pitch><step>B</step><alter>-1</alter><octave>2</octave></pitch><duration>1</duration></note>
<note><chord/><pitch><step>D</step><octave>3</octave></pitch><duration>1</duration></note>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>1</duration><type>eighth</type></note>
</measure></part></score-partwise>`;
    const { score: s, warnings } = musicXmlToScore(external);
    expect(warnings).toEqual([]);
    expect(s.time).toEqual({ beats: 3, beatType: 4 });
    expect(s.measures[0].notes.map((n) => n.pitches.map((p) => p.name).join('+'))).toEqual(['E2', '', 'Bb2+D3', 'G3']);
    expect(s.measures[0].notes[2].duration).toEqual({ type: '8', dots: 0 });
    const t = scoreToTab(s, DROP_D_TUNING).tab;
    expect(t.measures[0].events[1].notes).toEqual([]);
    expect(t.measures[0].events[0].notes).toEqual([{ string: 6, fret: 2 }]);
  });
});

describe('MIDI', () => {
  const score = tabToScore(parseTab(SRC), { tempo: 120 });
  const bytes = scoreToMidi(score);

  it('writes a valid SMF that an independent parser reads back', () => {
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    const midi = new Midi(bytes);
    expect(midi.header.ppq).toBe(480);
    expect(Math.round(midi.header.tempos[0].bpm)).toBe(120);
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([4, 4]);
    const notes = midi.tracks.flatMap((t) => t.notes);
    const expected = scoreToPlayback(score);
    expect(notes.map((n) => n.midi)).toEqual(expected.map((n) => n.midi));
    expect(notes.map((n) => n.ticks)).toEqual(expected.map((n) => Math.round(n.time * 2 * 480)));
    expect(midi.tracks[0].instrument.number).toBe(25);
  });

  it('playback timeline matches rhythm', () => {
    const pb = scoreToPlayback(score);
    // tempo 120: quarter = 0.5s. First chord at 0, then e at 0.5, e at 0.75, q. at 1.0, e at 1.75, second bar: 4 eighths from 2.0
    expect([...new Set(pb.map((n) => n.time))]).toEqual([0, 0.5, 0.75, 1, 1.75, 2, 2.25, 2.5, 2.75]);
  });
});
