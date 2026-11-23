/** Note value of a rhythmic event. */
export type DurationType = 'w' | 'h' | 'q' | '8' | '16';

export interface Duration {
  type: DurationType;
  /** 0 = plain, 1 = dotted */
  dots: 0 | 1;
}

export type Articulation = 'h' | 'p' | '/' | '\\' | 'b' | 'r' | '~' | 's';

/** One fretted note in a tab. `string` is 1-based, 1 = highest-pitched string (high e). */
export interface TabNote {
  string: number;
  fret: number;
  /** Symbol that followed the fret number in the source tab (hammer-on, pull-off, slide...). */
  articulation?: Articulation;
}

export interface TabEvent {
  /** Empty array = rest. */
  notes: TabNote[];
  duration: Duration;
}

export interface TabMeasure {
  events: TabEvent[];
}

export interface Tab {
  /** MIDI numbers of the open strings, index 0 = string 1 (highest). */
  tuning: number[];
  measures: TabMeasure[];
}

/** A spelled pitch. `midi` is concert (sounding) pitch. */
export interface Pitch {
  midi: number;
  /** Letter name A-G */
  step: string;
  /** -1 flat, 0 natural, 1 sharp */
  alter: number;
  octave: number;
  /** e.g. "C#4" */
  name: string;
}

export interface ScoreNote {
  /** Empty = rest. Sorted low to high. */
  pitches: Pitch[];
  duration: Duration;
  /** Optional string/fret hints for each pitch (same order as pitches), e.g. from tab or MusicXML <technical>. */
  positions?: (TabNote | undefined)[];
}

export interface ScoreMeasure {
  notes: ScoreNote[];
}

export interface TimeSignature {
  beats: number;
  beatType: number;
}

export interface Score {
  measures: ScoreMeasure[];
  time: TimeSignature;
  /** Quarter notes per minute */
  tempo: number;
}
