import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '@sudobility/music_types';
import {
  DOCUMENT_EXTENSION,
  DOCUMENT_EXTENSIONS,
  PROJECT_FILE_VERSION,
  ProjectFileError,
  parseProjectFile,
  serializeProjectFile,
} from './project-file.js';

const score = createEmptyScore({ title: 'Wedding March' });

function reasonOf(text: string): string | null {
  try {
    parseProjectFile(text);
    return null;
  } catch (error) {
    return error instanceof ProjectFileError ? error.reason : 'other';
  }
}

describe('project file extensions', () => {
  it("writes .moo and opens the older .moosiac and the web's .json", () => {
    expect(DOCUMENT_EXTENSION).toBe('moo');
    expect(DOCUMENT_EXTENSIONS).toEqual(['moo', 'moosiac', 'json']);
  });
});

describe('serializeProjectFile', () => {
  it('writes a versioned title and score', () => {
    const parsed = JSON.parse(serializeProjectFile({ title: 'Mine', score }));
    expect(parsed).toEqual({
      version: PROJECT_FILE_VERSION,
      title: 'Mine',
      score: JSON.parse(JSON.stringify(score)),
    });
    expect(PROJECT_FILE_VERSION).toBe(1);
  });
});

describe('parseProjectFile', () => {
  it('round-trips what it writes', () => {
    const file = parseProjectFile(
      serializeProjectFile({ title: 'Mine', score })
    );
    expect(file.version).toBe(1);
    expect(file.title).toBe('Mine');
    expect(file.score.metadata.title).toBe('Wedding March');
    expect(file.score.tracks).toHaveLength(score.tracks.length);
  });

  it("reads the web's project export, taking its name as the title", () => {
    const text = JSON.stringify(
      { name: 'Exported', schemaVersion: 1, score },
      null,
      2
    );
    const file = parseProjectFile(text);
    expect(file.title).toBe('Exported');
    expect(file.version).toBe(1);
  });

  it("falls back to the score's own title, then Untitled", () => {
    expect(
      parseProjectFile(JSON.stringify({ name: '', schemaVersion: 1, score }))
        .title
    ).toBe('Wedding March');
    const untitled = { ...score, metadata: { ...score.metadata, title: '' } };
    expect(
      parseProjectFile(JSON.stringify({ version: 1, score: untitled })).title
    ).toBe('Untitled');
  });

  it('refuses invalid JSON, non-objects and files with no version', () => {
    expect(reasonOf('{not json')).toBe('invalidJson');
    expect(reasonOf('42')).toBe('notAProject');
    expect(reasonOf(JSON.stringify({ title: 'x', score }))).toBe('notAProject');
  });

  it('refuses a file from a newer format rather than reading it hopefully', () => {
    expect(reasonOf(JSON.stringify({ version: 2, title: 'x', score }))).toBe(
      'newerVersion'
    );
    expect(
      reasonOf(JSON.stringify({ name: 'x', schemaVersion: 9, score }))
    ).toBe('newerVersion');
  });

  it('refuses a score that does not validate', () => {
    expect(
      reasonOf(JSON.stringify({ version: 1, title: 'x', score: { nope: 1 } }))
    ).toBe('invalidScore');
  });
});
