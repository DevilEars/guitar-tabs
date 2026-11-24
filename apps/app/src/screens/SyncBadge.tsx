import { Text } from 'react-native';
import type { SyncState } from '../state/LibraryContext';
import { colors } from '../ui/theme';

export function SyncBadge({ state }: { state: SyncState }) {
  const [label, color] = ((): [string, string] => {
    switch (state.kind) {
      case 'local-only': return ['On this device', colors.muted];
      case 'signed-out': return ['Not signed in', colors.muted];
      case 'syncing': return ['Syncing…', colors.muted];
      case 'pending': return ['Sync pending', colors.muted];
      case 'synced': return ['Synced', colors.ok];
      case 'offline': return ['Offline', colors.warn];
    }
  })();
  return <Text testID="sync-badge" style={{ color, fontSize: 13 }}>{label}</Text>;
}
