import type { PlaybackNote } from '@guitar-tabs/core';

/** Android/iOS audio preview is not implemented yet (needs a native synth or a rendered WAV via expo-audio). */
export const playbackSupported = false;
export async function play(_notes: PlaybackNote[], _onEnd?: () => void): Promise<void> {
  throw new Error('Audio preview is not available on this platform yet');
}
export function stop(): void {}
