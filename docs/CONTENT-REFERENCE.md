# Fret Not — widget and exercise reference

Generated from `web/shared/registry.ts` by `node scripts/gen-reference.ts`. Do not edit by hand.
The file format these plug into is described in [CONTENT.md](CONTENT.md).

## Widgets

### `string-sim`

An animated vibrating string. In `harmonics` mode the learner switches standing-wave modes on and off and hears each; in `pluck` and `strike` mode they choose where along the string to pluck (guitar) or strike (piano) and see and hear which harmonics that excites.

| Parameter | Type | |
|---|---|---|
| `mode` | `enum:harmonics \| pluck \| strike` | Default harmonics. |
| `note` | `pitch` | The string's fundamental. Default A2. |
| `modes` | `number` | How many harmonics are offered. Default 6. |

### `harmonic-mixer`

One slider per harmonic of a note, with the summed waveform and the spectrum drawn live. The learner builds a timbre by ear and eye.

| Parameter | Type | |
|---|---|---|
| `note` | `pitch` | Fundamental. Default A2. |
| `partials` | `number` | Number of sliders. Default 8. |
| `preset` | `enum:sine \| saw \| square \| triangle \| piano \| guitar` | Starting mix. Default sine. |

### `frequency-explorer`

A frequency slider with a live waveform: drag to hear pitch rise as the wave gets tighter. Shows Hz and the nearest note name.

| Parameter | Type | |
|---|---|---|
| `min` | `number` | Lowest Hz. Default 55. |
| `max` | `number` | Highest Hz. Default 1760. |
| `start` | `number` | Starting Hz. Default 220. |
| `showNotes` | `boolean` | Show the nearest note name. Default true. |
| `loudness` | `boolean` | Also offer a loudness (amplitude) slider. Default false. |

### `consonance`

Two tones a chosen frequency ratio apart: hear them together, see the combined wave repeat (or not), and see which of their harmonics coincide.

| Parameter | Type | |
|---|---|---|
| `base` | `pitch` | Lower note. Default A3. |
| `ratios` | `string[]` | Ratios offered, e.g. ["2:1", "3:2", "4:3", "5:4", "16:15"]. Default those five. |

### `timbre-compare`

The same note from several sources side by side, each with its waveform and spectrum: why a piano and a guitar playing the same pitch sound different.

| Parameter | Type | |
|---|---|---|
| `note` | `pitch` | Default A3. |
| `sources` | `enum[]:sine \| triangle \| square \| saw \| piano \| guitar` | Default [sine, piano, guitar]. |

### `scope`

A live oscilloscope and spectrum of everything the app is currently playing.

| Parameter | Type | |
|---|---|---|
| `show` | `enum:wave \| spectrum \| both` | Default both. |

### `instrument-anatomy`

An interactive cutaway of how the instrument makes sound. Piano: key, hammer, strings, damper, soundboard. Guitar: string, fret, bridge, soundboard and body, and how pressing a fret shortens the string.

| Parameter | Type | |
|---|---|---|
| `instrument` **(required)** | `enum:piano \| guitar` | Which instrument. |

### `keyboard`

A playable piano keyboard.

| Parameter | Type | |
|---|---|---|
| `range` | `range` | Default [C3, C5]. |
| `highlight` | `pitch[]` | Keys to light up. |
| `labels` | `enum:none \| c \| naturals \| all` | Which keys carry their note name. Default naturals. |

### `fretboard`

A playable guitar fretboard in standard tuning, low E string at the bottom (as in tab).

| Parameter | Type | |
|---|---|---|
| `frets` | `number` | How many frets to draw. Default 12. |
| `positions` | `fretpos[]` | Exact places to mark, as string/fret: ["6/3", "5/2"]. |
| `highlight` | `pitch[]` | Mark every place these sounding pitches can be played. |
| `pitchClasses` | `pitchclass[]` | Mark every place any octave of these notes can be played. |
| `labels` | `enum:none \| open \| naturals \| all` | Which positions carry a note name. Default open. |

### `staff`

A staff with notes on it. Click a note to hear it.

| Parameter | Type | |
|---|---|---|
| `clef` | `enum:treble \| bass \| grand` | Default treble. |
| `notes` | `pitch[]` | Notes drawn left to right. |
| `chord` | `boolean` | Stack the notes as one chord instead. Default false. |
| `key` | `key` | Key signature to draw. |
| `labels` | `boolean` | Write each note's name under it. Default false. |

### `linked`

The central widget: the same notes shown on staff, keyboard and fretboard at once. With `interactive`, clicking a key, a fret or a staff line changes the note everywhere.

