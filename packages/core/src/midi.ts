import type { Score } from './types';
import { durationQuarters } from './pitch';

export interface PlaybackNote {
  midi: number;
  /** seconds */
  time: number;
  /** seconds */
  duration: number;
  velocity: number;
}

/** Flatten a score into timed notes (used by both the MIDI writer and live preview). */
export function scoreToPlayback(score: Score, opts: { tempo?: number; legato?: number } = {}): PlaybackNote[] {
  const tempo = opts.tempo ?? score.tempo;
  const spq = 60 / tempo;
  const legato = opts.legato ?? 0.95;
  const out: PlaybackNote[] = [];
  let t = 0;
  for (const m of score.measures) {
    for (const n of m.notes) {
      const len = durationQuarters(n.duration) * spq;
      for (const p of n.pitches) out.push({ midi: p.midi, time: t, duration: len * legato, velocity: 90 });
      t += len;
    }
  }
  return out;
}

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];

export interface MidiOptions {
  /** General MIDI program (0-based). Default 25 = Acoustic Guitar (steel). */
  program?: number;
  ppq?: number;
  tempo?: number;
}

/** Score -> Standard MIDI File (format 0, single track, channel 1). */
export function scoreToMidi(score: Score, opts: MidiOptions = {}): Uint8Array {
  const ppq = opts.ppq ?? 480;
  const tempo = opts.tempo ?? score.tempo;
  const program = opts.program ?? 25;
  type Ev = { tick: number; order: number; data: number[] };
  const evs: Ev[] = [];
  const usPerQuarter = Math.round(60_000_000 / tempo);
  evs.push({ tick: 0, order: 0, data: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff] });
  const dd = Math.round(Math.log2(score.time.beatType));
  evs.push({ tick: 0, order: 0, data: [0xff, 0x58, 0x04, score.time.beats, dd, 24, 8] });
  evs.push({ tick: 0, order: 0, data: [0xc0, program & 0x7f] });
  let tick = 0;
  for (const m of score.measures) {
    for (const n of m.notes) {
      const len = Math.round(durationQuarters(n.duration) * ppq);
      const off = Math.max(1, len - Math.round(len * 0.05));
      for (const p of n.pitches) {
        evs.push({ tick, order: 2, data: [0x90, p.midi, 90] });
        evs.push({ tick: tick + off, order: 1, data: [0x80, p.midi, 0] });
      }
      tick += len;
    }
  }
  evs.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track: number[] = [];
  let last = 0;
  for (const e of evs) {
    track.push(...vlq(e.tick - last), ...e.data);
    last = e.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  const bytes = [
    0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(0), ...u16(1), ...u16(ppq),
    0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track,
  ];
  return Uint8Array.from(bytes);
}
