import { describe, expect, it } from 'vitest';
import { decodeTracker } from './dispatch.js';
import { buildMod } from './fixture.js';
import { buildDsm } from './dsm-fixture.js';
import { buildS3m } from './s3m-fixture.js';
import { buildXm } from './xm-fixture.js';

describe('decodeTracker', () => {
  it('decodes a ProTracker module', () => {
    expect(decodeTracker(buildMod({ title: 'Elysium' })).format).toBe('mod');
  });

  it('decodes a DSM module', () => {
    expect(decodeTracker(buildDsm({ title: 'Race' })).format).toBe('dsm');
  });

  it('chooses by magic bytes rather than by extension, which it never sees', () => {
    // A mis-named file still imports; that is the whole reason for sniffing.
    expect(decodeTracker(buildDsm({})).format).toBe('dsm');
    expect(decodeTracker(buildMod({})).format).toBe('mod');
  });

  it('decodes a Scream Tracker module', () => {
    expect(decodeTracker(buildS3m({ title: 'Portal' })).format).toBe('s3m');
  });

  it('decodes a FastTracker module', () => {
    expect(decodeTracker(buildXm({ title: 'sunlight' })).format).toBe('xm');
  });

  it('names what it found when it recognises nothing', () => {
    const junk = new Uint8Array(2000);
    junk.set([0x50, 0x4b, 0x03, 0x04], 0); // a zip
    expect(() => decodeTracker(junk.buffer)).toThrow(/not a .*module/i);
  });
});
