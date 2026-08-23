/**
 * Picking the right tracker reader for a run of bytes.
 *
 * One implementation, not three: nothing about reading a module is
 * platform-bound. This used to be a `TrackerCodec` capability injected from
 * `@sudobility/music_io` for surface consistency, which meant a pure byte
 * reader lived in the platform package and could not be reached from the
 * server at all. It is a function now, beside the readers it dispatches to.
 */
import type { TrackerModule } from '@sudobility/music_types';
import { readMod } from './read.js';
import { readDsm } from './dsm.js';
import { readIt } from './it.js';
import { readS3m } from './s3m.js';
import { readXm } from './xm.js';
import { encodeXm } from './xm-write.js';

/** For signatures longer than four bytes; `fourCC` cannot express XM's 17-character one. */
function asciiAt(bytes: Uint8Array, at: number, length: number): string {
  if (at + length > bytes.length) return '';
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[at + i]);
  return out;
}

function fourCC(bytes: Uint8Array, at: number): string {
  if (at + 4 > bytes.length) return '';
  return String.fromCharCode(
    bytes[at],
    bytes[at + 1],
    bytes[at + 2],
    bytes[at + 3]
  );
}

/**
 * Chooses a reader by magic bytes, never by file extension.
 *
 * A mis-named module still imports, and an unrecognised file fails saying
 * what was actually at the front of it rather than "parse error".
 */
export function decodeTracker(bytes: ArrayBuffer): TrackerModule {
  const view = new Uint8Array(bytes);
  if (fourCC(view, 0) === 'RIFF' && fourCC(view, 8) === 'DSMF')
    return readDsm(bytes);
  // IT and MPTM share this magic and this reader; they differ only in `cmwt`.
  if (fourCC(view, 0) === 'IMPM') return readIt(bytes);
  if (fourCC(view, 44) === 'SCRM') return readS3m(bytes);
  // 17 characters including the trailing space, so not a fourCC.
  if (asciiAt(view, 0, 17) === 'Extended Module: ') return readXm(bytes);
  // MOD's magic sits at 1080, past the header, and `readMod` validates it —
  // so it is the fallback rather than something sniffed twice.
  return readMod(bytes);
}

/**
 * Writes a module out in the format it names.
 *
 * Only the formats export supports are written; DSM and MPTM are import-only
 * by design, and throwing names the format rather than silently writing a
 * near neighbour the user did not ask for.
 */
export function encodeTracker(module: TrackerModule): ArrayBuffer {
  if (module.format === 'xm') return encodeXm(module);
  throw new Error(`Writing "${module.format}" is not supported yet`);
}
