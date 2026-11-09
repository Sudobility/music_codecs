# music_codecs

> **Git policy — never auto-commit or auto-push.** Leave your work in the working
> tree. Run `git commit`, `git push` or `npm publish` **only when the user explicitly
> asks in that turn.** Stay on the current branch; do not open feature branches.

Every score file format Moosiac reads or writes — MIDI, MusicXML, the tracker modules
and the app's own `.moo` project file — the encoders and decoders, plus the filenames
written for them (`exportFilename`). The formats' option and result types are music_types'.

**The rule: a format that carries notes lives here; a format that carries samples lives
in `@sudobility/music_io`.** Reading MIDI or a tracker module is byte arithmetic against
a spec (no `AudioContext`, no DOM, no filesystem), so it runs identically on frontend, RN
and server — which is why this package exists: music_api (backend) and music_lib
(frontend) both decode MIDI and neither may depend on the other. Reading WAV/MP3 needs a
real audio context, so it is a platform capability (music_io).

## Commands

- `bun run verify` — format:check + typecheck + lint + test + build (before any push).
- `bun run test` — vitest. `bun run build` — `tsc -p tsconfig.esm.json`.

## Package boundaries

`src/__architecture.test.ts` enforces: (1) no import of music_lib, music_io, vexflow or
tone in shipped source; (2) `dependencies` empty, `peerDependencies` exactly
`@sudobility/music_types`; (3) `@tonejs/midi` is a devDependency in no shipped source (a
test oracle, not an implementation). Target is **ES2020** (the server consumes this): no
`.at()`, `??=`, `Object.hasOwn` — `importedTitle` reads `segments[segments.length - 1]`
for that reason. `src/__single-source.test.ts` enforces single-source constants (names
read from music_types at runtime). `src/__moved-to-types.test.ts` fails if a type now
owned by music_types is exported/declared/re-exported here again (music_lib re-exports
this and music_types wholesale → a name by both routes is TS2308 / CJS "Cannot redefine").

## Structure

- `src/midi/` — `bytes.ts` (SMF primitives), `decode.ts`, `encode.ts`, `errors.ts`, then
  the musical half: `import.ts`, `export.ts`, `analyze.ts`, `measures.ts`,
  `grid-detection.ts`, `key-detection.ts`, `import-options.ts`.
- `src/tracker/` — the byte readers (`read.ts` MOD, `period.ts`, `dsm.ts`, `s3m.ts`,
  `xm.ts`, `xm-write.ts`, `it.ts`, `riff.ts`, the effect normalisers, `dispatch.ts`) and
  `fixtures/` (eight real modules the acceptance suite reads off disk).
- `src/mod/` — the musical half of tracker support: `import.ts` (`trackerToScore`),
  `export.ts` (`scoreToTracker`), `fill.ts`, `limits.ts`, `timing.ts`.
- `src/musicxml/` — `import.ts`, `export.ts`, `duration-map.ts`.
- `src/project/` — `project-file.ts`: the `.moo` document (`serializeProjectFile`/
  `parseProjectFile`, `ProjectFileError`). Its name/version/shape are music_types' and
  **not** re-exported here. Writes `{ version, title, score }`, reads that and the web's
  older `{ name, schemaVersion, score }` export, validates with `parseScore`.
- `src/file-names.ts` — the one naming rule (`exportFilename`/`exportBasename`: keep the
  title, replace only filesystem-reserved chars, `Untitled` when blank, no ASCII slugging)
  and `importedTitle`.
- `src/fixtures.ts` — the test-facing `./fixtures` entry (module builders only).
- `src/test/` — scaffolding (`fixtures.ts`, `xml.ts` jsdom `XmlParser`), not shipped.

## Gotchas

