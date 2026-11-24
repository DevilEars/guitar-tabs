import type { PlaybackNote } from './midi';

export interface WavOptions {
  sampleRate?: number;
  /** Seconds of tail after the last note ends. */
  tail?: number;
  /** Peak level 0..1 after normalisation. */
  gain?: number;
  /** Deterministic noise seed (Karplus-Strong excitation). */
  seed?: number;
}

/**
 * Render notes to a 16-bit mono PCM WAV with a Karplus-Strong plucked-string synth.
 * Pure TypeScript (no audio APIs), so the same bytes can be played by expo-audio on Android
 * or saved as a file anywhere.
 */
export function renderWav(notes: PlaybackNote[], opts: WavOptions = {}): Uint8Array {
  const sr = opts.sampleRate ?? 22050;
  const tail = opts.tail ?? 0.6;
  const end = notes.reduce((m, n) => Math.max(m, n.time + n.duration), 0) + tail;
  const length = Math.max(1, Math.ceil(end * sr));
  const mix = new Float32Array(length);
  let seed = opts.seed ?? 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000 - 0.5;
  };

  for (const n of notes) {
    const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
    const period = Math.max(2, Math.round(sr / freq));
    const buf = new Float32Array(period);
    for (let i = 0; i < period; i++) buf[i] = rand();
    const start = Math.floor(n.time * sr);
    const ringEnd = Math.min(length, start + Math.ceil((n.duration + 0.25) * sr));
    const releaseStart = start + Math.floor(n.duration * sr);
    const amp = (n.velocity / 127) * 0.5;
    // Lower notes ring longer: decay factor closer to 1.
    const decay = 0.996 - Math.min(0.01, freq / 200000);
    let idx = 0;
    for (let s = start; s < ringEnd; s++) {
      const next = (idx + 1) % period;
      const v = buf[idx];
      buf[idx] = decay * 0.5 * (v + buf[next]);
      idx = next;
      const release = s < releaseStart ? 1 : Math.max(0, 1 - (s - releaseStart) / (0.25 * sr));
      mix[s] += v * amp * release;
    }
  }

  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const scale = peak > 0 ? (opts.gain ?? 0.8) / peak : 0;

  const dataBytes = length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const dv = new DataView(out.buffer);
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ascii(36, 'data');
  dv.setUint32(40, dataBytes, true);
  for (let i = 0; i < length; i++) {
    const v = Math.max(-1, Math.min(1, mix[i] * scale));
    dv.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return out;
}
