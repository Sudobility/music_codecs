# @sudobility/music_codecs

Score encoders and decoders for ScoreSmith / Moosiac: **MIDI**, **MusicXML**, the
**tracker modules** (MOD, DSM, S3M, XM, IT/MPTM) and the app's own **`.moo`** project file.
Each codec turns bytes-shaped input into a `Score` (from `@sudobility/music_types`) or a
`Score` back out — and does nothing else: no store, no rendering, no audio, no DOM, no
filesystem.

## Why it exists

Reading a MIDI file or a tracker module is byte arithmetic against a spec, so it runs
identically on the frontend, React Native and the server. `music_api` (backend) and
`music_lib` (frontend) both need to decode these formats and neither may depend on the
other, so the shared codec logic lives in this one platform-neutral package.

The guiding rule: **a format that carries notes lives here; a format that carries samples
(WAV/MP3) lives in `@sudobility/music_io`**, because decoding audio needs a real audio
context and is therefore a platform capability.

MusicXML is the one exception to "no platform": the package owns the MusicXML semantics but
takes an injected `XmlParser` (`DOMParser` on web, `fast-xml-parser` on RN), which also
lives in `@sudobility/music_io`.

## Install

This is a restricted package published to **GitHub Packages**. The repo's `.npmrc` already
points the `@sudobility` scope at `https://npm.pkg.github.com`; consuming it needs a GitHub
token with `read:packages` in your own `~/.npmrc`.

```bash
bun add @sudobility/music_codecs
# requires peer dependency:
bun add @sudobility/music_types
```

`@sudobility/music_types` is a **peer dependency** (`^0.13.65`) — the caller supplies it.
The package has no runtime `dependencies`.

## Usage

The package is ESM-only (`"type": "module"`). Two entry points:

```ts
import {
  decodeMidi, encodeMidi,       // Standard MIDI File bytes <-> MidiFile
  importMidiFile, exportMidi,    // MIDI <-> Score (the musical layer)
  decodeTracker, encodeTracker,  // MOD/DSM/S3M/XM/IT bytes <-> TrackerModule
  trackerToScore, scoreToTracker,
  importMusicXml, exportMusicXml,
  serializeProjectFile, parseProjectFile,  // the .moo document
  exportFilename, importedTitle,           // filename rules for every format
} from '@sudobility/music_codecs';

import { buildMod } from '@sudobility/music_codecs/fixtures'; // test module builders
```

The codecs' option and result types (`MidiSummary`, `MidiImportOptions`,
`MusicXmlImportResult`, `TrackerExportOptions`, …) are owned by `@sudobility/music_types`,
not re-declared here.

## Develop

Uses **bun** (`bun.lock`). Install dev dependencies with `bun install`.

| Command | What it does |
| --- | --- |
| `bun run verify` | format:check + typecheck + lint + test:unit + build — run before any push |
| `bun run test:unit` | run the vitest suite once |
| `bun run test:watch` | vitest in watch mode |
| `bun run build` | emit ESM + types to `dist/` (`tsc -p tsconfig.esm.json`) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | eslint over `src` |
| `bun run format` / `format:check` | prettier |
| `bun run clean` | remove `dist/` |

There is no bare `test` script — use `test:unit`.

### Layout

- `src/midi/` — SMF byte codec (`bytes`, `decode`, `encode`) plus the musical layer
  (`import`, `export`, `analyze`, `measures`, `grid-detection`, `key-detection`).
- `src/tracker/` — per-format byte readers (`read` MOD, `dsm`, `s3m`, `xm`, `it`, effect
  normalisers, `dispatch`) and `fixtures/` (real modules the acceptance suite reads).
- `src/mod/` — the musical layer of tracker support (`trackerToScore` / `scoreToTracker`).
- `src/musicxml/` — MusicXML `import`, `export`, `duration-map`.
- `src/project/` — `project-file.ts`, the `.moo` document.
- `src/file-names.ts` — `exportFilename` / `importedTitle`, the shared filename rules.
- `src/fixtures.ts` — the `./fixtures` entry (module builders for tests).
- `src/test/` — test scaffolding, not shipped.

## Notes for newcomers

- **Target is ES2020** (the server consumes this build): no `.at()`, `??=`, `Object.hasOwn`.
- The individual tracker readers are **not exported** — `decodeTracker` selects one by magic
  bytes, never by file extension.
- The MIDI byte codec is hand-written; `@tonejs/midi` is a **dev-only test oracle**, not an
  implementation dependency. If the oracle disagrees with our bytes, we are wrong.
- `src/__architecture.test.ts` enforces the package boundaries (empty `dependencies`, the
  single peer dependency, no import of music_lib/music_io/vexflow/tone in shipped source).

See [`CLAUDE.md`](./CLAUDE.md) for the detailed architecture notes and per-format gotchas.

## Related packages

`@sudobility/music_types` (model, schemas, primitives) · `@sudobility/music_io` (platform
capabilities) · `music_lib` (frontend, re-exports this) · `music_api` (backend).

## License

BUSL-1.1 · Sudobility
