import { describe, expect, it } from 'vitest';
import type { MidiFile, MidiTrackData } from '@sudobility/music_types';
import { encodeMidi } from './encode.js';
import { decodeMidi } from './decode.js';

function track(overrides: Partial<MidiTrackData> = {}): MidiTrackData {
  return {
    name: 'Lead',
    channel: 0,
    instrument: { number: 0, name: 'Acoustic Grand Piano' },
    notes: [{ midi: 60, ticks: 0, durationTicks: 480, velocity: 100 / 127 }],
    controlChanges: {},
    durationTicks: 480,
    durationSeconds: 0.5,
    ...overrides,
  };
}

function file(overrides: Partial<MidiFile> = {}): MidiFile {
  return {
    header: {
      ppq: 480,
      name: 'Song',
      tempos: [{ ticks: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, timeSignature: [4, 4] }],
    },
    tracks: [track()],
    duration: 0.5,
    ...overrides,
  };
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

describe('encodeMidi', () => {
  it('writes a format-1 header with a conductor chunk ahead of the parts', () => {
    const bytes = encodeMidi(
      file({ tracks: [track(), track({ channel: 1 })] })
    );
    const view = new DataView(asBuffer(bytes));
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('MThd');
    expect(view.getUint32(4)).toBe(6);
    expect(view.getUint16(8)).toBe(1);
    expect(view.getUint16(10)).toBe(3);
    expect(view.getUint16(12)).toBe(480);
  });

  it('round-trips a file through decodeMidi', () => {
    const original = file();
    const back = decodeMidi(asBuffer(encodeMidi(original)));
    expect(back.header.ppq).toBe(480);
    expect(back.header.name).toBe('Song');
    expect(back.header.timeSignatures).toEqual([
      { ticks: 0, timeSignature: [4, 4] },
    ]);
    expect(back.header.tempos[0].bpm).toBeCloseTo(120, 4);
    expect(back.tracks).toHaveLength(1);
    expect(back.tracks[0].name).toBe('Lead');
    expect(back.tracks[0].notes).toEqual(original.tracks[0].notes);
  });

  it('round-trips control changes keyed by number', () => {
    const original = file({
      tracks: [
        track({
          controlChanges: {
            7: [{ number: 7, ticks: 0, value: 100 / 127 }],
            10: [{ number: 10, ticks: 0, value: 32 / 127 }],
          },
        }),
      ],
    });
    const back = decodeMidi(asBuffer(encodeMidi(original)));
    expect(back.tracks[0].controlChanges[7][0].value).toBeCloseTo(100 / 127, 5);
    expect(back.tracks[0].controlChanges[10][0].value).toBeCloseTo(32 / 127, 5);
  });

  it('round-trips the program change', () => {
    const original = file({
      tracks: [track({ instrument: { number: 40, name: 'Violin' } })],
    });
    const back = decodeMidi(asBuffer(encodeMidi(original)));
    expect(back.tracks[0].instrument.number).toBe(40);
    expect(back.tracks[0].instrument.name).toBe('Violin');
  });

  it('keeps a repeated pitch as two notes, not one long one', () => {
    const original = file({
      tracks: [
        track({
          notes: [
            { midi: 60, ticks: 0, durationTicks: 480, velocity: 0.5 },
            { midi: 60, ticks: 480, durationTicks: 480, velocity: 0.5 },
          ],
          durationTicks: 960,
        }),
      ],
    });
    const back = decodeMidi(asBuffer(encodeMidi(original)));
    expect(back.tracks[0].notes).toHaveLength(2);
    expect(back.tracks[0].notes.map(n => n.durationTicks)).toEqual([480, 480]);
  });

  it('round-trips a mid-piece tempo change', () => {
    const original = file({
      header: {
        ppq: 480,
        name: 'Song',
        tempos: [
          { ticks: 0, bpm: 120 },
          { ticks: 1920, bpm: 90 },
        ],
        timeSignatures: [],
      },
    });
    const back = decodeMidi(asBuffer(encodeMidi(original)));
    expect(back.header.tempos.map(t => t.ticks)).toEqual([0, 1920]);
    expect(back.header.tempos[1].bpm).toBeCloseTo(90, 3);
  });
});
