/**
 * Names for files going out and titles for files coming in.
 *
 * **An exported file keeps its title.** The web used to slug titles to ASCII
 * for MIDI and MusicXML (`Wedding March` -> `wedding-march`, and `月光` ->
 * `untitled`) and name the project export after the project, while the native
 * app kept the title as written — so the same score exported from the two apps
 * arrived under two different names. The title is the reader's, so it
 * survives; only the characters a filesystem reserves are replaced.
 *
 * There used to be two slug functions here, one in each writer, "kept as a
 * local copy so this module has no cross-adapter dependency". Two copies of a
 * naming rule are two rules the moment one is edited, so every format now
 * names its file through this one.
 */
import type { Score } from '@sudobility/music_types';

const RESERVED = /[/\\:*?"<>|]/g;

/**
 * The file name for `title`, without an extension: reserved characters become
 * `-`, surrounding whitespace is trimmed, and a blank title is `Untitled`.
 */
export function exportBasename(title: string | undefined): string {
  return (title ?? '').replace(RESERVED, '-').trim() || 'Untitled';
}

/** `Wedding March` + `mid` -> `Wedding March.mid`. Blank is `Untitled`. */
export function exportFilename(
  title: string | undefined,
  extension: string
): string {
  return `${exportBasename(title)}.${extension.replace(/^\.+/, '')}`;
}

/**
 * The title an imported score is given: the title it carries, else the name
 * of the file it came from without its extension (a MIDI file often carries no
 * title, and "Untitled" tells the reader less than the name they picked the
 * file by), else `Untitled`. Accepts a bare name, a path or a URI.
 */
export function importedTitle(score: Score, fileName: string): string {
  const stored = score.metadata.title?.trim();
  if (stored) return stored;
  const segments = fileName.split(/[/\\]/);
  const base = segments[segments.length - 1] ?? '';
  return base.replace(/\.[^.]+$/, '').trim() || 'Untitled';
}
