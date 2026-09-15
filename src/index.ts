/**
 * @sudobility/music_codecs — the score encoders and decoders.
 *
 * Every file format ScoreSmith reads or writes lives here: MIDI, MusicXML,
 * the tracker modules and the app's own `.moo` project file. Each one turns
 * bytes-shaped input into a `Score`, or a `Score` back out, and does nothing
 * else — no store, no rendering, no audio, no platform.
 *
 * That is why it is its own package. `music_api` (backend) and `music_lib`
 * (frontend) both need to read a MIDI file, and neither may depend on the
 * other; before this package existed the server imported the frontend library
 * to get at its importer, and separately hand-copied helpers to avoid doing
 * so. Both sides now depend on this, and on `@sudobility/music_types` for the
 * score model and the domain primitives these operate on.
 *
 * Raw byte work lives here too: `decodeMidi`/`encodeMidi` read and write
 * Standard MIDI Files, and `decodeTracker`/`encodeTracker` do the same for the
 * module formats. Only XML is still injected — `DOMParser` on the web and
 * `fast-xml-parser` on React Native are genuinely different implementations,
 * so `XmlParser` stays a platform capability in `@sudobility/music_io` while
 * the MusicXML semantics live here.
 */

// ---- MIDI -----------------------------------------------------------------
export * from './midi/errors.js';
export { decodeMidi } from './midi/decode.js';
export { encodeMidi } from './midi/encode.js';
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
export { exportMusicXml } from './musicxml/export.js';

// ---- The app's own project file (.moo) ----------------------------------
export * from './project/project-file.js';

// ---- File names, for every format above ----------------------------------
export * from './file-names.js';
/**
 * The two names each writer used to export for its own slug function. They
 * are one rule now (`exportBasename`: keep the title, replace only reserved
 * characters), and survive only because music_app still imports both through
 * music_lib. Aliases, not implementations — delete them once no app imports
 * them, rather than letting a second naming rule grow back behind one.
 */
export {
  exportBasename as safeFilename,
  exportBasename as musicXmlSafeFilename,
} from './file-names.js';

// ---- Tracker modules (MOD, S3M, XM, IT, MPTM) -----------------------------
/**
 * Bytes in and out. The individual format readers behind `decodeTracker` are
 * deliberately not exported: which one runs is decided by magic bytes, and
 * publishing five readers would make the choice a caller's problem.
 */
export { decodeTracker, encodeTracker } from './tracker/dispatch.js';
export * from './mod/export.js';
export * from './mod/fill.js';
export * from './mod/import.js';
export * from './mod/limits.js';
export * from './mod/timing.js';
export * from './mod/types.js';
