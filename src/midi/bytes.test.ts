import { describe, expect, it } from 'vitest';
import { ByteReader, ByteWriter } from './bytes.js';
import { MidiParseError } from './errors.js';

/** The SMF 1.0 specification's own variable-length-quantity table. */
const VLQ: ReadonlyArray<[number, number[]]> = [
  [0x00000000, [0x00]],
  [0x00000040, [0x40]],
  [0x0000007f, [0x7f]],
  [0x00000080, [0x81, 0x00]],
  [0x00002000, [0xc0, 0x00]],
  [0x00003fff, [0xff, 0x7f]],
  [0x00004000, [0x81, 0x80, 0x00]],
  [0x00100000, [0xc0, 0x80, 0x00]],
  [0x001fffff, [0xff, 0xff, 0x7f]],
  [0x00200000, [0x81, 0x80, 0x80, 0x00]],
  [0x08000000, [0xc0, 0x80, 0x80, 0x00]],
  [0x0fffffff, [0xff, 0xff, 0xff, 0x7f]],
];

function readerOf(bytes: number[]): ByteReader {
  return new ByteReader(Uint8Array.from(bytes).buffer);
}

describe('varint', () => {
  it.each(VLQ)('writes %i', (value, expected) => {
    const writer = new ByteWriter();
    writer.varint(value);
    expect([...writer.toUint8Array()]).toEqual(expected);
  });

  it.each(VLQ)('reads back %i', (value, encoded) => {
    expect(readerOf(encoded).varint()).toBe(value);
  });

  it('refuses a quantity longer than four bytes', () => {
    expect(() => readerOf([0xff, 0xff, 0xff, 0xff, 0x7f]).varint()).toThrow(
      MidiParseError
    );
  });
});

describe('big-endian primitives', () => {
  it('round-trips uint16 and uint32', () => {
    const writer = new ByteWriter();
    writer.uint16(0x1234);
    writer.uint32(0xdeadbeef);
    const reader = new ByteReader(writer.toUint8Array().buffer);
    expect(reader.uint16()).toBe(0x1234);
    expect(reader.uint32()).toBe(0xdeadbeef);
  });

  it('round-trips ascii', () => {
    const writer = new ByteWriter();
    writer.ascii('MThd');
    expect(new ByteReader(writer.toUint8Array().buffer).ascii(4)).toBe('MThd');
  });

  it('reports the offset when the buffer ends mid-value', () => {
    expect(() => readerOf([0x01]).uint32()).toThrow(
      /ended mid-value at byte 0/
    );
  });
});
