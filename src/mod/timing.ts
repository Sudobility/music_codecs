/**
 * Turning a module's two timing knobs into a musical tempo.
 *
 * Pure arithmetic over the parsed cells — no score model, no bytes — so the
 * conversion is testable against known values. Lives in music_lib rather than
 * music_io because it is a musical conversion, not byte handling: the codec
 * returns raw data and the mapping happens here, exactly as MIDI does.
 *
 * `periodToMidi` used to live here and now lives beside the MOD reader in
 * music_io: every other tracker format stores note numbers directly, so the
 * decoder is the only thing that ever sees a period.
 */
import type { TrackerCell } from '@sudobility/music_types';
import { MAX_BPM, MIN_BPM } from '@sudobility/music_types';

/**
 * The two knobs a module boots with when its cells set neither.
 *
 * Named for the format rather than for us: 125 here is a tracker *tempo*
 * value, and the fact that it also comes out as 125 musical BPM at the
 * default speed is arithmetic, not identity. Three files declared it, two of
 * them calling it `DEFAULT_BPM`, which is how one of them ended up writing
 * the format's default where the score's belonged.
 */
export const TRACKER_DEFAULT_SPEED = 6;
export const TRACKER_DEFAULT_TEMPO = 125;

/**
 * Musical BPM from the two knobs.
 *
 * A row is a sixteenth (four to the beat) and a tick lasts 2.5/tempo seconds,
 * so a beat is `4 × speed × 2.5 / tempo` seconds — which reduces to
 * `6 × tempo / speed` beats per minute. At the defaults that is 125, as it
 * should be.
 */
export function effectiveBpm(speed: number, tempo: number): number {
  if (speed <= 0) return TRACKER_DEFAULT_TEMPO;
  // Clamped to what a score can hold. A module is free to set a speed of 1,
  // which at the default tempo works out to 750 BPM — real, and outside the
  // 20-400 the score model accepts, so an unclamped value imports a score the
  // validator rejects outright. A real S3M (modarchive 54606) does exactly
  // this. Clamping keeps the music fast and the score valid; the alternative
  // is a failed import.
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round((6 * tempo) / speed)));
}

export type TempoChange = { row: number; bpm: number };

/** One entry at row 0, then one wherever either knob actually moves. */
export function tempoChanges(rows: readonly TrackerCell[][]): TempoChange[] {
  let speed = TRACKER_DEFAULT_SPEED;
  let tempo = TRACKER_DEFAULT_TEMPO;
  const changes: TempoChange[] = [{ row: 0, bpm: effectiveBpm(speed, tempo) }];

  rows.forEach((cells, row) => {
    let moved = false;
    for (const cell of cells) {
      // Already normalised by the decoder: which effect carries which knob is
      // format knowledge and does not belong here.
      if (
        cell.speed !== undefined &&
        cell.speed !== 0 &&
        speed !== cell.speed
      ) {
        speed = cell.speed;
        moved = true;
      }
      if (cell.bpm !== undefined && cell.bpm !== 0 && tempo !== cell.bpm) {
        tempo = cell.bpm;
        moved = true;
      }
    }
    if (!moved) return;
    const bpm = effectiveBpm(speed, tempo);
    // Row 0's entry exists already, seeded from the *defaults* — so it has to be
    // rewritten rather than skipped. Skipping it (which this did) threw away the
    // tempo of every module that states one on its first row, which is where a
    // module normally states it: the import silently came in at the 125 BPM
    // default instead.
    if (row === 0) changes[0] = { row: 0, bpm };
    else changes.push({ row, bpm });
  });

  return changes;
}
