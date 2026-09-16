# music_codecs

> **Git policy — never auto-commit or auto-push.** Leave your work in the working tree.
> Run `git commit`, `git push` or `npm publish` **only when the user explicitly asks in
> that turn**. Approval for an earlier change does not carry forward, and finishing a
> task is not permission to commit it.

Every score file format Moosiac reads or writes: MIDI, MusicXML, the tracker
modules and the app's own `.moo` project file — the encoders and decoders, and
the filenames written for those formats (`exportFilename`). The formats'
option and result types are music_types'. One of the eight shared libraries in
the family (beside `music_api` and the two apps) — see `music_app/docs/architecture.md`.

**The rule: a format that carries notes lives here; a format that carries
samples lives in `@sudobility/music_io`.** Reading a MIDI file or a tracker
module is byte arithmetic against a published spec — no `AudioContext`, no DOM,
no filesystem — so it runs identically on the frontend, on React Native and on
the server. Reading a WAV or an MP3 needs a real audio context, which makes it a
platform capability.

That rule is why this package exists at all. `music_api` (backend) and
`music_lib` (frontend) both decode MIDI and neither may depend on the other.

## Package boundaries

`src/__architecture.test.ts` enforces three things rather than trusting them to
be remembered:

1. **No import of `music_lib`, `music_io`, `vexflow` or `tone`** in shipped
   source. One would put this package out of the server's reach silently, until
   somebody tried to deploy.
2. **`dependencies` is empty and `peerDependencies` is exactly
   `@sudobility/music_types`.** Everything here is written against the model and
   the standard library.
3. **`@tonejs/midi` is a devDependency and appears in no shipped source.** See
   below — it is a test oracle, not an implementation.

Target is **ES2020**, because the server consumes this package: no `.at()`, no
`??=`, no `Object.hasOwn`. `importedTitle` in `file-names.ts` reads
`segments[segments.length - 1]` rather than `.at(-1)` for exactly that reason
(music_types, which the server also consumes, holds to the same target — its
`replacement-region.ts` is the other place this shows).

## Structure

- `src/midi/` — `bytes.ts` (SMF primitives: big-endian ints, variable-length
  quantities), `decode.ts`, `encode.ts`, `errors.ts`; then the musical half —
  `import.ts`, `export.ts`, `analyze.ts`, `measures.ts`, `grid-detection.ts`,
  `key-detection.ts`, `import-options.ts`
- `src/tracker/` — the byte readers: `read.ts` (MOD), `period.ts`, `dsm.ts`,
  `s3m.ts`, `xm.ts`, `xm-write.ts`, `it.ts`, `riff.ts`, the two effect
  normalisers, `dispatch.ts`, the fixture builders, and `fixtures/` — eight real
  modules the acceptance suite reads off disk
- `src/mod/` — the musical half of tracker support: `import.ts`
  (`trackerToScore`), `export.ts` (`scoreToTracker`), `fill.ts`, `limits.ts`,
  `timing.ts`
- `src/musicxml/` — `import.ts`, `export.ts`, `duration-map.ts`
- `src/project/` — `project-file.ts`: the app's own `.moo` document
  (`serializeProjectFile`/`parseProjectFile`, `ProjectFileError`). The file's
  name, version and shape — `DOCUMENT_EXTENSION(S)`, `PROJECT_FILE_VERSION`,
  `ProjectFile` — are music_types' and are not re-exported from here: other
  packages read them without parsing anything, and music_editing had come to
  depend on this codec just to name the file. Writes
  `{ version, title, score }`, reads that and the web's older
  `{ name, schemaVersion, score }` export, and validates the score with
  `parseScore`
- `src/file-names.ts` — the one naming rule for every exported file
  (`exportFilename`/`exportBasename`: keep the title, replace only the
  characters a filesystem reserves, `Untitled` when blank; no ASCII slugging)
  and `importedTitle`. The old `safeFilename`/`musicXmlSafeFilename` aliases
  are gone, and `file-names.test.ts` fails if either name comes back
- `src/fixtures.ts` — the test-facing entry (`./fixtures`), which publishes the
  module builders and nothing else
- `src/test/` — `fixtures.ts` (score fixtures) and `xml.ts` (a jsdom
  `XmlParser`). Scaffolding: not shipped, excluded from the build

## Gotchas

- **The codecs' option and result types are music_types'.** `MidiSummary` and its sub-types, `DetectedGrid`, `MidiImportOptions`/`MidiTrackSelection`/`MidiImportResult`, `TimeSignatureChange`/`MeasureSpan`, `MusicXmlImportResult`/`MusicXmlWarnings`, and the tracker export's `TrackerFitReport`, `TRACKER_FIT_LOSSES`, `TrackerExportOptions`/`Result`, `WritableTrackerFormat` and `TrackerLimits` are declared once there, so the apps, music_io's `ScoreFiles` and music_lib name one shape. The numbers and the functions stay here (`TRACKER_LIMITS`, `FALLBACK_GRID`, `trackerFitLosses`, `defaultMidiImportOptions`). `src/__moved-to-types.test.ts` fails if one is exported at runtime, declared or re-exported here again — music_lib re-exports this package and music_types wholesale, so the same name arriving by both routes is a TS2308 in its build and a "Cannot redefine property" crash in a CommonJS consumer. Because a type has no runtime form, `warning-contract.test.ts` now reads the declared warning keys off `TEST_MUSICXML_WARNINGS`, which is typed as the whole contract — a key added or removed in music_types fails to compile there.


