import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useLibrary } from '../state/LibraryContext';
import { Button } from '../ui/Button';
import { ui } from '../ui/theme';
import { relativeTime } from '../ui/format';
import { SyncBadge } from './SyncBadge';

export function AccountScreen({ back }: { back: () => void }) {
  const { auth, user, sync, syncNow, repo } = useLibrary();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ text });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const lastSync = user ? repo.getMeta(`lastSync:${user.id}`) : undefined;

  return (
    <View style={ui.screen}>
      <View style={ui.header}>
        <Button testID="back" small variant="secondary" label="‹ Tabs" onPress={back} />
        <Text style={ui.headerTitle}>Account & sync</Text>
        <SyncBadge state={sync} />
      </View>
      <ScrollView contentContainerStyle={[ui.body, { maxWidth: 520 }]}>
        {!auth ? (
          <View testID="signin-unavailable" style={[ui.card, { gap: 6 }]}>
            <Text style={ui.h2}>Sign in unavailable</Text>
            <Text>This build isn't connected to a sync server yet, so tabs are saved on this device only. They keep working offline.</Text>
            <Text style={ui.muted}>Use Backup (JSON) on the tab list to move tabs between devices for now.</Text>
          </View>
        ) : user ? (
          <View style={[ui.card, { gap: 10 }]}>
            <Text>Signed in as <Text style={{ fontWeight: '700' }}>{user.email ?? user.id}</Text></Text>
            <Text style={ui.muted}>{lastSync ? `Last synced ${relativeTime(lastSync)}` : 'Not synced yet'}{sync.kind === 'offline' ? ` · ${sync.message}` : ''}</Text>
            <View style={ui.row}>
              <Button label="Sync now" disabled={busy || sync.kind === 'syncing'} onPress={() => run(async () => { await syncNow(); })} />
              <Button variant="secondary" label="Sign out" disabled={busy} onPress={() => run(async () => { await auth.signOut(); return 'Signed out. Your synced tabs stay in your account.'; })} />
            </View>
          </View>
        ) : (
          <View style={[ui.card, { gap: 10 }]}>
            <Text style={ui.h2}>Sign in to sync your tabs</Text>
            <Text style={ui.muted}>Your tabs sync between the web app and Android. Tabs you made while signed out can be uploaded after you sign in.</Text>
            <TextInput testID="email" placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={ui.input} />
            <TextInput testID="password" placeholder="Password (not needed for a magic link)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" style={ui.input} />
            <View style={ui.row}>
              <Button label="Sign in" disabled={busy || !email || !password} onPress={() => run(() => auth.signInWithPassword(email.trim(), password))} />
              <Button variant="secondary" label="Create account" disabled={busy || !email || password.length < 8} onPress={() => run(async () => {
                const r = await auth.signUpWithPassword(email.trim(), password);
                return r.needsConfirmation ? 'Check your email to confirm your account, then sign in.' : 'Account created.';
              })} />
              <Button variant="secondary" label="Email me a sign-in link" disabled={busy || !email} onPress={() => run(async () => { await auth.sendMagicLink(email.trim()); return 'Check your email for a sign-in link.'; })} />
            </View>
            <Text style={ui.muted}>Passwords need at least 8 characters.</Text>
          </View>
        )}
        {msg && <Text style={msg.error ? ui.error : ui.muted}>{msg.text}</Text>}
      </ScrollView>
    </View>
  );
}
