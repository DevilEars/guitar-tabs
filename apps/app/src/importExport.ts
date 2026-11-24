import {
  formatTab, musicXmlToScore, parseTab, scoreToMidi, scoreToMusicXml, scoreToTab, tabToScore, STANDARD_TUNING, type Score,
} from '@guitar-tabs/core';
import type { NewTab, TabDoc } from '@guitar-tabs/library';

export const BLANK_TAB = `e|----------------|
B|----------------|
G|----------------|
D|----------------|
A|----------------|
E|----------------|
`;

/** A file the user picked -> a new tab. MusicXML is converted to tab with the fingering algorithm. */
export function fileToNewTab(name: string, text: string): { tab: NewTab; warnings: string[] } {
  const base = name.replace(/\.(txt|tab|musicxml|xml)$/i, '') || 'Imported tab';
  const isXml = /\.(musicxml|xml)$/i.test(name) || text.trimStart().startsWith('<');
  if (isXml) {
    const imp = musicXmlToScore(text);
    const tuning = imp.tuning ?? [...STANDARD_TUNING];
    const res = scoreToTab(imp.score, tuning, { respectHints: true });
    const title = /<work-title>([^<]*)<\/work-title>/.exec(text)?.[1]?.trim() || base;
    return { tab: { title, tuning, tempo: imp.score.tempo, content: formatTab(res.tab) }, warnings: [...imp.warnings, ...res.warnings] };
  }
  parseTab(text); // throws a readable error if there's no tab in the file
  return { tab: { title: base, tuning: [], content: text }, warnings: [] };
}

export interface Rendered {
  score: Score | null;
  tuning: number[];
  error: string | null;
}

/** tuning [] = infer from string labels (standard if none). */
export function renderDoc(doc: Pick<TabDoc, 'content' | 'tuning' | 'tempo'>): Rendered {
  try {
    const tab = parseTab(doc.content, doc.tuning.length ? { tuning: doc.tuning } : {});
    return { score: tabToScore(tab, { tempo: doc.tempo }), tuning: tab.tuning, error: null };
  } catch (e) {
    return { score: null, tuning: doc.tuning.length ? doc.tuning : [...STANDARD_TUNING], error: e instanceof Error ? e.message : String(e) };
  }
}

export const exportMidi = (score: Score) => scoreToMidi(score);
export const exportMusicXml = (score: Score, title: string, tuning: number[]) => scoreToMusicXml(score, { title, tuning });
