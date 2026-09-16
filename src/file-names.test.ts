import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '@sudobility/music_types';
import { exportBasename, exportFilename, importedTitle } from './file-names.js';

describe('exportFilename', () => {
  it('keeps the title as written, non-ASCII included', () => {
    expect(exportFilename('Wedding March', 'mid')).toBe('Wedding March.mid');
    expect(exportFilename('月光 Sonata', 'musicxml')).toBe(
      '月光 Sonata.musicxml'
    );
  });

  it('replaces only the characters a filesystem reserves', () => {
    expect(exportFilename('a/b\\c:d*e?f"g<h>i|j', 'xm')).toBe(
      'a-b-c-d-e-f-g-h-i-j.xm'
    );
  });

  it('falls back to Untitled for a blank title', () => {
    expect(exportFilename('', 'wav')).toBe('Untitled.wav');
    expect(exportFilename('   ', 'wav')).toBe('Untitled.wav');
    expect(exportFilename(undefined, 'mp3')).toBe('Untitled.mp3');
  });

  it('accepts an extension with or without its dot', () => {
    expect(exportFilename('Song', '.moo')).toBe('Song.moo');
  });
});

describe('exportBasename', () => {
  it('is the same rule without the extension', () => {
    expect(exportBasename('Twinkle Twinkle Little Star')).toBe(
      'Twinkle Twinkle Little Star'
    );
    expect(exportBasename('Score #2 (draft)')).toBe('Score #2 (draft)');
    expect(exportBasename('  a:b  ')).toBe('a-b');
    expect(exportBasename('   ')).toBe('Untitled');
  });
});

describe('importedTitle', () => {
  it('prefers the title the score carries', () => {
    const score = createEmptyScore({ title: '  Nocturne ' });
    expect(importedTitle(score, 'file.mid')).toBe('Nocturne');
  });

  it('falls back to the file name without its extension', () => {
    const score = createEmptyScore({ title: '' });
    expect(importedTitle(score, 'Bach Invention 1.mid')).toBe(
      'Bach Invention 1'
    );
    expect(importedTitle(score, '/var/mobile/tmp/song.v2.musicxml')).toBe(
      'song.v2'
    );
    expect(importedTitle(score, 'C:\\Users\\me\\tune.xm')).toBe('tune');
  });

  it('is Untitled when neither says anything', () => {
    const score = createEmptyScore({ title: '' });
    expect(importedTitle(score, '')).toBe('Untitled');
    expect(importedTitle(score, '.mid')).toBe('Untitled');
  });
});

describe('the old slug names', () => {
  it('are gone, so a second naming rule has nowhere to grow back', async () => {
    // `safeFilename` and `musicXmlSafeFilename` were each writer's own slug
    // function, then aliases of `exportBasename` kept while music_app still
    // imported them. Nothing does now; a name that survives with no caller is
    // the first thing somebody reimplements "to match the old behaviour".
    const index: Record<string, unknown> = await import('./index.js');
    expect(index).not.toHaveProperty('safeFilename');
    expect(index).not.toHaveProperty('musicXmlSafeFilename');
  });
});
