import { describe, expect, it } from 'vitest';
import { decodeMidi } from './decode.js';
import { MidiParseError } from './errors.js';

/** Wraps event bytes as a file at 480 ppq. */
function fileOf(format: number, tracks: number[][]): ArrayBuffer {
  const out: number[] = [];
  const push32 = (v: number) =>
    out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  out.push(0x4d, 0x54, 0x68, 0x64);
  push32(6);
  out.push(0x00, format, 0x00, tracks.length, 0x01, 0xe0);
  for (const track of tracks) {
    out.push(0x4d, 0x54, 0x72, 0x6b);
    push32(track.length);
    out.push(...track);
  }
  return Uint8Array.from(out).buffer;
}

const END = [0x00, 0xff, 0x2f, 0x00];

describe('decodeMidi', () => {
  it('reads ppq, a tempo and a time signature off the conductor track', () => {
    const file = decodeMidi(
      fileOf(1, [
        [
          0x00,
          0xff,
          0x03,
          0x04,
          0x53,
          0x6f,
          0x6e,
          0x67,
          0x00,
          0xff,
          0x51,
          0x03,
          0x07,
          0xa1,
          0x20,
          0x00,
          0xff,
          0x58,
          0x04,
          0x03,
          0x02,
          0x18,
          0x08,
          ...END,
        ],
        [0x00, 0x90, 0x3c, 0x64, 0x83, 0x60, 0x80, 0x3c, 0x00, ...END],
      ])
    );
    expect(file.header.ppq).toBe(480);
    expect(file.header.name).toBe('Song');
    expect(file.header.tempos).toEqual([{ ticks: 0, bpm: 120 }]);
    expect(file.header.timeSignatures).toEqual([
      { ticks: 0, timeSignature: [3, 4] },
    ]);
    expect(file.tracks).toHaveLength(1);
  });

  it('pairs note on/off into a duration and normalizes velocity', () => {
    const file = decodeMidi(
      fileOf(0, [
        [0x00, 0x90, 0x3c, 0x64, 0x83, 0x60, 0x80, 0x3c, 0x00, ...END],
      ])
    );
    expect(file.tracks[0].notes).toEqual([
      { midi: 60, ticks: 0, durationTicks: 480, velocity: 100 / 127 },
    ]);
    expect(file.tracks[0].durationTicks).toBe(480);
    expect(file.tracks[0].durationSeconds).toBeCloseTo(0.5, 5);
  });

  it('treats a note-on at velocity 0 as a note-off', () => {
    const file = decodeMidi(
      fileOf(0, [
        [0x00, 0x90, 0x3c, 0x64, 0x83, 0x60, 0x90, 0x3c, 0x00, ...END],
      ])
    );
    expect(file.tracks[0].notes).toHaveLength(1);
    expect(file.tracks[0].notes[0].durationTicks).toBe(480);
  });

  it('applies running status to a bare data byte', () => {
    const file = decodeMidi(
      fileOf(0, [
        [
          0x00,
          0x90,
          0x3c,
          0x64,
          0x00,
          0x40,
          0x64,
          0x83,
          0x60,
          0x3c,
          0x00,
          0x00,
          0x40,
          0x00,
          ...END,
        ],
      ])
    );
    expect(file.tracks[0].notes.map(n => n.midi)).toEqual([60, 64]);
    expect(file.tracks[0].notes.every(n => n.durationTicks === 480)).toBe(true);
  });

  it('keys control changes by number and normalizes their value', () => {
    const file = decodeMidi(
      fileOf(0, [[0x00, 0xb0, 0x07, 0x64, 0x00, 0xb0, 0x0a, 0x20, ...END]])
    );
    expect(file.tracks[0].controlChanges[7]).toEqual([
      { number: 7, ticks: 0, value: 100 / 127 },
    ]);
    expect(file.tracks[0].controlChanges[10][0].value).toBeCloseTo(32 / 127, 5);
  });

  it('names the instrument from the program change', () => {
    const file = decodeMidi(
      fileOf(0, [
        [
          0x00,
          0xc0,
          0x28,
          0x00,
          0x90,
          0x3c,
          0x64,
          0x81,
          0x70,
          0x80,
          0x3c,
          0x00,
          ...END,
        ],
      ])
    );
    expect(file.tracks[0].instrument.number).toBe(40);
    expect(file.tracks[0].instrument.name).toBe('Violin');
  });

  it('closes a note the file never released at the end of the track', () => {
    const file = decodeMidi(
      fileOf(0, [[0x00, 0x90, 0x3c, 0x64, 0x83, 0x60, 0xff, 0x2f, 0x00]])
    );
    expect(file.tracks[0].notes[0].durationTicks).toBe(480);
  });

  it('changes tempo partway and reports seconds against the map', () => {
    const file = decodeMidi(
      fileOf(1, [
        [
          0x00,
          0xff,
          0x51,
          0x03,
          0x07,
          0xa1,
          0x20,
          0x8f,
          0x00,
          0xff,
          0x51,
          0x03,
          0x0a,
          0x2c,
          0x2a,
          ...END,
        ],
        [0x8f, 0x00, 0x90, 0x3c, 0x64, 0x83, 0x60, 0x80, 0x3c, 0x00, ...END],
      ])
    );
    expect(file.header.tempos).toHaveLength(2);
    expect(file.tracks[0].durationSeconds).toBeCloseTo(2 + 60 / 90, 3);
  });

  it('rejects a file that is not a Standard MIDI File', () => {
    expect(() =>
      decodeMidi(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]).buffer)
    ).toThrow(MidiParseError);
  });

  it('rejects SMPTE division, which this reader does not support', () => {
    const buffer = new Uint8Array(fileOf(0, [[...END]]));
    buffer[12] = 0xe7;
    expect(() => decodeMidi(buffer.buffer)).toThrow(/SMPTE/);
  });
});
