import { describe, expect, it } from 'vitest';
import { parseTab, renderWav, scoreToPlayback, tabToScore } from '../src';

const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));

describe('renderWav', () => {
  const score = tabToScore(parseTab(`
e|-0---|
B|-----|
G|-----|
D|-----|
A|---0-|
E|-----|
`), { tempo: 120 });
  const notes = scoreToPlayback(score);
  const wav = renderWav(notes, { sampleRate: 22050 });
  const dv = new DataView(wav.buffer);

  it('writes a valid 16-bit mono PCM WAV header', () => {
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(ascii(wav, 12, 4)).toBe('fmt ');
    expect(dv.getUint16(20, true)).toBe(1);
    expect(dv.getUint16(22, true)).toBe(1);
    expect(dv.getUint32(24, true)).toBe(22050);
    expect(dv.getUint16(34, true)).toBe(16);
    expect(ascii(wav, 36, 4)).toBe('data');
    expect(dv.getUint32(4, true)).toBe(wav.length - 8);
    expect(dv.getUint32(40, true)).toBe(wav.length - 44);
  });

  it('length covers the notes plus tail; silence before a note, sound during it', () => {
    const lastEnd = Math.max(...notes.map((n) => n.time + n.duration));
    expect((wav.length - 44) / 2).toBe(Math.ceil((lastEnd + 0.6) * 22050));
    const sampleAt = (t: number) => dv.getInt16(44 + Math.floor(t * 22050) * 2, true);
    let maxFirst = 0;
    for (let t = 0.01; t < 0.2; t += 0.001) maxFirst = Math.max(maxFirst, Math.abs(sampleAt(t)));
    expect(maxFirst).toBeGreaterThan(1000);
    const peak = Math.max(...Array.from({ length: (wav.length - 44) / 2 }, (_, i) => Math.abs(dv.getInt16(44 + i * 2, true))));
    expect(peak).toBeGreaterThan(0.75 * 32767);
    expect(peak).toBeLessThanOrEqual(32767);
  });

  it('is deterministic and handles an empty score', () => {
    expect(renderWav(notes)).toEqual(renderWav(notes));
    expect(renderWav([]).length).toBe(44 + Math.ceil(0.6 * 22050) * 2);
  });
});
