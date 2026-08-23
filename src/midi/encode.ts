import type { MidiFile, MidiTrackData } from '@sudobility/music_types';
import { ByteWriter } from './bytes.js';

const META_TRACK_NAME = 0x03;
const META_END_OF_TRACK = 0x2f;
const META_TEMPO = 0x51;
const META_TIME_SIGNATURE = 0x58;

const MICROSECONDS_PER_MINUTE = 60_000_000;
const MAX_7_BIT = 127;
/** MIDI clocks per metronome click, and 32nd notes per quarter — the conventional defaults. */
const CLOCKS_PER_CLICK = 24;
const THIRTY_SECONDS_PER_QUARTER = 8;

/**
 * Ordering within a tick: releases, then controllers, then attacks.
 *
 * Conventional SMF practice rather than a correctness requirement, and the
 * distinction was measured rather than assumed: a repeated pitch round-trips
 * correctly through both this decoder and `@tonejs/midi` with the order
 * reversed, because both pair note-ons to note-offs first-in-first-out and so
 * cannot be confused by a release and an attack sharing a tick.
 *
 * It is kept because readers that pair by *last* open note rather than first
 * do exist in hardware and older sequencers, and for them an attack ahead of
 * the matching release turns two notes into one. Writing releases first costs
 * nothing and removes the question.
 */
const RELEASE = 0;
const CONTROLLER = 1;
const ATTACK = 2;

/** The model normalizes to 0-1; the wire wants 0-127. */
function to7Bit(value: number): number {
  return Math.max(0, Math.min(MAX_7_BIT, Math.round(value * MAX_7_BIT)));
}

function writeTextMeta(out: ByteWriter, type: number, text: string): void {
  out.uint8(0xff);
  out.uint8(type);
  out.varint(text.length);
  out.ascii(text);
}

function writeEndOfTrack(out: ByteWriter): void {
  out.varint(0);
  out.bytes([0xff, META_END_OF_TRACK, 0x00]);
}

/**
 * SMF stores tempo as integer microseconds per quarter note, so a bpm that is
 * not a divisor of 60,000,000 cannot survive a round trip exactly — 90 comes
 * back as 90.00009. That is the format's limit, not a rounding choice here.
 */
function writeTempo(out: ByteWriter, bpm: number): void {
  const microseconds = Math.round(MICROSECONDS_PER_MINUTE / bpm);
  out.bytes([
    0xff,
    META_TEMPO,
    0x03,
    (microseconds >>> 16) & 0xff,
    (microseconds >>> 8) & 0xff,
    microseconds & 0xff,
  ]);
}

function writeTimeSignature(
  out: ByteWriter,
  [numerator, denominator]: readonly [number, number]
): void {
  out.bytes([
    0xff,
    META_TIME_SIGNATURE,
    0x04,
    numerator,
    Math.round(Math.log2(denominator)),
    CLOCKS_PER_CLICK,
    THIRTY_SECONDS_PER_QUARTER,
  ]);
}

function writeChunk(out: ByteWriter, body: Uint8Array): void {
  out.ascii('MTrk');
  out.uint32(body.length);
  out.bytes(body);
}

/**
 * Chunk 0: the piece's name and its tempo and metre map, and no channel
 * events at all — which is precisely what `decodeMidi` recognises it by.
 */
function conductorChunk(file: MidiFile): Uint8Array {
  const out = new ByteWriter();
  if (file.header.name) {
    out.varint(0);
    writeTextMeta(out, META_TRACK_NAME, file.header.name);
  }

  const events: { ticks: number; write: (to: ByteWriter) => void }[] = [
    ...file.header.tempos.map(tempo => ({
      ticks: tempo.ticks,
      write: (to: ByteWriter) => writeTempo(to, tempo.bpm),
    })),
    ...file.header.timeSignatures.map(signature => ({
      ticks: signature.ticks,
      write: (to: ByteWriter) =>
        writeTimeSignature(to, signature.timeSignature),
    })),
  ].sort((a, b) => a.ticks - b.ticks);

  let ticks = 0;
  for (const event of events) {
    out.varint(event.ticks - ticks);
    ticks = event.ticks;
    event.write(out);
  }

  writeEndOfTrack(out);
  return out.toUint8Array();
}

function trackChunk(track: MidiTrackData): Uint8Array {
  const channel = track.channel & 0x0f;
  const events: { ticks: number; order: number; bytes: number[] }[] = [];

  for (const changes of Object.values(track.controlChanges)) {
    for (const cc of changes) {
      events.push({
        ticks: cc.ticks,
        order: CONTROLLER,
        bytes: [0xb0 | channel, cc.number & 0x7f, to7Bit(cc.value)],
      });
    }
  }

  for (const note of track.notes) {
    events.push({
      ticks: note.ticks,
      order: ATTACK,
      bytes: [0x90 | channel, note.midi & 0x7f, to7Bit(note.velocity)],
    });
    events.push({
      ticks: note.ticks + note.durationTicks,
      order: RELEASE,
      bytes: [0x80 | channel, note.midi & 0x7f, 0x00],
    });
  }

  events.sort((a, b) => a.ticks - b.ticks || a.order - b.order);

  const out = new ByteWriter();
  out.varint(0);
  writeTextMeta(out, META_TRACK_NAME, track.name);
  out.varint(0);
  out.bytes([0xc0 | channel, track.instrument.number & 0x7f]);

  let ticks = 0;
  for (const event of events) {
    out.varint(event.ticks - ticks);
    ticks = event.ticks;
    out.bytes(event.bytes);
  }

  writeEndOfTrack(out);
  return out.toUint8Array();
}

/** Writes the neutral model out as a Standard MIDI File. */
export function encodeMidi(file: MidiFile): Uint8Array {
  const out = new ByteWriter();
  out.ascii('MThd');
  out.uint32(6);
  out.uint16(1); // format 1: a conductor chunk plus one chunk per part
  out.uint16(file.tracks.length + 1);
  out.uint16(file.header.ppq);

  writeChunk(out, conductorChunk(file));
  for (const track of file.tracks) writeChunk(out, trackChunk(track));

  return out.toUint8Array();
}
