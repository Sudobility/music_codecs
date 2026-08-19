/**
 * The rules that make this package shareable.
 *
 * These are the reason it exists: `music_api` (backend) and `music_lib`
 * (frontend) both decode MIDI, and neither may depend on the other. That only
 * holds while this package stays free of both, and of anything platform-shaped
 * — a single `import` of a renderer or an `AudioContext` would put it back out
 * of the server's reach, silently, until someone tried to deploy.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  '@sudobility/music_lib',
  '@sudobility/music_io',
  'vexflow',
  'tone',
  '@tonejs/midi',
];

function sourceFiles(): string[] {
  return (
    globSync('src/**/*.ts', { cwd: process.cwd() })
      .filter(f => !f.includes('.test.'))
      // `src/test/` is scaffolding, not shipped: `package.json`'s `files` and the
      // build both leave it out. It is where the real MIDI codec lives for tests
      // to round-trip through — the one place `@tonejs/midi` is legitimate here,
      // and the reason this package no longer borrows one from `music_io`.
      .filter(f => !f.startsWith('test/') && !f.includes('/test/'))
      .map(f => join(process.cwd(), f))
  );
}

describe('package boundaries', () => {
  it('imports nothing from music_lib, music_io or a platform', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const banned of FORBIDDEN) {
        if (
          text.includes(`from '${banned}`) ||
          text.includes(`from "${banned}`)
        ) {
          offenders.push(`${file}: ${banned}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('depends on music_types and nothing else at runtime', () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    );
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    expect(Object.keys(pkg.peerDependencies ?? {})).toEqual([
      '@sudobility/music_types',
    ]);
  });
});
