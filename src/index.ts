/**
 * @sudobility/music_codecs — the score encoders and decoders.
 *
 * Every file format ScoreSmith reads or writes lives here: MIDI, MusicXML and
 * the tracker modules. Each one turns bytes-shaped input into a `Score`, or a
 * `Score` back out, and does nothing else — no store, no rendering, no audio,
 * no platform.
 *
 * That is why it is its own package. `music_api` (backend) and `music_lib`
 * (frontend) both need to read a MIDI file, and neither may depend on the
 * other; before this package existed the server imported the frontend library
 * to get at its importer, and separately hand-copied helpers to avoid doing
 * so. Both sides now depend on this, and on `@sudobility/music_types` for the
 * score model and the domain primitives these operate on.
 *
 * Raw byte work — parsing a MIDI file into tracks and notes, or XML into a
 * DOM — belongs to `@sudobility/music_io`, which is injected: these modules
 * take a `MidiCodec` or an `XmlParser` rather than importing one, so they stay
 * free of anything platform-shaped.
 */

// ---- MIDI -----------------------------------------------------------------
export * from './midi/analyze.js';
export * from './midi/export.js';
export * from './midi/grid-detection.js';
export * from './midi/import.js';
export * from './midi/import-options.js';
export * from './midi/key-detection.js';
export * from './midi/measures.js';

// ---- MusicXML -------------------------------------------------------------
export * from './musicxml/duration-map.js';
export * from './musicxml/import.js';
/**
 * `safeFilename` is exported by both writers and they are not the same
 * function — each sanitises for its own format's conventions. The MIDI one
 * keeps the bare name it always had; the MusicXML one is named for its format
 * rather than one of them silently shadowing the other.
 */
export {
  exportMusicXml,
  safeFilename as musicXmlSafeFilename,
} from './musicxml/export.js';

// ---- Tracker modules (MOD, S3M, XM, IT, MPTM) -----------------------------
export * from './mod/export.js';
export * from './mod/fill.js';
export * from './mod/import.js';
export * from './mod/limits.js';
export * from './mod/timing.js';
export * from './mod/types.js';
