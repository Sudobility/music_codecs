/**
 * Hand-built tracker modules, for downstream tests.
 *
 * Its own entry point rather than part of the root export: these build files,
 * they do not read or write scores, so they have no business in the surface an
 * app imports. `@sudobility/music_io` published `buildMod` from its `/mocks`
 * entry for exactly this reason and exactly this consumer — the app's e2e,
 * which needs a real module to import and must not maintain a second builder
 * that could drift from the reader it is testing. The builder moved here with
 * the readers; the reasoning did not change.
 */
export { buildMod } from './tracker/fixture.js';
export { buildDsm } from './tracker/dsm-fixture.js';
export { buildIt } from './tracker/it-fixture.js';
export { buildS3m } from './tracker/s3m-fixture.js';
export { buildXm } from './tracker/xm-fixture.js';
export type { DsmCellSpec, DsmOptions } from './tracker/dsm-fixture.js';
export type { ItCellSpec, ItPatternSpec, ItOptions } from './tracker/it-fixture.js';
export type { S3mCellSpec, S3mOptions } from './tracker/s3m-fixture.js';
export type { XmCellSpec, XmPatternSpec, XmOptions } from './tracker/xm-fixture.js';
