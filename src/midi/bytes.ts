import { MidiParseError } from './errors.js';

/** The largest value a four-byte variable-length quantity can hold. */
const MAX_VARINT = 0x0fffffff;

/** Reads big-endian primitives and variable-length quantities off a buffer. */
export class ByteReader {
  private offset = 0;
  private readonly view: DataView;
  private readonly data: Uint8Array;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }

  seek(to: number): void {
    this.offset = to;
  }

  skip(count: number): void {
    this.offset += count;
  }

  private require(count: number): void {
    if (this.offset + count > this.data.length) {
      throw new MidiParseError(
        `The file ended mid-value at byte ${this.offset}.`
      );
    }
  }

  uint8(): number {
    this.require(1);
    const value = this.data[this.offset];
    this.offset += 1;
    return value;
  }

  uint16(): number {
    this.require(2);
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  uint32(): number {
    this.require(4);
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  bytes(length: number): Uint8Array {
    this.require(length);
    const out = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  ascii(length: number): string {
    let out = '';
    for (const byte of this.bytes(length)) out += String.fromCharCode(byte);
    return out;
  }

  /**
   * Seven bits per byte, high bit set on every byte but the last.
   *
   * Accumulates with `* 128` rather than `<< 7`: the maximum is 28 bits, and
   * bit-shifting a value that wide in JavaScript is a sign-extension bug
   * waiting for the one file that reaches it.
   */
  varint(): number {
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      const byte = this.uint8();
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new MidiParseError('A variable-length quantity ran past four bytes.');
  }
}

/** Builds a byte string with the same primitives `ByteReader` consumes. */
export class ByteWriter {
  private readonly out: number[] = [];

  get length(): number {
    return this.out.length;
  }

  uint8(value: number): void {
    this.out.push(value & 0xff);
  }

  uint16(value: number): void {
    this.uint8(value >>> 8);
    this.uint8(value);
  }

  uint32(value: number): void {
    this.uint8(value >>> 24);
    this.uint8(value >>> 16);
    this.uint8(value >>> 8);
    this.uint8(value);
  }

  bytes(values: ArrayLike<number>): void {
    for (let i = 0; i < values.length; i += 1) this.uint8(values[i]);
  }

  ascii(text: string): void {
    for (let i = 0; i < text.length; i += 1) this.uint8(text.charCodeAt(i));
  }

  varint(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > MAX_VARINT) {
      throw new MidiParseError(
        `${value} is not a writable variable-length quantity.`
      );
    }
    const chunks = [value & 0x7f];
    let rest = Math.floor(value / 128);
    while (rest > 0) {
      chunks.push((rest & 0x7f) | 0x80);
      rest = Math.floor(rest / 128);
    }
    for (let i = chunks.length - 1; i >= 0; i -= 1) this.out.push(chunks[i]);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}
