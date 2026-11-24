# Guitar Tabs

Enter guitar tab, see it as standard notation, convert notation back to tab, and hear a preview.
Live web app: https://devilears.github.io/guitar-tabs/ (deployed by `.github/workflows/pages.yml` on every push to main).

One Expo (React Native + react-native-web) app for web and Android, with all music logic in a
UI-free TypeScript package.

```
packages/core      @guitar-tabs/core: tab parser/formatter, tab <-> notation, fingering, MusicXML, MIDI (Vitest)
packages/library   @guitar-tabs/library: local-first tab repository + last-write-wins sync engine (Vitest)
apps/app           Expo app (web + Android): tab library, editor with autosave, account/sync screen
supabase/          Postgres migration (tabs table + Row Level Security)
docs/              supabase-setup.md: how to turn on sign-in and sync
scripts/           web smoke test (headless Chrome), migration/RLS check (PGlite)
```

## Tab library and sync

- Tabs are saved on the device first (AsyncStorage: localStorage on web, SQLite-backed storage on Android), so the
  app works signed out and offline. The editor autosaves ~0.7 s after you stop typing (Saving… / Saved / Offline).
- Library: new, open, rename, duplicate, delete (with confirm), search; import `.txt` tab or MusicXML; export
  `.txt`, `.mid`, MusicXML; JSON backup / restore of all tabs.
- Sign-in and cross-device sync use Supabase (email + password or magic link). Without
  `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` the app runs in local-only mode.
  Setup: [docs/supabase-setup.md](docs/supabase-setup.md).

## Commands

```bash
npm install
npm test                                   # core + library unit tests (Vitest)
npm run typecheck                          # core + library + app
npm run test:sql                           # migration + RLS check on in-process Postgres
npm run build && npm run smoke             # web export + headless-Chrome smoke test (local mode)
cd apps/app && npx expo start --web        # dev server
cd apps/app && npx expo export --platform web   # static web build in apps/app/dist
```

## Tab format

```
   q  e     q. e          <- optional rhythm line: w h q e s, "." = dotted; sticky until the next marker
e|-0--1--3--0--1--|------
B|-1-----------3--|------
G|-0--------------|---0--
D|-2--------------|------
A|-3--------------|------
E|----------------|------
```

- 6 strings, top line = high e. Labels are optional; non-standard labels (e.g. `D` on the bottom) set the
  tuning (drop D), or pass `tuning` explicitly (any number of strings).
- Frets 0-24 (two adjacent digits = one fret if <= 24). Notes in the same column are a chord.
- `|` = bar line. If there are no bar lines, notation is split into 4/4 bars automatically.
- `h p / \ b r ~ s` right after a fret are kept as an `articulation` on the note (not yet shown in notation/MIDI).
- No rhythm line: every event is an eighth note.

## Pitch convention

Pitches in the model, MIDI and MusicXML are **concert (sounding) pitch**: low E string = E2 (MIDI 40).
Guitar is written an octave higher, so notation uses a treble clef with an 8 below
(MusicXML `<clef-octave-change>-1</clef-octave-change>`; the VexFlow view draws notes an octave up with the 8vb clef).
This matches how MuseScore encodes guitar.

## Notation -> tab fingering

Viterbi search over every event: candidates are all assignments of the pitches to distinct strings
(frets 0-24, fretted span <= 4). The hand is a 4-fret window; cost = 0.15/fret (prefers low frets and open
strings) + stretch/high-position penalties + (1 + distance) per hand shift. Out-of-range or unplayable notes
are dropped with a warning. `respectHints` keeps string/fret positions carried from the tab or from MusicXML
`<technical><string>/<fret>`.

## Platform status

| Feature | Web | Android |
|---|---|---|
| Tab library, autosave, import/export, JSON backup | yes | bundles; not run on a device |
| Sign-in + sync (Supabase) | built; needs a Supabase project | built; needs a project; not run on a device |
| Tab editor, parse, convert back to tab | yes | bundles; not run on a device |
| Staff notation (VexFlow) | yes | not yet (shows pitch names as text) |
| Audio preview | Web Audio synth | not yet |
| .mid / MusicXML / .txt export | download | share sheet (untested) |

## License

MIT (see `LICENSE`). Security reports: see `SECURITY.md`.
