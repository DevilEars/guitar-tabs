import { useEffect, useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';
import { Button } from './Button';
import { ui } from './theme';

/** Cross-platform text prompt (Alert.prompt is iOS-only, window.prompt is web-only). */
export function PromptDialog({ visible, title, initial, confirmLabel = 'Save', onSubmit, onCancel }: {
  visible: boolean; title: string; initial: string; confirmLabel?: string; onSubmit: (v: string) => void; onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => { if (visible) setValue(initial); }, [visible, initial]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }}>
        <View style={[ui.card, { gap: 12, maxWidth: 420, width: '100%', alignSelf: 'center' }]}>
          <Text style={ui.h2}>{title}</Text>
          <TextInput testID="prompt-input" value={value} onChangeText={setValue} autoFocus style={ui.input} onSubmitEditing={() => onSubmit(value)} />
          <View style={[ui.row, { justifyContent: 'flex-end' }]}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} />
            <Button testID="prompt-ok" label={confirmLabel} onPress={() => onSubmit(value)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
