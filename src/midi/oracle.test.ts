import { describe, expect, it } from 'vitest';
import * as midiModule from '@tonejs/midi';
import type { MidiFile } from '@sudobility/music_types';
import { decodeMidi } from './decode.js';
import { encodeMidi } from './encode.js';

/**
 * `@tonejs/midi` as an independent implementation to check ours against.
 *
 * A devDependency and a test-only import: this package ships with
 * `dependencies: []`, and `__architecture.test.ts` keeps `@tonejs/midi` out of
 * `src/`. It is here because there is no real `.mid` fixture anywhere in the
 * family, so without a second implementation every MIDI test round-trips
 * through the codec under test and a spec-wrong codec passes all of them.
 *
 * `@tonejs/midi` publishes CommonJS as `main` and ESM only via `module`, so
 * which shape a named import resolves to depends on the runner. Reading the
 * constructor off the namespace works under all of them.
 */
type MidiConstructor = typeof import('@tonejs/midi').Midi;
const namespace = midiModule as unknown as {
  Midi?: MidiConstructor;
  default?: { Midi: MidiConstructor };
};
const Midi: MidiConstructor =
  namespace.Midi ??
  namespace.default?.Midi ??
  (() => {
    throw new Error('@tonejs/midi did not export Midi under any known shape.');
  })();

const SAMPLE: MidiFile = {
  header: {
    ppq: 480,
    name: 'Oracle',
    tempos: [
      { ticks: 0, bpm: 120 },
      { ticks: 1920, bpm: 90 },
    ],
    timeSignatures: [{ ticks: 0, timeSignature: [3, 4] }],
  },
  tracks: [
    {
      name: 'Right',
      channel: 0,
      instrument: { number: 0, name: 'Acoustic Grand Piano' },
      notes: [
        { midi: 60, ticks: 0, durationTicks: 480, velocity: 100 / 127 },
        { midi: 64, ticks: 480, durationTicks: 240, velocity: 80 / 127 },
        { midi: 67, ticks: 960, durationTicks: 960, velocity: 127 / 127 },
      ],
      controlChanges: {
        7: [{ number: 7, ticks: 0, value: 100 / 127 }],
        10: [{ number: 10, ticks: 0, value: 32 / 127 }],
      },
      durationTicks: 1920,
      durationSeconds: 2,
    },
    {
      name: 'Left',
      channel: 1,
      instrument: { number: 40, name: 'Violin' },
      notes: [{ midi: 48, ticks: 0, durationTicks: 1920, velocity: 64 / 127 }],
      controlChanges: {},
      durationTicks: 1920,
      durationSeconds: 2,
    },
  ],
  duration: 2,
};

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

describe('our encoder against @tonejs/midi', () => {
  it('writes bytes @tonejs/midi reads back with the same notes', () => {
    const theirs = new Midi(asBuffer(encodeMidi(SAMPLE)));

    expect(theirs.header.ppq).toBe(480);
    expect(theirs.header.name).toBe('Oracle');
    expect(theirs.header.timeSignatures[0].timeSignature).toEqual([3, 4]);
    expect(theirs.header.tempos.map(t => t.ticks)).toEqual([0, 1920]);
    expect(theirs.header.tempos[0].bpm).toBeCloseTo(120, 3);
    expect(theirs.header.tempos[1].bpm).toBeCloseTo(90, 3);

    expect(theirs.tracks).toHaveLength(2);
    for (const [index, track] of theirs.tracks.entries()) {
      const ours = SAMPLE.tracks[index];
      expect(track.name).toBe(ours.name);
      expect(track.channel).toBe(ours.channel);
      expect(track.instrument.number).toBe(ours.instrument.number);
      expect(track.notes.map(n => n.midi)).toEqual(ours.notes.map(n => n.midi));
      expect(track.notes.map(n => n.ticks)).toEqual(
        ours.notes.map(n => n.ticks)
      );
      expect(track.notes.map(n => n.durationTicks)).toEqual(
        ours.notes.map(n => n.durationTicks)
      );
      for (const [i, note] of track.notes.entries()) {
        expect(note.velocity).toBeCloseTo(ours.notes[i].velocity, 2);
      }
    }
  });

  it('preserves the controllers @tonejs/midi reads back', () => {
    const theirs = new Midi(asBuffer(encodeMidi(SAMPLE)));
    expect(theirs.tracks[0].controlChanges[7]?.[0].value).toBeCloseTo(
      100 / 127,
      2
    );
    expect(theirs.tracks[0].controlChanges[10]?.[0].value).toBeCloseTo(
      32 / 127,
      2
    );
  });
});

describe('our decoder against @tonejs/midi', () => {
  it('reads bytes @tonejs/midi wrote', () => {
    const theirs = new Midi();
    theirs.header.fromJSON({
      name: 'Oracle',
      ppq: 480,
      meta: [],
      tempos: SAMPLE.header.tempos.map(t => ({ ticks: t.ticks, bpm: t.bpm })),
      timeSignatures: SAMPLE.header.timeSignatures.map(s => ({
        ticks: s.ticks,
        timeSignature: s.timeSignature,
      })),
      keySignatures: [],
    });
    for (const source of SAMPLE.tracks) {
      const track = theirs.addTrack();
      track.name = source.name;
      track.channel = source.channel;
      track.instrument.number = source.instrument.number;
      for (const changes of Object.values(source.controlChanges)) {
        for (const cc of changes) {
          track.addCC({ number: cc.number, ticks: cc.ticks, value: cc.value });
        }
      }
      for (const note of source.notes) {
        track.addNote({
          midi: note.midi,
          ticks: note.ticks,
          durationTicks: note.durationTicks,
          velocity: note.velocity,
        });
      }
    }

    const ours = decodeMidi(asBuffer(theirs.toArray()));

    expect(ours.header.ppq).toBe(480);
    expect(ours.header.name).toBe('Oracle');
    expect(ours.header.timeSignatures).toEqual([
      { ticks: 0, timeSignature: [3, 4] },
    ]);
    expect(ours.header.tempos.map(t => t.ticks)).toEqual([0, 1920]);
    expect(ours.header.tempos[1].bpm).toBeCloseTo(90, 3);

    expect(ours.tracks).toHaveLength(2);
    expect(ours.tracks.map(t => t.name)).toEqual(['Right', 'Left']);
    expect(ours.tracks.map(t => t.channel)).toEqual([0, 1]);
    expect(ours.tracks.map(t => t.instrument.number)).toEqual([0, 40]);
    expect(ours.tracks[0].notes.map(n => n.midi)).toEqual([60, 64, 67]);
    expect(ours.tracks[0].notes.map(n => n.durationTicks)).toEqual([
      480, 240, 960,
    ]);
    expect(ours.tracks[1].notes.map(n => n.midi)).toEqual([48]);
    expect(ours.tracks[0].controlChanges[7][0].value).toBeCloseTo(100 / 127, 2);
    expect(ours.tracks[0].durationSeconds).toBeCloseTo(2, 2);
  });
});