- **The codecs' option and result types are music_types'** (`MidiSummary` & sub-types,
  `DetectedGrid`, `MidiImportOptions`/`MidiTrackSelection`/`MidiImportResult`,
  `TimeSignatureChange`/`MeasureSpan`, `MusicXmlImportResult`/`MusicXmlWarnings`, the
  tracker export's `TrackerFitReport`/`TRACKER_FIT_LOSSES`/`TrackerExportOptions`/`Result`/
  `WritableTrackerFormat`/`TrackerLimits`). The numbers and functions stay here
  (`TRACKER_LIMITS`, `FALLBACK_GRID`, `trackerFitLosses`, `defaultMidiImportOptions`).
- **The MIDI byte codec is hand-written, and `@tonejs/midi` is its oracle.** There is no
  `.mid` fixture anywhere in the family — byte-crossing tests round-trip through the codec,
  and `src/midi/oracle.test.ts` checks our bytes decode through tonejs and vice versa. If
  the oracle disagrees with us, **we are wrong.** It stays a devDependency.
- **Format 0 splits by the channel each event names**, not on program-change boundaries
  like `@tonejs/midi` (which strands controllers in a phantom track). `format-zero.test.ts`
  pins it; the old `withFormatZeroSetupControls` workaround is gone.
- **A note-on at velocity 0 is a note-off** (writers emit it instead of a real note-off).
- **Running status is not optional.** A byte below `0x80` where a status is expected
  reuses the previous channel status and is itself the first data byte; `0xFF`/`0xF0`/`0xF7`
  clear it. Ignoring this misparses most real files from the first repeated event on.
- **Neutral-model velocity and CC values are 0–1**, not 0–127. `MidiTempoEvent.bpm` is a
  float and SMF stores integer µs/quarter, so 90 bpm round-trips as 90.00009 — a format
  limit, asserted with tolerance.
- **A conductor chunk is recognised by having no channel events at all** (stricter than
  tonejs's "duration 0"; does not misfire on a controller-only track). `encodeMidi` writes
  format 1 conductor-first. **`scoreToMidiFile` is split out of `exportMidi`** as the
  observation point for the `MidiFile` (mirroring `importMidiFile`/`analyzeMidiFile`).
- **Tracker import works on a format-neutral `TrackerModule`** (music_types,
  `formats/mod.ts`): MIDI note numbers not Amiga periods, per-pattern row counts, an
  instrument layer, explicit `'off'`, normalised `speed`/`bpm` — so `trackerToScore` has no
  format branches and each format (MOD, DSM, S3M, XM, IT/MPTM) is decoder work in
  `src/tracker/` only. The individual readers are **not exported**: `decodeTracker` picks
  one by magic bytes, never extension.
- **`src/mod/fill.ts` tiles every voice exactly across its measure** — `trackerToScore`
  used to leave holes (short bars, 554 `measure-underfull` warnings). Any importer building
  voices by hand needs the same treatment.
- **`periodToMidi` lives beside the MOD reader** (`src/tracker/`), deliberately: MOD is the
  only format that stores Amiga periods, so converting at the decoder keeps the neutral
  `TrackerCell` carrying a plain note number.
- **`src/tracker/acceptance.test.ts` declares `@vitest-environment node`.** The package
  default is jsdom (MusicXML wants `DOMParser`), under which `import.meta.url` is an
  `http://` URL that resolves `./fixtures/` to the filesystem root.
- **Per-format byte-layout traps are documented in each reader's file header** and pinned
  by a real module in `fixtures/` (DSM's measured offsets and unconfirmed `NOTE_BASE`;
  S3M parapointers, its own effect lettering, and two spec-contradicting fixtures; XM's
  self-sizing headers and variable row counts; shared ProTracker effect lettering for
  MOD/DSM/XM). Do not "simplify" a rule back out — a decoder written straight from the
  spec rejects the real files.

## Related projects

`music_types` (model, schemas, primitives) · `music_io` (platform capabilities) ·
`music_lib` (re-exports this wholesale) · `music_api` (backend, depends directly) · `music_app`
