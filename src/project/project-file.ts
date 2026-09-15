/**
 * A project saved as a file: the score, plus its title.
 *
 * Two apps wrote two shapes. The native app's `.moo` document is
 * `{ version, title, score }`; the web's project export is
 * `{ name, schemaVersion, score }`. Each could read only its own, so a project
 * exported from the browser could not be opened on a phone. This writes the
 * native shape — versioned from the first release, since a file with no
 * version is one nobody can safely read later — and reads both.
 *
 * The score is validated with `parseScore` on the way in, because a file on
 * disk is exactly as untrusted as a network response: an older build, a hand
 * edit, a truncated write. A version from the future is refused rather than
 * read hopefully — a newer file may say something this build would drop, and
 * losing half a score on the next save is worse than not opening it.
 *
 * It lives with the other file formats rather than beside the model: it is a
 * format that carries notes, both apps read and write it, and it is exactly
 * the kind of thing a server may one day need to accept as an upload.
 *
 * Failures carry a `reason` so an app can word them; the English `message` is
 * for logs.
 */
import type { Score } from '@sudobility/music_types';
import { parseScore } from '@sudobility/music_types';

/** The format version this build writes and the newest it reads. */
export const PROJECT_FILE_VERSION = 1;

/** What the apps write. */
export const DOCUMENT_EXTENSION = 'moo';

/**
 * What the apps open: their own extension, the longer one documents were
 * saved under before it was shortened, and the web's `.json` project export.
 */
export const DOCUMENT_EXTENSIONS = [
  DOCUMENT_EXTENSION,
  'moosiac',
  'json',
] as const;

export type ProjectFile = {
  version: number;
  title: string;
  score: Score;
};

export type ProjectFileErrorReason =
  'invalidJson' | 'notAProject' | 'newerVersion' | 'invalidScore';

export class ProjectFileError extends Error {
  readonly reason: ProjectFileErrorReason;

  constructor(reason: ProjectFileErrorReason, message: string) {
    super(message);
    this.name = 'ProjectFileError';
    this.reason = reason;
  }
}

/** The file's text. Compact: this is a document, not something read by eye. */
export function serializeProjectFile(file: {
  title: string;
  score: Score;
}): string {
  const payload: ProjectFile = {
    version: PROJECT_FILE_VERSION,
    title: file.title,
    score: file.score,
  };
  return JSON.stringify(payload);
}

function nonBlank(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Reads either shape.
 *
 * The title is the file's `title`, else the web export's `name`, else the
 * score's own title, else `Untitled` — a blank name tells a reader less than
 * the title the music carries.
 */
export function parseProjectFile(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError(
      'invalidJson',
      'Not a Moosiac project: invalid JSON.'
    );
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ProjectFileError('notAProject', 'Not a Moosiac project.');
  }
  const record = raw as Record<string, unknown>;
  const version =
    typeof record.version === 'number'
      ? record.version
      : typeof record.schemaVersion === 'number'
        ? record.schemaVersion
        : null;
  if (version === null) {
    throw new ProjectFileError(
      'notAProject',
      'Not a Moosiac project: no format version.'
    );
  }
  if (version > PROJECT_FILE_VERSION) {
    throw new ProjectFileError(
      'newerVersion',
      `This project was written by a newer version of Moosiac (format ${version}).`
    );
  }
  let score: Score;
  try {
    score = parseScore(record.score);
  } catch (error) {
    throw new ProjectFileError(
      'invalidScore',
      `The score in this project could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  const title =
    nonBlank(record.title) ??
    nonBlank(record.name) ??
    nonBlank(score.metadata.title) ??
    'Untitled';
  return { version, title, score };
}
