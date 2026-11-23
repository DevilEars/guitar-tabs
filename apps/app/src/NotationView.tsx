import { Text, View } from 'react-native';
import type { Score } from '@guitar-tabs/core';

/**
 * Native (Android) fallback. VexFlow needs a DOM/SVG; rendering it natively (react-native-svg backend or a
 * WebView) is not built yet, so this shows the converted pitches as text instead of pretending to be notation.
 */
export default function NotationView({ score }: { score: Score | null }) {
  if (!score) return null;
  return (
    <View>
      <Text style={{ color: '#a15c00', marginBottom: 6 }}>Staff rendering isn't available on Android yet. Converted pitches:</Text>
      {score.measures.map((m, i) => (
        <Text key={i} style={{ fontFamily: 'monospace' }}>
          {`${i + 1}: ` + m.notes.map((n) => (n.pitches.length ? n.pitches.map((p) => p.name).join('+') : 'rest') + `(${n.duration.type}${n.duration.dots ? '.' : ''})`).join('  ')}
        </Text>
      ))}
    </View>
  );
}
