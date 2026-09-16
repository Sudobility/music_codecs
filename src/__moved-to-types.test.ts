/**
 * The codec result and option types live in `@sudobility/music_types`, once.
 *
 * They moved there so both apps and the file layer name one declaration, and
 * music_lib re-exports both packages wholesale: a name declared — or merely
 * re-exported — here again reaches music_lib by two routes, which is a TS2308
 * in its build and a "Cannot redefine property" crash in any CommonJS
 * consumer. So this fails if one comes back, as a declaration or a re-export.
 */
import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import * as codecs from './index.js';

const MOVED = [
  'MidiSummary',
  'MidiTrackSummary',
  'MidiTempoEventSummary',
  'MidiTimeSignatureSummary',
  'DetectedGrid',
  'MidiImportOptions',
  'MidiTrackSelection',
  'MidiImportResult',
  'MusicXmlImportResult',
  'MusicXmlWarnings',
  'TrackerFitReport',
  'TRACKER_FIT_LOSSES',
  'TrackerFitLoss',
  'TrackerExportOptions',
  'TrackerExportResult',
  'WritableTrackerFormat',
  'TrackerLimits',
  'TimeSignatureChange',
  'MeasureSpan',
  // The project file's name, version and shape; the parser stays here.
  'DOCUMENT_EXTENSION',
  'DOCUMENT_EXTENSIONS',
  'PROJECT_FILE_VERSION',
  'ProjectFile',
  'ProjectFileErrorReason',
  // The tracker module shape, which was re-exported from `mod/types.ts`.
  'TrackerCell',
  'TrackerFormat',
  'TrackerInstrument',
  'TrackerModule',
];

describe('types that moved to music_types', () => {
  it('are not exported at runtime', () => {
    expect(MOVED.filter(name => name in codecs)).toEqual([]);
  });

  it('are neither declared nor re-exported by any source file', () => {
    const offenders: string[] = [];
    for (const file of globSync('src/**/*.ts')) {
      if (file.includes('.test.')) continue;
      const text = readFileSync(file, 'utf8');
      for (const name of MOVED) {
        const declared = new RegExp(
          `export\\s+(?:declare\\s+)?(?:type|interface|const|class|function|enum)\\s+${name}\\b`
        );
        const reexported = new RegExp(
          `export\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}`
        );
        if (declared.test(text) || reexported.test(text))
          offenders.push(`${name} in ${file}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
