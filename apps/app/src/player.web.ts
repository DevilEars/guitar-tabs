import type { PlaybackNote } from '@guitar-tabs/core';

let ctx: AudioContext | null = null;

export const playbackSupported = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);

/** Simple plucked-string-ish synth with Web Audio: the same note list the .mid export is built from. */
export async function play(notes: PlaybackNote[], onEnd?: () => void): Promise<void> {
  stop();
  const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  const ac = new AC();
  ctx = ac;
  await ac.resume();
  const master = ac.createGain();
  master.gain.value = 0.25;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3000;
  filter.connect(master).connect(ac.destination);
  const t0 = ac.currentTime + 0.1;
  let end = 0;
  for (const n of notes) {
    const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ac.createGain();
    const start = t0 + n.time;
    const stopAt = start + Math.max(0.15, n.duration) + 0.3;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime((n.velocity / 127) * 0.8, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, stopAt);
    osc.connect(g).connect(filter);
    osc.start(start);
    osc.stop(stopAt + 0.05);
    end = Math.max(end, stopAt);
  }
  setTimeout(() => {
    if (ctx === ac) { stop(); onEnd?.(); }
  }, (end - ac.currentTime + 0.2) * 1000);
}

export function stop(): void {
  if (ctx) { ctx.close().catch(() => {}); ctx = null; }
}
