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
      // build both leave it out. It used to hold a hand-copied MIDI codec for
      // tests to round-trip through; the real one is in `src/midi/` now, so all
      // that is left there are score fixtures and a jsdom `XmlParser`.
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

  /**
   * `@tonejs/midi` is the independent implementation the MIDI codec is checked
   * against, and nothing more. It is a devDependency; the moment it appears in
   * shipped source, this package stops being installable without it.
   */
  it('confines @tonejs/midi to tests', () => {
    const shipped = globSync('src/**/*.ts', { cwd: process.cwd() })
      .filter(f => !f.includes('.test.'))
      .filter(f => !f.startsWith('test/') && !f.includes('/test/'));
    // Matched as an import, not as a substring: several of these modules
    // explain in prose how they differ from `@tonejs/midi`, and a comment
    // naming it is the opposite of a dependency on it.
    const offenders = shipped.filter(f => {
      const text = readFileSync(join(process.cwd(), f), 'utf8');
      return (
        text.includes("from '@tonejs/midi") ||
        text.includes('from "@tonejs/midi') ||
        text.includes("require('@tonejs/midi")
      );
    });
    expect(offenders).toEqual([]);

    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    );
    expect(pkg.devDependencies['@tonejs/midi']).toBeDefined();
    expect(pkg.dependencies?.['@tonejs/midi']).toBeUndefined();
    expect(pkg.peerDependencies?.['@tonejs/midi']).toBeUndefined();
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