| Parameter | Type | |
|---|---|---|
| `notes` **(required)** | `pitch[]` | The notes shown to begin with (sounding pitch). |
| `views` | `enum[]:staff \| keyboard \| fretboard \| tab` | Default [staff, keyboard, fretboard]. |
| `clef` | `enum:treble \| bass \| grand` | Default: chosen from the notes. |
| `chord` | `boolean` | Treat the notes as one chord (sounded together). Default false. |
| `interactive` | `boolean` | Let the learner pick a different note. Default true. |

### `interval`

Two notes and the distance between them: its name, its size in half steps, its frequency ratio, on staff and keyboard, played one after the other or together.

| Parameter | Type | |
|---|---|---|
| `from` **(required)** | `pitch` | Lower note. |
| `to` **(required)** | `pitch` | Upper note. |
| `interactive` | `boolean` | Let the learner move the upper note. Default true. |
| `views` | `enum[]:staff \| keyboard \| fretboard \| tab` | Default [staff, keyboard]. |

### `scale`

A scale with its pattern of whole and half steps, on the chosen views, playable up and down.

| Parameter | Type | |
|---|---|---|
| `tonic` **(required)** | `pitchclass` | Starting note, e.g. C or Bb. |
| `scale` **(required)** | `scaletype` | Which scale: major, natural-minor, major-pentatonic, minor-pentatonic, blues … |
| `views` | `enum[]:staff \| keyboard \| fretboard \| tab` | Default [staff, keyboard]. |
| `interactive` | `boolean` | Let the learner change tonic and type. Default false. |

### `chord`

One chord: its notes, how it is built from thirds, and how it looks on each view. `diagram` is the guitar chord box.

| Parameter | Type | |
|---|---|---|
| `symbol` **(required)** | `chord` | e.g. C, Am, G7. |
| `views` | `enum[]:staff \| keyboard \| fretboard \| diagram` | Default [staff, keyboard]. |
| `interactive` | `boolean` | Let the learner change root and type. Default false. |

### `chord-diagram`

A row of guitar chord boxes. Click one to strum it. Only chords with a stored shape can be shown (see CONTENT.md).

| Parameter | Type | |
|---|---|---|
| `chords` **(required)** | `chord[]` | e.g. ["Em", "Am", "C", "G", "D"]. |

### `circle-of-fifths`

The circle of fifths: click a key to see its signature, its scale and its relative minor.

| Parameter | Type | |
|---|---|---|
| `key` | `key` | Key selected to begin with. Default C. |

### `metronome`

A visual metronome: a swinging arm and a light per beat, with tempo and time signature controls.

| Parameter | Type | |
|---|---|---|
| `tempo` | `number` | Beats per minute. Default 80. |
| `time` | `time` | Default 4/4. |

### `rhythm`

A rhythm in notation with the counting written under it. Play it and a cursor follows; with `tap` the learner taps along and sees how close each tap was.

| Parameter | Type | |
|---|---|---|
| `pattern` **(required)** | `rhythm` | Durations: "q q e e h | w". |
| `time` | `time` | Default 4/4. |
| `tempo` | `number` | Default 80. |
| `count` | `boolean` | Write the counting (1 & 2 &) underneath. Default true. |
| `tap` | `boolean` | Offer tap-along. Default false. |

### `melody`

A short tune on the staff, played back with a moving cursor and the current note lit on the linked views.

| Parameter | Type | |
|---|---|---|
| `notes` **(required)** | `melody` | Melody tokens: "C4:q D4:q E4:h | G4:w". Sounding pitch. |
| `title` | `string` | Shown above, e.g. the tune's name and origin. |
| `time` | `time` | Default 4/4. |
| `tempo` | `number` | Default 90. |
| `key` | `key` | Key signature. Default C. |
| `clef` | `enum:treble \| bass \| grand` | Default treble. |
| `views` | `enum[]:staff \| keyboard \| fretboard \| tab` | Default [staff, keyboard]. |
| `instrument` | `enum:piano \| guitar` | Which sound plays it. Default piano. |

### `tab`

Guitar tablature with the same music on a staff above it (written an octave above where it sounds), played back with a cursor.

| Parameter | Type | |
|---|---|---|
| `notes` **(required)** | `tabline` | Tab tokens, string/fret:duration: "6/0:q 6/3:q 5/0:h". |
| `title` | `string` | Shown above. |
| `time` | `time` | Default 4/4. |
| `tempo` | `number` | Default 90. |
| `staff` | `boolean` | Draw the staff above the tab. Default true. |

### `progression`

