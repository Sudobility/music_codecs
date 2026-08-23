import { describe, expect, it } from 'vitest';
import { decodeMidi } from './decode.js';

/** A format-0 file: one chunk, two channels, controllers at tick 0. */
function twoChannelFormatZero(): ArrayBuffer {
  const events = [
    0x00,
    0xff,
    0x51,
    0x03,
    0x07,
    0xa1,
    0x20, // 120 bpm
    0x00,
    0xb0,
    0x07,
    0x64, // ch0 CC7 = 100
    0x00,
    0xb0,
    0x0a,
    0x20, // ch0 CC10 = 32
    0x00,
    0xb1,
    0x07,
    0x50, // ch1 CC7 = 80
    0x00,
    0xc0,
    0x00, // ch0 program 0
    0x00,
    0xc1,
    0x28, // ch1 program 40
    0x00,
    0x90,
    0x3c,
    0x64, // ch0 note on C4
    0x00,
    0x91,
    0x40,
    0x64, // ch1 note on E4
    0x83,
    0x60,
    0x80,
    0x3c,
    0x00, // +480 ch0 note off
    0x00,
    0x81,
    0x40,
    0x00, // ch1 note off
    0x00,
    0xff,
    0x2f,
    0x00, // end of track
  ];
  const out: number[] = [];
  const push32 = (v: number) =>
    out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  out.push(0x4d, 0x54, 0x68, 0x64);
  push32(6);
  out.push(0x00, 0x00, 0x00, 0x01, 0x01, 0xe0); // format 0, 1 chunk, 480 ppq
  out.push(0x4d, 0x54, 0x72, 0x6b);
  push32(events.length);
  out.push(...events);
  return Uint8Array.from(out).buffer;
}

describe('format 0', () => {
  it('splits into exactly one track per channel', () => {
    const file = decodeMidi(twoChannelFormatZero());
    // @tonejs/midi returns three here: it splits on program-change boundaries
    // and emits a phantom track for channel 1's tick-0 controllers.
    expect(file.tracks).toHaveLength(2);
    expect(file.tracks.map(t => t.channel)).toEqual([0, 1]);
  });

  it('keeps every channel with the controllers that were written for it', () => {
    const [first, second] = decodeMidi(twoChannelFormatZero()).tracks;

    expect(first.instrument.number).toBe(0);
    expect(first.controlChanges[7][0].value).toBeCloseTo(100 / 127, 5);
    expect(first.controlChanges[10][0].value).toBeCloseTo(32 / 127, 5);

    // This is the regression. @tonejs/midi strands channel 1's CC7 on the
    // phantom track and hands this one `controlChanges: {}`, which is what
    // withFormatZeroSetupControls existed to copy back in.
    expect(second.instrument.number).toBe(40);
    expect(second.controlChanges[7][0].value).toBeCloseTo(80 / 127, 5);
  });

  it('gives each channel only its own notes', () => {
    const [first, second] = decodeMidi(twoChannelFormatZero()).tracks;
    expect(first.notes.map(n => n.midi)).toEqual([60]);
    expect(second.notes.map(n => n.midi)).toEqual([64]);
  });
});
