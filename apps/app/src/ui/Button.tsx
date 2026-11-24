import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({ label, onPress, disabled, variant = 'primary', testID, small }: {
  label: string; onPress: () => void; disabled?: boolean; variant?: Variant; testID?: string; small?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.base, small && s.small, s[variant], disabled && s.disabled, pressed && { opacity: 0.7 }]}
    >
      <Text style={[s.text, variant !== 'primary' && variant !== 'danger' && { color: colors.primary }, small && { fontSize: 13 }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[s.chip, on && s.chipOn]}>
      <Text style={{ color: on ? '#fff' : colors.primary, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  small: { paddingHorizontal: 10, paddingVertical: 6 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.primary },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.45 },
  text: { color: '#fff', fontWeight: '600', fontSize: 14 },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  chipOn: { backgroundColor: colors.primary },
});
