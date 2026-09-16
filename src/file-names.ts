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
 * Control characters, which are less a reserved *character* than a way of not
 * getting the name you asked for.
 *
 * A NUL truncates the name at the OS layer on every platform this ships to — a
 * score titled `So<NUL>ng` was written as `So`, so what landed on disk was not
 * what was asked for — and a tab or a newline in a file name is unprintable
 * wherever it goes. Windows rejects the whole range outright, alongside the
 * nine characters above.
 *
 * Removed rather than turned into `-`, and removed *first*: a title whose only
 * offence is a leading newline should still trim away to the title, and it
 * cannot once that newline has become a dash. `music_io`'s `safeFilename` —
 * the last thing a name passes before a real write — strips the same set, for
 * the same stated reason.
 *
 * `\p{Cc}` rather than a numeric range: it is the Unicode control category
 * itself, so it says what it means and covers DEL and the C1 controls too.
 */
const CONTROL = /\p{Cc}/gu;

/**
 * The file name for `title`, without an extension: control characters are
 * dropped, reserved characters become `-`, surrounding whitespace is trimmed,
 * and a blank title is `Untitled`.
 */
export function exportBasename(title: string | undefined): string {
  return (
    (title ?? '').replace(CONTROL, '').replace(RESERVED, '-').trim() ||
    'Untitled'
  );
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
