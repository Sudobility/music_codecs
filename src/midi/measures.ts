/**
 * Measure-timeline assembly for MIDI import (spec §15): turns a
 * time-signature change list + a score end tick into consecutive `Measure`
 * spans, and assembles a track's per-voice absolute-tick note events into
 * `Measure[]` (splitting notes across measure boundaries with ties, filling
 * silent gaps with rests). Kept independent of `@tonejs/midi` so it's usable
 * (and unit-testable) purely in terms of the domain model.
 */
import { createId } from '@sudobility/music_types';
import { splitNoteAcrossMeasures } from '@sudobility/music_types';
import type {
  KeySignature,
  Measure,
  MeasureSpan,
  TimeSignatureChange,
  MusicalEvent,
  NoteEvent,
} from '@sudobility/music_types';
import { measureDurationTicks } from '@sudobility/music_types';
import { DEFAULT_TIME_SIGNATURE } from '@sudobility/music_types';

/**
 * Computes consecutive measure spans covering `[0, endTick)` from a set of
 * time-signature changes (need not include a tick-0 entry — one is
 * synthesized at `DEFAULT_TIME_SIGNATURE` if missing; need not be sorted).
 * Always returns at least one span (a silent/empty file still gets a single
 * default-meter measure, mirroring `createEmptyScore`'s "at least one
 * measure" convention).
 *
 * A change tick that doesn't land exactly on a measure boundary of the
 * preceding meter (uncommon, but not disallowed by the MIDI format) is
 * absorbed into whichever measure is in progress when it's reached, rather
 * than truncating a partial measure — a documented simplification, not a
 * full mid-measure meter change.
 *
 * `pickupTicks`, when positive and shorter than the first full measure, makes
 * the first span a pickup bar of that length so the following barlines fall on
 * real downbeats (see `detectAnacrusisTicks`). It is only passed for
 * transcription, where there are no meter changes to collide with; an ordinary
 * import passes 0 and is unchanged.
 */
export function buildMeasureSpans(
  changes: TimeSignatureChange[],
  ppq: number,
  endTick: number,
  pickupTicks = 0
): MeasureSpan[] {
  const sorted = [...changes].sort((a, b) => a.tick - b.tick);
  const withOrigin =
    sorted.length > 0 && sorted[0].tick === 0
      ? sorted
      : [{ tick: 0, timeSignature: DEFAULT_TIME_SIGNATURE }, ...sorted];

  const spans: MeasureSpan[] = [];
  let cursor = 0;
  let index = 0;

  // A pickup bar: a short first measure in the opening meter, so every full bar
  // after it begins on a downbeat. Guarded to be shorter than a full bar — a
  // "pickup" as long as the bar is just the bar.
  const firstMeasureTicks = measureDurationTicks(
    withOrigin[0].timeSignature,
    ppq
  );
  if (pickupTicks > 0 && pickupTicks < firstMeasureTicks) {
    spans.push({
      index: 0,
      startTick: 0,
      durationTicks: pickupTicks,
      timeSignature: withOrigin[0].timeSignature,
    });
    cursor = pickupTicks;
    index = 1;
  }

  for (let i = 0; i < withOrigin.length; i += 1) {
    const timeSignature = withOrigin[i].timeSignature;
    const measureTicks = measureDurationTicks(timeSignature, ppq);
    if (measureTicks <= 0) continue;

    const isLastSegment = i === withOrigin.length - 1;
    const segmentEnd = isLastSegment
      ? Math.max(endTick, cursor + measureTicks)
      : withOrigin[i + 1].tick;

    while (cursor < segmentEnd) {
      spans.push({
        index,
        startTick: cursor,
        durationTicks: measureTicks,
        timeSignature,
      });
      cursor += measureTicks;
      index += 1;
    }
  }

  if (spans.length === 0) {
    const measureTicks = measureDurationTicks(DEFAULT_TIME_SIGNATURE, ppq);
    spans.push({
      index: 0,
      startTick: 0,
      durationTicks: measureTicks,
      timeSignature: DEFAULT_TIME_SIGNATURE,
    });
  }

  return spans;
}

/**
 * Fills the gaps in one measure-voice's already-non-overlapping notes with
 * fresh `RestEvent`s so the voice's events cover `[startTick, startTick +
 * durationTicks)` exactly (spec §23's "voice content sums exactly to
 * measure duration" invariant). Notes sharing an identical `startTick`
 * (chords) are left as-is; `notes` need not be pre-sorted.
 */
function fillVoiceGaps(
  notes: NoteEvent[],
  startTick: number,
  durationTicks: number,
  trackId: string,
  voiceId: string
): MusicalEvent[] {
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
  const events: MusicalEvent[] = [];
  const endTick = startTick + durationTicks;
  let cursor = startTick;

  for (const note of sorted) {
    if (note.startTick > cursor) {
      events.push({
        id: createId(),
        startTick: cursor,
        durationTicks: note.startTick - cursor,
        voiceId,
        trackId,
      });
    }
    events.push({ ...note, trackId, voiceId });
    cursor = Math.max(cursor, note.startTick + note.durationTicks);
  }

  if (cursor < endTick) {
    events.push({
      id: createId(),
      startTick: cursor,
      durationTicks: endTick - cursor,
      voiceId,
      trackId,
    });
  }

  return events;
}

/**
 * Assembles one track's `Measure[]` from `voiceLanes` — each inner array a
 * "notated voice" of mutually non-overlapping, absolute-tick `NoteEvent`s
 * (as produced by `allocateVoices`) — over `spans`. A note spanning more
 * than one span is split at every internal span boundary via
 * `splitNoteAcrossMeasures` (producing a tied chain); each span's voice
 * content is then gap-filled with rests. An empty `voiceLanes` (a track
 * with no notes at all) still produces one fully-rested voice per measure,
 * satisfying the "every measure has >=1 voice per track" invariant.
 */
export function assembleTrackMeasures(
  voiceLanes: NoteEvent[][],
  spans: MeasureSpan[],
  keySignature: KeySignature,
  trackId: string
): Measure[] {
  const boundaries = spans.map(s => s.startTick);
  const lanes = voiceLanes.length > 0 ? voiceLanes : [[]];
  const splitLanes = lanes.map(lane =>
    lane.flatMap(note => splitNoteAcrossMeasures(note, boundaries))
  );

  return spans.map(span => {
    const spanEnd = span.startTick + span.durationTicks;
    const voices = splitLanes.map((lane, laneIndex) => {
      const notesInSpan = lane.filter(
        n => n.startTick >= span.startTick && n.startTick < spanEnd
      );
      const voiceId = createId();
      return {
        id: voiceId,
        name: `Voice ${laneIndex + 1}`,
        events: fillVoiceGaps(
          notesInSpan,
          span.startTick,
          span.durationTicks,
          trackId,
          voiceId
        ),
      };
    });

    return {
      id: createId(),
      index: span.index,
      startTick: span.startTick,
      durationTicks: span.durationTicks,
      timeSignature: span.timeSignature,
      keySignature,
      voices,
    };
  });
}
