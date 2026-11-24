// Shared VexFlow layout, used by the web NotationView and (transpiled and inlined by
// scripts/gen-notation-html.mjs) by the Android WebView page. Keep this file free of runtime
// imports: the VexFlow namespace and the score are passed in.
import type * as VexFlowNS from 'vexflow';
import type { Score, ScoreNote } from '@guitar-tabs/core';

type VF = typeof VexFlowNS;

const VF_DURATION: Record<string, string> = { w: 'w', h: 'h', q: 'q', '8': '8', '16': '16' };

/** Written guitar pitch = sounding + 1 octave (shown with a treble-8vb clef). */
function toStaveNote(vf: VF, n: ScoreNote) {
  const rest = n.pitches.length === 0;
  const keys = rest ? ['b/4'] : n.pitches.map((p) => `${p.step.toLowerCase()}${p.alter === 1 ? '#' : p.alter === -1 ? 'b' : ''}/${p.octave + 1}`);
  const note = new vf.StaveNote({ keys, duration: VF_DURATION[n.duration.type] + (rest ? 'r' : ''), dots: n.duration.dots });
  if (n.duration.dots) vf.Dot.buildAndAttach([note], { all: true });
  n.pitches.forEach((p, i) => {
    if (p.alter === 1) note.addModifier(new vf.Accidental('#'), i);
    if (p.alter === -1) note.addModifier(new vf.Accidental('b'), i);
  });
  return note;
}

/** Renders `score` as SVG into `el` (cleared first). Returns the drawn height in px. */
export function renderScore(vf: VF, el: HTMLElement, score: Score, width: number): number {
  el.innerHTML = '';
  const totalWidth = Math.max(320, width || 800);
  const widths = score.measures.map((m, i) => 40 + m.notes.length * 38 + (i === 0 ? 90 : 0));
  // lay out measures into lines
  const lines: number[][] = [[]];
  let used = 0;
  widths.forEach((w, i) => {
    const extra = lines[lines.length - 1].length === 0 && i > 0 ? 60 : 0;
    if (used + w + extra > totalWidth - 10 && lines[lines.length - 1].length) { lines.push([]); used = 0; }
    lines[lines.length - 1].push(i);
    used += w + (lines[lines.length - 1].length === 1 && i > 0 ? 60 : 0);
  });
  const lineHeight = 130;
  const height = lines.length * lineHeight + 20;
  const renderer = new vf.Renderer(el as HTMLDivElement, vf.Renderer.Backends.SVG);
  renderer.resize(totalWidth, height);
  const ctx = renderer.getContext();
  lines.forEach((line, li) => {
    let x = 5;
    line.forEach((mi, k) => {
      const first = k === 0;
      const w = widths[mi] + (first && mi > 0 ? 60 : 0);
      const stave = new vf.Stave(x, li * lineHeight + 10, w);
      if (first) stave.addClef('treble', 'default', '8vb');
      if (mi === 0) stave.addTimeSignature(`${score.time.beats}/${score.time.beatType}`);
      stave.setContext(ctx).draw();
      const notes = score.measures[mi].notes.map((n) => toStaveNote(vf, n));
      if (notes.length) {
        const voice = new vf.Voice({ numBeats: score.time.beats, beatValue: score.time.beatType }).setMode(vf.Voice.Mode.SOFT).addTickables(notes);
        const beams = vf.Beam.generateBeams(notes);
        new vf.Formatter().joinVoices([voice]).format([voice], Math.max(20, w - (stave.getNoteStartX() - x) - 15));
        voice.draw(ctx, stave);
        beams.forEach((b) => b.setContext(ctx).draw());
      }
      x += w;
    });
  });
  return height;
}
