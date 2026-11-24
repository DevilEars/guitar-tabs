import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { DROP_D_TUNING, STANDARD_TUNING, formatTab, scoreToPlayback, scoreToTab } from '@guitar-tabs/core';
import type { TabPatch } from '@guitar-tabs/library';
import { useLibrary } from '../state/LibraryContext';
import { Button, Chip } from '../ui/Button';
import { colors, mono, ui } from '../ui/theme';
import { safeFileName } from '../ui/format';
import { confirmAsync } from '../platform/confirm';
import { saveFile } from '../platform/files';
import { exportMidi, exportMusicXml, renderDoc } from '../importExport';
import NotationView from '../NotationView';
import { play, playbackSupported, stop } from '../player';

const TUNINGS: { label: string; value: number[] }[] = [
  { label: 'From labels', value: [] },
  { label: 'Standard', value: [...STANDARD_TUNING] },
  { label: 'Drop D', value: [...DROP_D_TUNING] },
];
const SAVE_DELAY = 700;

type Draft = Required<Pick<TabPatch, 'title' | 'artist' | 'content' | 'tempo' | 'tuning'>>;

export function EditorScreen({ id, back }: { id: string; back: () => void }) {
  const { repo, user, sync } = useLibrary();
  const initial = repo.get(id);
  const [draft, setDraft] = useState<Draft | null>(initial ? { title: initial.title, artist: initial.artist, content: initial.content, tempo: initial.tempo, tuning: initial.tuning } : null);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [tempoText, setTempoText] = useState(String(initial?.tempo ?? 100));
  const [keepPositions, setKeepPositions] = useState(false);
  const [playing, setPlaying] = useState(false);
  const pending = useRef<Partial<Draft>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length && repo.get(id)) await repo.update(id, patch);
    setSaveState('saved');
  }, [repo, id]);

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    pending.current = { ...pending.current, ...patch };
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  };

  // Save on leave / unmount.
  useEffect(() => () => { void flush(); stop(); }, [flush]);
  // Save when the page is hidden or closed (web).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); };
  }, [flush]);

  const rendered = useMemo(() => (draft ? renderDoc(draft) : null), [draft?.content, draft?.tuning, draft?.tempo]); // eslint-disable-line react-hooks/exhaustive-deps
  const backTab = useMemo(() => {
    if (!rendered?.score) return { text: '', warnings: [] as string[] };
    const r = scoreToTab(rendered.score, rendered.tuning, { respectHints: keepPositions });
    return { text: formatTab(r.tab), warnings: r.warnings };
  }, [rendered, keepPositions]);

  if (!draft) {
    return (
      <View style={ui.screen}>
        <View style={ui.header}><Button small variant="secondary" label="‹ Tabs" onPress={back} /><Text style={ui.headerTitle}>Not found</Text></View>
        <View style={ui.body}><Text>This tab no longer exists (it may have been deleted on another device).</Text></View>
      </View>
    );
  }

  const status = saveState === 'saving' ? 'Saving…' : user && sync.kind === 'offline' ? 'Offline' : 'Saved';
  const statusHint = saveState === 'saving' ? '' : status === 'Offline' ? 'saved on this device, will sync later' : user ? (sync.kind === 'synced' ? 'synced' : sync.kind === 'syncing' || sync.kind === 'pending' ? 'syncing' : '') : 'on this device';
  const fileBase = safeFileName(draft.title);

  const onPlay = async () => {
    if (!rendered?.score) return;
    if (playing) { stop(); setPlaying(false); return; }
    setPlaying(true);
    try { await play(scoreToPlayback(rendered.score), () => setPlaying(false)); } catch { setPlaying(false); }
  };

  return (
    <View style={ui.screen}>
      <View style={ui.header}>
        <Button testID="back" small variant="secondary" label="‹ Tabs" onPress={async () => { await flush(); back(); }} />
        <Text style={ui.headerTitle} numberOfLines={1}>{draft.title}</Text>
        <Text testID="save-status" accessibilityLiveRegion="polite" style={{ color: status === 'Offline' ? colors.warn : status === 'Saved' ? colors.ok : colors.muted, fontSize: 13 }}>
          {status}{statusHint ? ` · ${statusHint}` : ''}
        </Text>
      </View>
      <ScrollView contentContainerStyle={ui.body} keyboardShouldPersistTaps="handled">
        <View style={[ui.row, { alignItems: 'stretch' }]}>
          <TextInput testID="title-input" value={draft.title} onChangeText={(title) => change({ title })} placeholder="Title" style={[ui.input, { flexGrow: 2, flexBasis: 200 }]} />
          <TextInput testID="artist-input" value={draft.artist} onChangeText={(artist) => change({ artist })} placeholder="Artist (optional)" style={[ui.input, { flexGrow: 1, flexBasis: 160 }]} />
        </View>
        <View style={ui.row}>
          <Text style={{ fontWeight: '600' }}>Tuning</Text>
          {TUNINGS.map((t) => (
            <Chip key={t.label} label={t.label} on={JSON.stringify(t.value) === JSON.stringify(draft.tuning)} onPress={() => change({ tuning: t.value })} />
          ))}
        </View>
        <View style={ui.row}>
          <Text style={{ fontWeight: '600' }}>Tempo</Text>
          <TextInput
            testID="tempo-input"
            value={tempoText}
            keyboardType="numeric"
            onChangeText={(v) => {
              setTempoText(v);
              const n = Number(v);
              if (Number.isFinite(n) && n >= 20 && n <= 300) change({ tempo: Math.round(n) });
            }}
            style={[ui.input, { width: 70, paddingVertical: 4 }]}
          />
          <Text style={ui.muted}>bpm</Text>
        </View>
        <TextInput
          testID="tab-input"
          multiline
          value={draft.content}
          onChangeText={(content) => change({ content })}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textAlignVertical="top"
          placeholder="Paste or type tab here"
          style={[ui.input, { minHeight: 180, fontFamily: mono, fontSize: 14 }]}
        />
        <Text style={ui.muted}>Optional rhythm line above the strings: w h q e s ("." = dotted). Without it every note is an eighth.</Text>
        {rendered?.error && <Text testID="parse-error" style={ui.error}>{rendered.error}</Text>}

        <Text style={ui.h2}>Standard notation</Text>
        <View style={[ui.card, { padding: 4 }]}><NotationView score={rendered?.score ?? null} /></View>

        <View style={ui.row}>
          <Button testID="play" label={playing ? 'Stop' : 'Play preview'} onPress={onPlay} disabled={!rendered?.score || !playbackSupported} />
          <Button variant="secondary" label="Export .txt" onPress={() => saveFile(`${fileBase}.txt`, draft.content, 'text/plain')} />
          <Button variant="secondary" label="Export .mid" disabled={!rendered?.score} onPress={() => rendered?.score && saveFile(`${fileBase}.mid`, exportMidi(rendered.score), 'audio/midi')} />
          <Button variant="secondary" label="Export MusicXML" disabled={!rendered?.score} onPress={() => rendered?.score && saveFile(`${fileBase}.musicxml`, exportMusicXml(rendered.score, draft.title, rendered.tuning), 'application/vnd.recordare.musicxml+xml')} />
        </View>
        {!playbackSupported && <Text style={ui.warn}>Audio preview is web-only for now.</Text>}

        <Text style={ui.h2}>Converted back to tab</Text>
        <View style={ui.row}>
          <Chip label="Auto fingering" on={!keepPositions} onPress={() => setKeepPositions(false)} />
          <Chip label="Keep original positions" on={keepPositions} onPress={() => setKeepPositions(true)} />
          <Button small variant="secondary" label="Use this as the tab" disabled={!backTab.text} onPress={async () => {
            if (await confirmAsync('Replace tab text?', 'The editor text will be replaced with the converted tab.', 'Replace')) change({ content: backTab.text });
          }} />
        </View>
        <ScrollView horizontal style={[ui.card, { backgroundColor: '#f4f7ff' }]}>
          <Text testID="tab-output" style={{ fontFamily: mono, fontSize: 14 }}>{backTab.text}</Text>
        </ScrollView>
        {backTab.warnings.map((w, i) => <Text key={i} style={ui.warn}>{w}</Text>)}
      </ScrollView>
    </View>
  );
}