A chord progression played in time, each chord shown as it sounds.

| Parameter | Type | |
|---|---|---|
| `chords` **(required)** | `string` | Chord symbols ("C G Am F") or, with `key`, Roman numerals ("I V vi IV"). One bar each. |
| `key` | `key` | Needed for Roman numerals; also labels symbols with their numeral. |
| `tempo` | `number` | Default 90. |
| `time` | `time` | Default 4/4. |
| `instrument` | `enum:piano \| guitar` | Default piano. |
| `views` | `enum[]:staff \| keyboard \| fretboard \| diagram` | Default [keyboard]. |

## Exercise kinds

Every declaration also takes `concept` (required), `count` (default 5) and an optional `title`.

### Identify

#### `quiz`

Authored multiple-choice questions, for ideas no generator covers. `count` questions are drawn at random.

| Parameter | Type | |
|---|---|---|
| `questions` **(required)** | `questions` | List of {q, choices, answer, explain}; `answer` is the 1-based index of the right choice. |

#### `name-note`

A note is shown; name it.

| Parameter | Type | |
|---|---|---|
| `view` **(required)** | `enum:staff \| keyboard \| fretboard \| tab` | Where the note is shown. |
| `clef` | `enum:treble \| bass` | For staff views. Default treble. |
| `range` | `range` | Lowest and highest pitch asked. Default depends on the view. |
| `accidentals` | `boolean` | Include sharps and flats. Default false. |
| `strings` | `number[]` | Guitar strings to draw from (1 = high E … 6 = low E). Default all. |
| `maxFret` | `number` | Highest fret asked. Default 5. |

#### `name-interval`

Two notes are shown; name the interval between them.

| Parameter | Type | |
|---|---|---|
| `view` **(required)** | `enum:staff \| keyboard \| fretboard` | Where the notes are shown. |
| `intervals` **(required)** | `interval[]` | Intervals drawn from, e.g. ["m2", "M2"]. |
| `labels` | `enum:names \| steps` | `steps` words the answers as half steps / whole steps (for m2 and M2). Default names. |
| `clef` | `enum:treble \| bass` | Default treble. |

#### `name-chord`

A chord is shown; name it (root and quality).

| Parameter | Type | |
|---|---|---|
| `view` **(required)** | `enum:staff \| keyboard \| diagram` | Where the chord is shown. `diagram` uses guitar chord boxes. |
| `chords` | `chord[]` | Chords drawn from. Give this or `types` + `roots`. |
| `types` | `chordtype[]` | e.g. [maj, min]. |
| `roots` | `pitchclass[]` | e.g. [C, F, G]. |
| `qualityOnly` | `boolean` | Ask only major or minor (etc.), not the root. Default false. |

#### `name-key`

A key signature is shown; name the key.

| Parameter | Type | |
|---|---|---|
| `maxAccidentals` | `number` | Up to this many sharps or flats. Default 3. |
| `mode` | `enum:major \| minor \| both` | Default major. |
| `clef` | `enum:treble \| bass` | Default treble. |

#### `name-duration`

A note or rest is shown; say what it is called or how many beats it lasts.

| Parameter | Type | |
|---|---|---|
| `values` **(required)** | `duration[]` | e.g. [w, h, q, e, qr]. |
| `ask` | `enum:name \| beats` | Default name. |

#### `count-bar`

A bar with one note missing is shown; choose the note value that completes it.

| Parameter | Type | |
|---|---|---|
| `time` | `time` | Default 4/4. |
| `values` **(required)** | `duration[]` | Note values used. |

#### `harmonic-frequency`

Given a fundamental frequency, pick the frequency of its nth harmonic (or which harmonic a frequency is).

| Parameter | Type | |
|---|---|---|
| `fundamentals` | `number[]` | Fundamentals in Hz. Default [100, 110, 200, 220]. |
| `maxHarmonic` | `number` | Default 5. |

### Ear

#### `ear-higher-lower`

Two notes play one after the other; is the second higher or lower?

| Parameter | Type | |
|---|---|---|
| `minSemitones` | `number` | Smallest gap. Default 2. |
| `maxSemitones` | `number` | Largest gap. Default 12. |
| `timbre` | `enum:sine \| triangle \| square \| saw \| piano \| guitar` | Default piano. |

#### `ear-interval`

An interval plays; name it.

| Parameter | Type | |
|---|---|---|
| `intervals` **(required)** | `interval[]` | Intervals drawn from. |
| `mode` | `enum:melodic \| harmonic \| both` | One note after the other, together, or either. Default melodic. |
| `labels` | `enum:names \| steps` | As for name-interval. |

