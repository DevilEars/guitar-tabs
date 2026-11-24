import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { renderWav, type PlaybackNote } from '@guitar-tabs/core';

/**
 * Android/iOS preview: render the notes to a WAV in shared code (Karplus-Strong pluck, @guitar-tabs/core),
 * write it to the cache directory, and play it with expo-audio.
 */
export const playbackSupported = true;

let player: AudioPlayer | null = null;
let finishTimer: ReturnType<typeof setTimeout> | null = null;
let counter = 0;

export async function play(notes: PlaybackNote[], onEnd?: () => void): Promise<void> {
  stop();
  const wav = renderWav(notes, { sampleRate: 22050 });
  // New name each time so the player never serves a cached older render.
  const file = new File(Paths.cache, `preview-${Date.now()}-${counter++}.wav`);
  file.create();
  file.write(wav);
  await setAudioModeAsync({ playsInSilentMode: true });
  const p = createAudioPlayer({ uri: file.uri });
  player = p;
  const finish = () => {
    if (player !== p) return;
    stop();
    try { file.delete(); } catch { /* cache cleanup is best effort */ }
    onEnd?.();
  };
  p.addListener('playbackStatusUpdate', (s) => { if (s.didJustFinish) finish(); });
  // Fallback in case no finish event arrives.
  const seconds = (wav.length - 44) / 2 / 22050;
  finishTimer = setTimeout(finish, (seconds + 1) * 1000);
  p.play();
}

export function stop(): void {
  if (finishTimer) { clearTimeout(finishTimer); finishTimer = null; }
  if (player) {
    const p = player;
    player = null;
    try { p.pause(); } catch { /* already released */ }
    p.remove();
  }
}
