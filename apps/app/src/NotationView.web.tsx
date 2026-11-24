import { useEffect, useRef, useState } from 'react';
import * as VexFlow from 'vexflow/bravura';
import type { Score } from '@guitar-tabs/core';
import { renderScore } from './notation/renderScore';

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
      renderScore(VexFlow, el, score, el.clientWidth || 800);
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
