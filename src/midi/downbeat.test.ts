import { describe, expect, it } from 'vitest';
import type { TimeSignature } from '@sudobility/music_types';
import { detectAnacrusisTicks } from './downbeat.js';

const PPQ = 480;
const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 };
const THREE_FOUR: TimeSignature = { numerator: 3, denominator: 4 };
// 4/4 at 480 PPQ: a bar is 1920 ticks, a beat is 480.

describe('detectAnacrusisTicks', () => {
  it('returns no pickup when the strong beats are already on the downbeat', () => {
    // Every bar's beat 1 (phase 0) carries the weight.
    const onsets = [0, 1920, 3840];
    expect(detectAnacrusisTicks(onsets, PPQ, FOUR_FOUR, [10, 10, 10])).toBe(0);
  });

  it('finds a two-beat pickup when the strong beat sits on beat three', () => {
    // The kick lands at phase 960 (beat index 2) in every bar; the downbeat is
    // there, so the first 960 ticks are a pickup.
    const onsets = [960, 2880, 4800];
    expect(detectAnacrusisTicks(onsets, PPQ, FOUR_FOUR, [10, 10, 10])).toBe(
      960
    );
  });

  it('weights louder onsets as the beat', () => {
    // Quiet onsets on every beat, loud ones on beat two (phase 480).
    const onsets = [0, 480, 960, 1440, 1920, 2400];
    const weights = [1, 20, 1, 1, 1, 20];
    expect(detectAnacrusisTicks(onsets, PPQ, FOUR_FOUR, weights)).toBe(480);
  });

  it('breaks an even tie in favour of beat one (no spurious pickup)', () => {
    // Equal weight on beat one and beat three.
    const onsets = [0, 960, 1920, 2880];
    expect(detectAnacrusisTicks(onsets, PPQ, FOUR_FOUR, [10, 10, 10, 10])).toBe(
      0
    );
  });

  it('snaps an off-beat onset to its nearest beat', () => {
    // Onsets a little after beat three (phase ~1000) still count as beat three.
    const onsets = [1000, 2920, 4840];
    expect(detectAnacrusisTicks(onsets, PPQ, FOUR_FOUR, [10, 10, 10])).toBe(
      960
    );
  });

  it('works in 3/4', () => {
    // Bar is 1440 ticks; strong beat at phase 480 (beat two) -> one-beat pickup.
    const onsets = [480, 1920, 3360];
    expect(detectAnacrusisTicks(onsets, PPQ, THREE_FOUR, [10, 10, 10])).toBe(
      480
    );
  });

  it('counts every onset the same when no weights are given', () => {
    const onsets = [960, 2880, 4800];
    expect(detectAnacrusisTicks(onsets, PPQ, FOUR_FOUR)).toBe(960);
  });

  it('returns 0 for an empty performance', () => {
    expect(detectAnacrusisTicks([], PPQ, FOUR_FOUR)).toBe(0);
  });
});