- **One fact, one declaration — and `src/__single-source.test.ts` enforces it.** A constant restated in a second package agrees with the first right up until one of them is edited, and nothing fails when they part: the build is clean, the types match, and the only symptom is a wrong sound or a picker quietly missing an entry. Measured across the family, 23 UPPER_CASE constants were declared in more than one repo — `CC_VOLUME` three times, `DYNAMICS` four, `C_MAJOR` five, and `DEFAULT_TIME_SIGNATURE` in four places under two names. The guard reads the list of names **from music_types at runtime** rather than restating it, because a check against duplication that duplicates what it checks would drift like everything else; its `ALLOWED` list is empty on purpose, so an exemption is a decision somebody writes down. Two shapes matter beyond the constants themselves. **A closed vocabulary is declared as an array and the type read off it** (`export const DYNAMICS = [...] as const; export type Dynamic = (typeof DYNAMICS)[number];`) — a TypeScript union has no runtime form, so anything that must *validate* a value has to write the list out again, which is exactly how music_api's decoder came to check generated music against its own private copy. **A label or option list keyed by the vocabulary is a `Record<T, ...>`, never a parallel array** — a record fails to compile when a member is added, an array silently goes on offering the old set; that is why the inspector's picker lists are `ACCIDENTAL_OPTIONS`/`ARTICULATION_OPTIONS` built from the vocabulary rather than `ACCIDENTALS`/`ARTICULATIONS` retyped. Test fixtures follow the same rule: the score fixtures live once, in `@sudobility/music_types/test`, and a package that needs a rendering fixture of its own re-exports them and adds to them.

- **The MIDI byte codec is hand-written, and `@tonejs/midi` is its oracle.**
  There is not one `.mid` fixture file anywhere in the family, so every
  byte-crossing MIDI test round-trips through the codec under test — a codec
  that is internally consistent but spec-wrong would pass all of them silently.
  `src/midi/oracle.test.ts` closes that: bytes we write must decode correctly
  through `@tonejs/midi`, and bytes it writes must decode correctly through
  ours. It stays a devDependency, so this package still installs with no runtime
  dependency at all. **If the oracle disagrees with us, we are wrong** — it has
  years of real files behind it.
- **Format 0 splits by channel, and that is a deliberate departure.**
  `@tonejs/midi` splits a format-0 file on program-change boundaries instead: on
  a two-channel file it returns *three* tracks — a phantom one reporting the
  wrong channel that holds the second channel's tick-0 CC7/CC10, and that
  channel's real notes stranded with no controllers. A 25-line
  `withFormatZeroSetupControls` workaround existed in four separate copies to
  patch it up after the fact. Splitting by the channel each event actually names
  needs no patching, and `src/midi/format-zero.test.ts` pins it.
- **A note-on at velocity 0 is a note-off.** Writers emit it constantly instead
  of a real note-off; taken literally the note sounds for the rest of the piece.
- **Running status is not optional.** A byte below `0x80` where a status is
  expected reuses the previous channel status and is itself the first data byte;
  `0xFF`/`0xF0`/`0xF7` clear it. A reader that ignores this misparses most real
  files from the first repeated event onward.
- **In the neutral model, velocity and control-change values are normalized
  0–1**, not 0–127. `MidiTempoEvent.bpm` is a float, and SMF stores tempo as
  integer microseconds per quarter — so 90 bpm round-trips as 90.00009. That is
  the format's limit, not a rounding choice, and tests assert with tolerance
  rather than pretending otherwise.
- **A conductor chunk is recognised by having no channel events at all**, which
  is stricter than `@tonejs/midi`'s "its duration is 0" and does not misfire on
  a real track that carries only controllers. `encodeMidi` writes format 1 with
  a conductor chunk first, so the two agree by construction.
- **`scoreToMidiFile` is split out of `exportMidi` on purpose.** It is the
  observation point `importMidiFile` and `analyzeMidiFile` already gave the
  other direction. Before the codec moved into this package, a test that wanted
  the `MidiFile` had to inject a fake `MidiCodec` that captured its argument
  instead of encoding — borrowing a platform seam to observe a value.
- **Tracker import works on a format-neutral model, and that is the whole
  point.** `TrackerModule` (music_types, `formats/mod.ts`) carries MIDI note
  numbers rather than Amiga periods, per-pattern row counts, an instrument
  layer, an explicit `'off'` and normalised `speed`/`bpm` — so `trackerToScore`
  (`src/mod/import.ts`) has no format branches, and each format this package
  reads (MOD, DSM, S3M, XM, IT/MPTM) was decoder work in `src/tracker/` only.
