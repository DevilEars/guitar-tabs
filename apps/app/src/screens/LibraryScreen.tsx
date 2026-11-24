import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { LocalTabDoc } from '@guitar-tabs/library';
import { useLibrary } from '../state/LibraryContext';
import { Button } from '../ui/Button';
import { PromptDialog } from '../ui/PromptDialog';
import { colors, ui } from '../ui/theme';
import { relativeTime } from '../ui/format';
import { confirmAsync } from '../platform/confirm';
import { pickTextFile, saveFile } from '../platform/files';
import { BLANK_TAB, fileToNewTab } from '../importExport';
import { SyncBadge } from './SyncBadge';

export function LibraryScreen({ openTab, openAccount }: { openTab: (id: string) => void; openAccount: () => void }) {
  const { repo, version, user, sync } = useLibrary();
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<LocalTabDoc | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const ownerId = user?.id ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tabs = useMemo(() => repo.list(ownerId, query), [repo, ownerId, query, version]);
  const unowned = user ? repo.unowned() : [];
  const uploadAnswered = user ? repo.getMeta(`uploadPrompt:${user.id}`) : 'n/a';

  const createTab = async () => {
    const doc = await repo.create({ title: 'Untitled tab', tuning: [], content: BLANK_TAB }, ownerId);
    openTab(doc.id);
  };

  const importFile = async () => {
    setMessage(null);
    try {
      const f = await pickTextFile('.txt,.tab,.musicxml,.xml,.json,text/plain,application/xml');
      if (!f) return;
      if (/\.json$/i.test(f.name) || f.text.trimStart().startsWith('{')) {
        const r = await repo.importBackup(f.text, ownerId);
        setMessage({ text: `Backup restored: ${r.added} added, ${r.updated} updated, ${r.skipped} unchanged.` });
        return;
      }
      const { tab, warnings } = fileToNewTab(f.name, f.text);
      const doc = await repo.create(tab, ownerId);
      setMessage({ text: `Imported "${doc.title}".${warnings.length ? ` ${warnings.length} warning(s): ${warnings[0]}` : ''}` });
    } catch (e) {
      setMessage({ text: `Import failed: ${e instanceof Error ? e.message : String(e)}`, error: true });
    }
  };

  const backup = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    await saveFile(`guitar-tabs-backup-${stamp}.json`, repo.exportBackup(ownerId), 'application/json');
  };

  const remove = async (d: LocalTabDoc) => {
    if (await confirmAsync('Delete tab?', `"${d.title}" will be deleted${user ? ' on all your devices' : ''}.`, 'Delete')) {
      await repo.remove(d.id);
    }
  };

  return (
    <View style={ui.screen}>
      <View style={ui.header}>
        <Text style={ui.headerTitle} accessibilityRole="header">Guitar Tabs</Text>
        <SyncBadge state={sync} />
        <Button testID="account-button" small variant="secondary" label={user ? 'Account' : 'Sign in'} onPress={openAccount} />
      </View>
      <FlatList
        data={tabs}
        keyExtractor={(d) => d.id}
        contentContainerStyle={ui.body}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {user && unowned.length > 0 && !uploadAnswered && (
              <View style={[ui.card, { gap: 8, borderColor: colors.primary }]}>
                <Text>{unowned.length} tab{unowned.length === 1 ? '' : 's'} on this device {unowned.length === 1 ? "isn't" : "aren't"} in your account yet. Upload {unowned.length === 1 ? 'it' : 'them'} so {unowned.length === 1 ? 'it syncs' : 'they sync'} to your other devices?</Text>
                <View style={ui.row}>
                  <Button testID="upload-local" label="Upload to my account" onPress={async () => { await repo.claimUnowned(user.id); await repo.setMeta(`uploadPrompt:${user.id}`, 'uploaded'); }} />
                  <Button variant="secondary" label="Keep on this device only" onPress={() => repo.setMeta(`uploadPrompt:${user.id}`, 'declined')} />
                </View>
              </View>
            )}
            <View style={ui.row}>
              <Button testID="new-tab" label="+ New tab" onPress={createTab} />
              <Button testID="import" variant="secondary" label="Import" onPress={importFile} />
              <Button testID="backup" variant="secondary" label="Backup (JSON)" onPress={backup} disabled={tabs.length === 0} />
            </View>
            <TextInput testID="search" placeholder="Search title, artist or tab text" value={query} onChangeText={setQuery} style={ui.input} autoCapitalize="none" />
            {message && <Text style={message.error ? ui.error : ui.muted}>{message.text}</Text>}
          </View>
        }
        ListEmptyComponent={
          <View style={[ui.card, { alignItems: 'center', gap: 6 }]}>
            <Text style={ui.h2}>{query ? 'No matching tabs' : 'No tabs yet'}</Text>
            <Text style={ui.muted}>{query ? 'Try a different search.' : 'Create a new tab or import a .txt / MusicXML file.'}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View testID="tab-row" style={[ui.card, { gap: 8 }]}>
            <Pressable testID="open-tab" accessibilityRole="button" onPress={() => openTab(item.id)}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }} numberOfLines={1}>{item.title}</Text>
              <Text style={ui.muted} numberOfLines={1}>
                {[item.artist, `updated ${relativeTime(item.updated_at)}`, user ? (item.owner_id === null ? 'this device only' : item.dirty ? 'not synced yet' : null) : null].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
            <View style={ui.row}>
              <Button small variant="secondary" label="Open" onPress={() => openTab(item.id)} />
              <Button testID="rename" small variant="secondary" label="Rename" onPress={() => setRenaming(item)} />
              <Button testID="duplicate" small variant="secondary" label="Duplicate" onPress={() => repo.duplicate(item.id)} />
              <Button testID="delete" small variant="danger" label="Delete" onPress={() => remove(item)} />
            </View>
          </View>
        )}
      />
      <PromptDialog
        visible={!!renaming}
        title="Rename tab"
        initial={renaming?.title ?? ''}
        onCancel={() => setRenaming(null)}
        onSubmit={async (v) => { if (renaming) await repo.update(renaming.id, { title: v }); setRenaming(null); }}
      />
    </View>
  );
}
