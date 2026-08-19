import { defineConfig } from 'vitest/config';

/**
 * jsdom, for one reason only: two MusicXML suites reach for `DOMParser` to
 * assert on the document a writer produced. Nothing in `src/` touches the DOM —
 * the importer takes an injected `XmlParser` — so this is a test-environment
 * convenience, not a platform dependency of the package.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
