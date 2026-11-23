import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  DROP_D_TUNING, STANDARD_TUNING, formatTab, musicXmlToScore, parseTab, scoreToMidi, scoreToMusicXml,
  scoreToPlayback, scoreToTab, tabToScore, type Score,
} from '@guitar-tabs/core';
import NotationView from './src/NotationView';
import { play, playbackSupported, stop } from './src/player';
import { download, downloadSupported } from './src/download';
import { SAMPLE_TAB } from './src/samples';

type InputMode = 'tab' | 'musicxml';
const TUNINGS = { Standard: STANDARD_TUNING, 'Drop D': DROP_D_TUNING } as const;
type TuningName = keyof typeof TUNINGS;
const mono = Platform.select({ web: 'ui-monospace, Menlo, Consolas, monospace', default: 'monospace' });

function Button({ label, onPress, disabled, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} style={[styles.btn, disabled && styles.btnDisabled]}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

function Toggle<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.row}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} style={[styles.chip, o === value && styles.chipOn]}>
          <Text style={o === value ? styles.chipTextOn : styles.chipText}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function App() {
  const [mode, setMode] = useState<InputMode>('tab');
  const [text, setText] = useState(SAMPLE_TAB);
  const [tuningName, setTuningName] = useState<TuningName | 'From labels'>('From labels');
  const [tempo, setTempo] = useState('100');
  const [keepPositions, setKeepPositions] = useState(false);
  const [playing, setPlaying] = useState(false);

  const result = useMemo(() => {
    try {
      const bpm = Math.min(300, Math.max(20, Number(tempo) || 100));
      let score: Score;
      let tuning: readonly number[];
      if (mode === 'tab') {
        const tab = parseTab(text, tuningName === 'From labels' ? {} : { tuning: TUNINGS[tuningName] });
        tuning = tab.tuning;
        score = tabToScore(tab, { tempo: bpm });
      } else {
        const imp = musicXmlToScore(text);
        tuning = tuningName === 'From labels' ? imp.tuning ?? STANDARD_TUNING : TUNINGS[tuningName];
        score = { ...imp.score, tempo: bpm };
      }
      const back = scoreToTab(score, tuning, { respectHints: keepPositions });
      return { score, tuning, backTab: formatTab(back.tab), warnings: back.warnings, error: null as string | null };
    } catch (e) {
      return { score: null, tuning: STANDARD_TUNING, backTab: '', warnings: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [mode, text, tuningName, tempo, keepPositions]);

  const onPlay = async () => {
    if (!result.score) return;
    if (playing) { stop(); setPlaying(false); return; }
    setPlaying(true);
    try {
      await play(scoreToPlayback(result.score), () => setPlaying(false));
    } catch {
      setPlaying(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <StatusBar style="auto" />
      <Text style={styles.h1}>Guitar Tabs</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Input</Text>
        <Toggle options={['tab', 'musicxml'] as const} value={mode} onChange={(m) => {
          setMode(m);
          if (m === 'musicxml' && result.score) setText(scoreToMusicXml(result.score, { tuning: result.tuning }));
          if (m === 'tab' && result.score) setText(result.backTab);
        }} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Tuning</Text>
        <Toggle options={['From labels', 'Standard', 'Drop D'] as const} value={tuningName} onChange={setTuningName} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Tempo</Text>
        <TextInput value={tempo} onChangeText={setTempo} keyboardType="numeric" style={styles.tempo} />
        <Text>bpm (rhythm line: w h q e s, "." = dotted; default eighths)</Text>
      </View>

      <TextInput
        testID="tab-input"
        multiline
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={[styles.editor, { fontFamily: mono }]}
      />
      {result.error && <Text style={styles.error}>{result.error}</Text>}

      <Text style={styles.h2}>Standard notation</Text>
      <NotationView score={result.score} />

      <View style={styles.row}>
        <Button testID="play" label={playing ? 'Stop' : 'Play preview'} onPress={onPlay} disabled={!result.score || !playbackSupported} />
        <Button label="Download .mid" disabled={!result.score || !downloadSupported} onPress={() => result.score && download('guitar-tab.mid', scoreToMidi(result.score), 'audio/midi')} />
        <Button label="Download MusicXML" disabled={!result.score || !downloadSupported} onPress={() => result.score && download('guitar-tab.musicxml', scoreToMusicXml(result.score, { tuning: result.tuning }), 'application/vnd.recordare.musicxml+xml')} />
      </View>
      {!playbackSupported && <Text style={styles.note}>Audio preview and file export are web-only for now.</Text>}

      <Text style={styles.h2}>Converted back to tab</Text>
      <View style={styles.row}>
        <Toggle options={['Auto fingering', 'Keep original positions'] as const} value={keepPositions ? 'Keep original positions' : 'Auto fingering'} onChange={(v) => setKeepPositions(v === 'Keep original positions')} />
      </View>
      <Text testID="tab-output" style={[styles.output, { fontFamily: mono }]}>{result.backTab}</Text>
      {result.warnings.map((w, i) => <Text key={i} style={styles.note}>{w}</Text>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  h1: { fontSize: 26, fontWeight: '700', marginTop: 24 },
  h2: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  label: { width: 60, fontWeight: '600' },
  editor: { minHeight: 180, borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 8, fontSize: 14, backgroundColor: '#fafafa' },
  output: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, fontSize: 14, backgroundColor: '#f4f7ff' },
  tempo: { borderWidth: 1, borderColor: '#bbb', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, width: 60 },
  error: { color: '#b00020' },
  note: { color: '#a15c00' },
  btn: { backgroundColor: '#1f5fbf', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  btnDisabled: { backgroundColor: '#9aa9c0' },
  btnText: { color: '#fff', fontWeight: '600' },
  chip: { borderWidth: 1, borderColor: '#1f5fbf', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  chipOn: { backgroundColor: '#1f5fbf' },
  chipText: { color: '#1f5fbf' },
  chipTextOn: { color: '#fff' },
});