#### `ear-chord`

A chord plays; say its quality.

| Parameter | Type | |
|---|---|---|
| `types` **(required)** | `chordtype[]` | e.g. [maj, min]. |
| `instrument` | `enum:piano \| guitar` | Default piano. |

#### `ear-timbre`

A note plays; say which source made it.

| Parameter | Type | |
|---|---|---|
| `sources` **(required)** | `enum[]:sine \| triangle \| square \| saw \| piano \| guitar` | e.g. [sine, piano, guitar]. |

#### `ear-same-note`

Two notes play; are they the same note, an octave apart, or different notes?

| Parameter | Type | |
|---|---|---|
| `timbre` | `enum:sine \| triangle \| square \| saw \| piano \| guitar` | Default piano. |

#### `ear-rhythm`

A one-bar rhythm plays; pick the notation that matches it from three.

| Parameter | Type | |
|---|---|---|
| `time` | `time` | Default 4/4. |
| `values` **(required)** | `duration[]` | Note values used. |
| `tempo` | `number` | Default 80. |

#### `ear-find-note`

A reference note is shown and played, then a second note plays; find the second on the instrument.

| Parameter | Type | |
|---|---|---|
| `instrument` | `enum:piano \| guitar` | Default piano. |
| `scale` | `scaletype` | Draw notes from this scale on C. Default major. |
| `range` | `range` | Default [C4, C5]. |

### Play

#### `play-note`

A note is asked for by name, on the staff or in tab; play it on the virtual instrument.

| Parameter | Type | |
|---|---|---|
| `instrument` **(required)** | `enum:piano \| guitar` | Which instrument answers. |
| `from` **(required)** | `enum:name \| staff \| tab` | How the note is asked for. `tab` is guitar only. |
| `anyOctave` | `boolean` | Accept the note in any octave. Default true for `name`, false otherwise. |
| `clef` | `enum:treble \| bass` | For staff views. Default treble. |
| `range` | `range` | Lowest and highest pitch asked. Default depends on the view. |
| `accidentals` | `boolean` | Include sharps and flats. Default false. |
| `strings` | `number[]` | Guitar strings to draw from (1 = high E … 6 = low E). Default all. |
| `maxFret` | `number` | Highest fret asked. Default 5. |

#### `play-scale`

Play a scale upward from its tonic, one octave, in order.

| Parameter | Type | |
|---|---|---|
| `instrument` **(required)** | `enum:piano \| guitar` | Which instrument answers. |
| `types` **(required)** | `scaletype[]` | Scale types drawn from. |
| `tonics` **(required)** | `pitchclass[]` | Tonics drawn from. |

#### `play-chord`

A chord symbol is shown; press its notes (piano) or fret its shape (guitar), then check.

| Parameter | Type | |
|---|---|---|
| `instrument` **(required)** | `enum:piano \| guitar` | Which instrument answers. |
| `chords` **(required)** | `chord[]` | Chords drawn from. |

#### `tap-rhythm`

A one- or two-bar rhythm is shown; after a count-in, tap it on the space bar in time.

| Parameter | Type | |
|---|---|---|
| `time` | `time` | Default 4/4. |
| `values` **(required)** | `duration[]` | Note values used. |
| `bars` | `number` | 1 or 2. Default 1. |
| `tempo` | `number` | Default 72. |

### Build

#### `build-interval`

A starting note is given; play the note the named interval above (or below) it.

| Parameter | Type | |
|---|---|---|
| `intervals` **(required)** | `interval[]` | Intervals drawn from. |
| `direction` | `enum:up \| down \| both` | Default up. |
| `instrument` | `enum:piano \| guitar` | Default piano. |
| `labels` | `enum:names \| steps` | As for name-interval. |

#### `build-scale`

A scale is named; select exactly its notes on the keyboard.

| Parameter | Type | |
|---|---|---|
| `types` **(required)** | `scaletype[]` | Scale types drawn from. |
| `tonics` **(required)** | `pitchclass[]` | Tonics drawn from. |

#### `build-chord`

A chord is named in words ("a major triad on E"); select exactly its notes on the keyboard.

| Parameter | Type | |
|---|---|---|
| `types` **(required)** | `chordtype[]` | Chord types drawn from. |
| `roots` **(required)** | `pitchclass[]` | Roots drawn from. |

#### `build-key-signature`

A key is named; choose how many sharps or flats its signature has.

| Parameter | Type | |
|---|---|---|
| `maxAccidentals` | `number` | Default 3. |
| `mode` | `enum:major \| minor \| both` | Default major. |

