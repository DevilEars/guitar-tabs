import { XMLParser } from 'fast-xml-parser';
import type { Duration, DurationType, Score, ScoreMeasure, ScoreNote, TabNote } from './types';
import { durationQuarters, midiToPitch, stepToMidi } from './pitch';

/** Divisions per quarter note. 8 covers dotted 16ths. */
const DIVISIONS = 8;
const TYPE_NAME: Record<DurationType, string> = { w: 'whole', h: 'half', q: 'quarter', '8': 'eighth', '16': '16th' };
const NAME_TYPE: Record<string, DurationType> = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', '16th': '16' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export interface MusicXmlOptions {
  title?: string;
  /** Tuning to emit in <staff-details> (string 1 first). */
  tuning?: readonly number[];
  /** Include <technical><string/><fret/> for notes that have positions. Default true. */
  includeTab?: boolean;
}

/**
 * Score -> MusicXML 4.0 partwise. Pitches are sounding pitch; the clef is treble with
 * clef-octave-change -1 (standard guitar "treble 8vb"), which is how MuseScore and others encode guitar.
 */
export function scoreToMusicXml(score: Score, opts: MusicXmlOptions = {}): string {
  const includeTab = opts.includeTab ?? true;
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  out.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  out.push('<score-partwise version="4.0">');
  out.push(`  <work><work-title>${esc(opts.title ?? 'Untitled')}</work-title></work>`);
  out.push('  <part-list>');
  out.push('    <score-part id="P1"><part-name>Guitar</part-name>');
  out.push('      <score-instrument id="P1-I1"><instrument-name>Acoustic Guitar (steel)</instrument-name></score-instrument>');
  out.push('      <midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>26</midi-program></midi-instrument>');
  out.push('    </score-part>');
  out.push('  </part-list>');
  out.push('  <part id="P1">');
  score.measures.forEach((m, i) => {
    out.push(`    <measure number="${i + 1}">`);
    if (i === 0) {
      out.push('      <attributes>');
      out.push(`        <divisions>${DIVISIONS}</divisions>`);
      out.push('        <key><fifths>0</fifths></key>');
      out.push(`        <time><beats>${score.time.beats}</beats><beat-type>${score.time.beatType}</beat-type></time>`);
      out.push('        <clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>');
      if (opts.tuning) {
        out.push(`        <staff-details><staff-lines>${opts.tuning.length}</staff-lines>`);
        // MusicXML staff-tuning line 1 = lowest string
        [...opts.tuning].reverse().forEach((midi, k) => {
          const p = midiToPitch(midi);
          out.push(`          <staff-tuning line="${k + 1}"><tuning-step>${p.step}</tuning-step>${p.alter ? `<tuning-alter>${p.alter}</tuning-alter>` : ''}<tuning-octave>${p.octave}</tuning-octave></staff-tuning>`);
        });
        out.push('        </staff-details>');
      }
      out.push('      </attributes>');
      out.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${score.tempo}</per-minute></metronome></direction-type><sound tempo="${score.tempo}"/></direction>`);
    }
    for (const n of m.notes) out.push(...noteXml(n, includeTab));
    out.push('    </measure>');
  });
  out.push('  </part>');
  out.push('</score-partwise>');
  return out.join('\n') + '\n';
}

function noteXml(n: ScoreNote, includeTab: boolean): string[] {
  const dur = Math.round(durationQuarters(n.duration) * DIVISIONS);
  const tail = `<duration>${dur}</duration><voice>1</voice><type>${TYPE_NAME[n.duration.type]}</type>${n.duration.dots ? '<dot/>' : ''}`;
  if (n.pitches.length === 0) return [`      <note><rest/>${tail}</note>`];
  return n.pitches.map((p, k) => {
    const pitch = `<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>`;
    const acc = p.alter === 1 ? '<accidental>sharp</accidental>' : p.alter === -1 ? '<accidental>flat</accidental>' : '';
    const pos = n.positions?.[k];
    const tech = includeTab && pos ? `<notations><technical><string>${pos.string}</string><fret>${pos.fret}</fret></technical></notations>` : '';
    return `      <note>${k > 0 ? '<chord/>' : ''}${pitch}${tail}${acc}${tech}</note>`;
  });
}

const arr = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

export interface MusicXmlImport {
  score: Score;
  /** Tuning from <staff-details>, if present (string 1 first). */
  tuning?: number[];
  warnings: string[];
}

/**
 * Simple MusicXML (partwise) import: first part, voice 1 only, notes/chords/rests, divisions, time, tempo,
 * and <technical><string>/<fret> positions. Ties, tuplets, multiple voices and backup/forward are ignored.
 */
export function musicXmlToScore(xml: string): MusicXmlImport {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    isArray: (name) => ['part', 'measure', 'note', 'staff-tuning', 'direction'].includes(name),
  });
  const doc = parser.parse(xml);
  const root = doc['score-partwise'];
  if (!root) throw new Error('Only <score-partwise> MusicXML is supported');
  const part = arr(root.part)[0];
  if (!part) throw new Error('MusicXML has no <part>');
  const warnings: string[] = [];
  let divisions = 1;
  let time = { beats: 4, beatType: 4 };
  let tempo = 100;
  let tuning: number[] | undefined;
  const measures: ScoreMeasure[] = [];
  for (const m of arr<any>(part.measure)) {
    const attrs = m.attributes;
    if (attrs?.divisions) divisions = Number(attrs.divisions);
    if (attrs?.time) time = { beats: Number(attrs.time.beats), beatType: Number(attrs.time['beat-type']) };
    const st = attrs?.['staff-details']?.['staff-tuning'];
    if (st) {
      const byLine = arr<any>(st).map((t) => ({ line: Number(t['@line']), midi: stepToMidi(t['tuning-step'], Number(t['tuning-alter'] ?? 0), Number(t['tuning-octave'])) }));
      tuning = byLine.sort((a, b) => b.line - a.line).map((t) => t.midi);
    }
    for (const d of arr<any>(m.direction)) {
      const t = d?.sound?.['@tempo'];
      if (t) tempo = Number(t);
    }
    const notes: ScoreNote[] = [];
    for (const n of arr<any>(m.note)) {
      const v = n.voice !== undefined ? String(n.voice) : '1';
      if (v !== '1') continue;
      if (n.grace !== undefined) continue;
      const duration = parseDuration(n, divisions, warnings);
      const isChord = n.chord !== undefined;
      const target = isChord && notes.length ? notes[notes.length - 1] : undefined;
      if (n.rest !== undefined) {
        if (!target) notes.push({ pitches: [], duration });
        continue;
      }
      const p = n.pitch;
      const midi = stepToMidi(p.step, Number(p.alter ?? 0), Number(p.octave));
      const pitch = midiToPitch(midi, { preferFlats: Number(p.alter ?? 0) < 0 });
      const tech = n.notations?.technical;
      const pos: TabNote | undefined = tech?.string !== undefined && tech?.fret !== undefined ? { string: Number(tech.string), fret: Number(tech.fret) } : undefined;
      if (target) {
        target.pitches.push(pitch);
        target.positions?.push(pos);
      } else {
        notes.push({ pitches: [pitch], duration, positions: [pos] });
      }
    }
    for (const n of notes) {
      // keep pitches sorted low->high, positions aligned
      const idx = n.pitches.map((_, i) => i).sort((a, b) => n.pitches[a].midi - n.pitches[b].midi);
      n.pitches = idx.map((i) => n.pitches[i]);
      if (n.positions) n.positions = idx.map((i) => n.positions![i]);
      if (n.positions?.every((x) => x === undefined)) delete n.positions;
    }
    measures.push({ notes });
  }
  return { score: { measures, time, tempo }, tuning, warnings };
}

function parseDuration(n: any, divisions: number, warnings: string[]): Duration {
  const type = NAME_TYPE[String(n.type ?? '')];
  if (type) return { type, dots: n.dot !== undefined ? 1 : 0 };
  // fall back to <duration>
  const q = Number(n.duration ?? divisions) / divisions;
  const table: [number, Duration][] = [
    [4, { type: 'w', dots: 0 }], [3, { type: 'h', dots: 1 }], [2, { type: 'h', dots: 0 }], [1.5, { type: 'q', dots: 1 }],
    [1, { type: 'q', dots: 0 }], [0.75, { type: '8', dots: 1 }], [0.5, { type: '8', dots: 0 }], [0.375, { type: '16', dots: 1 }], [0.25, { type: '16', dots: 0 }],
  ];
  const hit = table.find(([v]) => Math.abs(v - q) < 1e-6);
  if (!hit) warnings.push(`Unsupported duration ${q} quarters; using eighth`);
  return hit ? hit[1] : { type: '8', dots: 0 };
}