- **`src/mod/fill.ts` exists because a bar that does not add up renders short.**
  `trackerToScore` used to place notes and nothing else, which left holes: a real
  module produced 554 `measure-underfull` warnings and visibly short bars
  (`mod/import.test.ts` now asserts none). `fillVoiceWithRests` tiles every voice
  exactly across its measure, with music_types' `decomposeDuration` splitting a
  gap too long for one drawable value. Any importer that builds voices by hand
  needs the same treatment.
- **The individual tracker readers are not exported.** Which one runs is decided
  by magic bytes in `decodeTracker`, never by file extension, so a mis-named
  module still imports and an unrecognised file fails naming what was actually
  at the front of it. Publishing five readers would make that choice a caller's
  problem.
- **`src/tracker/acceptance.test.ts` declares `@vitest-environment node`.** This
  package's vitest default is jsdom (two MusicXML suites want `DOMParser`), and
  under jsdom `import.meta.url` is an `http://` URL whose `pathname` resolves
  `./fixtures/` to `/src/tracker/fixtures` — the filesystem root.
- **The DSM reader's offsets were measured against a real file, not read from a specification — and two of them contradict the usual documentation.** `numOrders` sits at `SONG+36`, where `+34` is `restartPos` and yields 127 instead of 31; the `INST` name sits at `+36` of a 64-byte header. Both were pinned by arithmetic that has to close: the order list's maximum equals `numPatterns - 1`, and `64 + length` equals the chunk length for every instrument. A real module lives in `src/tracker/fixtures/` so those offsets stay honest. **`NOTE_BASE` is the one value still unconfirmed** — the file carries no reference pitch and no note-off, so it fixes note *spacing* but not the absolute octave. It currently produces E3-B5 for that module, which is plausible but not proof; an octave error would move every note together and pass every test here.
- **DSM shares ProTracker's effect lettering**, which is why `protracker-effects.ts` is shared with the MOD reader rather than written twice. Verified on the real file: effect `0x0F` with parameters 5 and 114, splitting at `0x20` exactly as MOD does. S3M, XM and IT letter theirs differently and will bring their own normalisers.
- **S3M is parapointer-addressed, so nothing is read by walking forward.** The header carries tables of 16-bit pointers which, times sixteen, give file offsets for each instrument and pattern. It has **its own effect normaliser** (`s3m-effects.ts`) because commands are numbered 1=A..26=Z rather than nibbled: `A` sets speed, `T` sets tempo, `C` breaks the pattern, and there is none of MOD's `0x20` split to make.
- **Two S3M behaviours contradict the format documentation, and both have a real file in `fixtures/` that exhibits them.** `portal_to_hell.s3m` (54606) yields 62-63 rows for *every* pattern and most run one byte past their declared length, because the writer omits trailing empty rows and sometimes the final terminator — so the reader never trusts the declared length to terminate and never requires 64 rows of data. `moving_that_rhythm.s3m` (69391) enables 16 channels in its header while its patterns reach only 0-8 — so the row width is `max(enabled, highestUsed + 1)`, erring wide because empty columns are harmless (tracks come from instruments) and erring narrow loses notes. Do not "simplify" either rule back out; a decoder written from the specification rejects the first file outright.
- **In XM almost nothing has a fixed size, and the instrument header is the one that catches people.** The file header, every pattern header and every instrument header declare their own length. An instrument with *no samples* writes 33 bytes where one with samples writes 263, and real modules mix them freely — `sunlight.xm` has eight empty among fifteen — so assuming 263 desynchronises everything after the first. Finding the next instrument needs all three of the header size, the sample-header size and the sum of every sample's length. Patterns come *before* instruments, so the instruments can only be found by walking every pattern first.
- **XM patterns carry their own row count, and `packedSize = 0` means blank rows rather than none.** `dr_wily.xm` holds a 76-row pattern among its 64s and four empty patterns; `mercury.xm` holds 32s and 56s. XM is the first format here that is not fixed at 64, which makes it the first real test of that axis of `TrackerModule` — and it needed no change. Emitting nothing for an empty pattern would shorten the song and shift everything after it.
- **XM reuses `applyProTrackerEffect`,** unlike S3M. Verified across four real modules: effect `F` carried parameters 1-24 and 125, splitting at `0x20` exactly as MOD does, and `D` is a pattern break. **Not verified:** XM's per-sample relative-note and finetune are ignored, so a module using them imports transposed — the same class of limitation as MOD's finetune.
- **`periodToMidi` lives here, beside the MOD reader, and that is deliberate.** It is a musical conversion, which would normally put it beside `trackerToScore` in `src/mod/` — but MOD is the only tracker format that stores Amiga periods; every other one stores note numbers directly. Converting at the decoder is what lets the neutral `TrackerCell` carry a plain note number and keeps "periods are a ProTracker detail" true. Its finetune approximation is documented in that file.

## Related Projects

- `music_types` — the model, its schemas and the pure primitives (`@sudobility/music_types`)
- `music_io` — platform capabilities: playback, audio codecs, file export, MIDI input
- `music_lib` — commands, store, rendering adapters; re-exports this package wholesale
- `music_api` — backend; depends on this package directly
- `music_app` — the web UI

## Git Workflow

- Do not use feature branches for code changes. Always stay on the current branch.
