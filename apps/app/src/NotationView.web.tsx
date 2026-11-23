import { useEffect, useRef, useState } from 'react';
import { Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import type { Score, ScoreNote } from '@guitar-tabs/core';

const VF_DURATION: Record<string, string> = { w: 'w', h: 'h', q: 'q', '8': '8', '16': '16' };

/** Written guitar pitch = sounding + 1 octave (shown with a treble-8vb clef). */
function toStaveNote(n: ScoreNote): StaveNote {
  const rest = n.pitches.length === 0;
  const keys = rest ? ['b/4'] : n.pitches.map((p) => `${p.step.toLowerCase()}${p.alter === 1 ? '#' : p.alter === -1 ? 'b' : ''}/${p.octave + 1}`);
  const note = new StaveNote({ keys, duration: VF_DURATION[n.duration.type] + (rest ? 'r' : ''), dots: n.duration.dots });
  if (n.duration.dots) Dot.buildAndAttach([note], { all: true });
  n.pitches.forEach((p, i) => {
    if (p.alter === 1) note.addModifier(new Accidental('#'), i);
    if (p.alter === -1) note.addModifier(new Accidental('b'), i);
  });
  return note;
}

export default function NotationView({ score }: { score: Score | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    document.fonts?.load('30px Bravura').finally(() => alive && setFontsReady(true));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    setError(null);
    if (!score) return;
    try {
      const totalWidth = Math.max(320, el.clientWidth || 800);
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
      const renderer = new Renderer(el, Renderer.Backends.SVG);
      renderer.resize(totalWidth, lines.length * lineHeight + 20);
      const ctx = renderer.getContext();
      lines.forEach((line, li) => {
        let x = 5;
        line.forEach((mi, k) => {
          const first = k === 0;
          const w = widths[mi] + (first && mi > 0 ? 60 : 0);
          const stave = new Stave(x, li * lineHeight + 10, w);
          if (first) stave.addClef('treble', 'default', '8vb');
          if (mi === 0) stave.addTimeSignature(`${score.time.beats}/${score.time.beatType}`);
          stave.setContext(ctx).draw();
          const notes = score.measures[mi].notes.map(toStaveNote);
          if (notes.length) {
            const voice = new Voice({ numBeats: score.time.beats, beatValue: score.time.beatType }).setMode(Voice.Mode.SOFT).addTickables(notes);
            const beams = Beam.generateBeams(notes);
            new Formatter().joinVoices([voice]).format([voice], Math.max(20, w - (stave.getNoteStartX() - x) - 15));
            voice.draw(ctx, stave);
            beams.forEach((b) => b.setContext(ctx).draw());
          }
          x += w;
        });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [score, fontsReady]);

  return (
    <div>
      <div ref={ref} data-testid="notation" style={{ width: '100%', overflowX: 'auto', background: '#fff' }} />
      {error && <div style={{ color: '#b00020' }}>Notation render error: {error}</div>}
    </div>
  );
}
