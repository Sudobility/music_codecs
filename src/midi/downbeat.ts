/**
 * Where the first barline falls in a transcribed performance.
 *
 * The transcriber writes the tempo into the MIDI but leaves timing where it was
 * played — snapping to a grid is a notation decision, and it is made here, on
 * import, where the reader can see and undo it. Quantizing fixes *within-beat*
 * timing, but it cannot fix which beat is beat one: measures are built from tick
 * zero, so a recording that does not begin exactly on a downbeat has every
 * barline a fraction off, and a syncopated line reads as though it were written
 * against the wrong barline.
 *
 * This finds the anacrusis — the length of a pickup bar — so the first *strong*
 * beat becomes a downbeat. The tempo is already known (one beat is
 * `measureTicks / numerator`), so the only question is the phase: of the beats
 * in the bar, which one carries the weight. Each onset is placed at its position
 * within a bar, rounded to the nearest beat, and its weight (loudness, a proxy
 * for the kick and the snare that mark a beat) is added to that beat. The beat
 * that carries the most is taken as the downbeat; the ticks before it are the
 * pickup.
 *
 * A tie goes to beat one, so an evenly played passage gets no spurious pickup.
 * Pure and synchronous: it reads only onset ticks and weights.
 */

import { measureDurationTicks } from '@sudobility/music_types';
import type { TimeSignature } from '@sudobility/music_types';

/**
 * The pickup length in ticks that aligns the first strong beat to a downbeat,
 * or 0 when the performance already begins on one.
 *
 * `onsetTicks` are note starts in the score's own PPQ; `weights` (one per onset,
 * e.g. velocity) say how much each marks a beat — louder onsets pull harder.
 * Omit `weights` to count every onset the same.
 */
export function detectAnacrusisTicks(
  onsetTicks: readonly number[],
  ppq: number,
  timeSignature: TimeSignature,
  weights?: readonly number[]
): number {
  const measureTicks = measureDurationTicks(timeSignature, ppq);
  const beats = timeSignature.numerator;
  if (onsetTicks.length === 0 || measureTicks <= 0 || beats <= 0) return 0;

  const beatTicks = measureTicks / beats;
  const perBeat = new Array<number>(beats).fill(0);
  for (let i = 0; i < onsetTicks.length; i += 1) {
    const phase =
      ((onsetTicks[i] % measureTicks) + measureTicks) % measureTicks;
    const beatIndex = Math.round(phase / beatTicks) % beats;
    perBeat[beatIndex] += weights?.[i] ?? 1;
  }

  // The strongest beat is the downbeat; `>` keeps the earliest on a tie, so an
  // evenly weighted bar resolves to beat one and no pickup is invented.
  let downbeat = 0;
  for (let b = 1; b < beats; b += 1) {
    if (perBeat[b] > perBeat[downbeat]) downbeat = b;
  }

  const pickup = downbeat * beatTicks;
  return pickup > 0 ? Math.round(pickup) : 0;
}
