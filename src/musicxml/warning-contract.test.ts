/**
 * Every declared warning must be reachable.
 *
 * `MusicXmlWarnings` is a contract the host fills in — music_app hands over a
 * translated string per key. When the importer *gains* support for something,
 * the call site that warned about it goes away and the key is left behind:
 * still required of every host, still translated, and impossible to ever see.
 *
 * That has now happened four times — `ornaments`, `clefChangeDropped`,
 * `graceNotes`, `lyrics` and `tuplets` all outlived the limitation they
 * described. A warning that cannot fire is a lie in the contract and makes
 * hosts translate copy for behaviour the library no longer has, so this reads
 * the source and fails when one has no call site.
 *
 * Source-scanning rather than exercising fixtures deliberately: a fixture
 * suite proves a warning *can* fire, but proving one *cannot* would need a
 * fixture for every branch. The question here is narrower and static — is this
 * key referenced at all?
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEST_MUSICXML_WARNINGS } from '../test/musicxml-warnings.js';

// Resolved from the working directory rather than `import.meta.url`, which is
// not a `file:` URL under this vitest transform.
const source = readFileSync(
  resolve(process.cwd(), 'src/musicxml/import.ts'),
  'utf8'
);

/**
 * The keys declared on the `MusicXmlWarnings` type.
 *
 * The type lives in music_types now, and a type has no runtime form to walk —
 * so the keys are read off the test catalogue, which is typed as the whole
 * contract. A key added to the type and missing here fails to compile; one
 * removed from the type and left here fails too, as an excess property.
 */
function declaredKeys(): string[] {
  return Object.keys(TEST_MUSICXML_WARNINGS);
}

describe('the MusicXmlWarnings contract', () => {
  it('declares at least a handful of warnings', () => {
    // Guards the parser above: a regex that silently matched nothing would
    // make every assertion below vacuously true.
    expect(declaredKeys().length).toBeGreaterThan(5);
  });

  it('has a call site for every key it declares', () => {
    const unused = declaredKeys().filter(
      key => !new RegExp(`warnings\\.text\\.${key}\\b`).test(source)
    );

    expect(
      unused,
      `These warnings are declared but never raised, so every host translates ` +
        `copy that can never appear. Remove them from MusicXmlWarnings (and ` +
        `from the hosts) when the importer starts supporting what they ` +
        `describe: ${unused.join(', ')}`
    ).toEqual([]);
  });
});
