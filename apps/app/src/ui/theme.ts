import { Platform, StyleSheet } from 'react-native';

export const colors = {
  bg: '#f6f7fb', card: '#fff', text: '#1b1f2a', muted: '#667085', primary: '#1f5fbf', danger: '#b42318', border: '#d0d5dd', warn: '#a15c00', ok: '#067647',
};
export const mono = Platform.select({ web: 'ui-monospace, Menlo, Consolas, monospace', default: 'monospace' });

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text },
  body: { padding: 12, gap: 10, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.card, color: colors.text, fontSize: 15 },
  h2: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 8 },
  muted: { color: colors.muted },
  warn: { color: colors.warn },
  error: { color: colors.danger },
  card: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12 },
});
