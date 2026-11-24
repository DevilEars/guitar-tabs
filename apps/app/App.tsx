import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LibraryProvider } from './src/state/LibraryContext';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { EditorScreen } from './src/screens/EditorScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { colors } from './src/ui/theme';

type Route = { name: 'library' } | { name: 'editor'; id: string } | { name: 'account' };

/** Minimal stack navigator: Android back button and browser back both pop. */
function useStack() {
  const [stack, setStack] = useState<Route[]>([{ name: 'library' }]);
  const depth = useRef(1);
  depth.current = stack.length;
  const push = useCallback((r: Route) => {
    setStack((s) => [...s, r]);
    if (Platform.OS === 'web') window.history.pushState({ depth: 1 }, '');
  }, []);
  const pop = useCallback(() => {
    if (Platform.OS === 'web' && window.history.state?.depth) window.history.back();
    else setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const onPop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (depth.current <= 1) return false; // let Android close the app
      setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
      return true;
    });
    return () => sub.remove();
  }, []);
  return { route: stack[stack.length - 1], push, pop };
}

function Screens() {
  const { route, push, pop } = useStack();
  if (route.name === 'editor') return <EditorScreen key={route.id} id={route.id} back={pop} />;
  if (route.name === 'account') return <AccountScreen back={pop} />;
  return <LibraryScreen openTab={(id) => push({ name: 'editor', id })} openAccount={() => push({ name: 'account' })} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <LibraryProvider fallback={<View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>}>
          <Screens />
        </LibraryProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
