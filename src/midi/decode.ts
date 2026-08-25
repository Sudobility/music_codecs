import { gmInstrument } from '@sudobility/music_types';
import { DEFAULT_BPM } from '@sudobility/music_types';
import type {
  MidiControlChange,
  MidiFile,
  MidiNote,
  MidiTempoEvent,
  MidiTimeSignatureEvent,
  MidiTrackData,
} from '@sudobility/music_types';
import { ByteReader } from './bytes.js';
import { MidiParseError } from './errors.js';

const META_TRACK_NAME = 0x03;
const META_END_OF_TRACK = 0x2f;
const META_TEMPO = 0x51;
const META_TIME_SIGNATURE = 0x58;

const MICROSECONDS_PER_MINUTE = 60_000_000;
const MAX_7_BIT = 127;

type ChannelEvent =
  | {
      kind: 'noteOn';
      ticks: number;
      channel: number;
      note: number;
      velocity: number;
    }
  | { kind: 'noteOff'; ticks: number; channel: number; note: number }
  | {
      kind: 'controlChange';
      ticks: number;
      channel: number;
      controller: number;
      value: number;
    }
  | { kind: 'programChange'; ticks: number; channel: number; program: number };

type ParsedTrack = {
  name: string;
  events: ChannelEvent[];
  tempos: MidiTempoEvent[];
  timeSignatures: MidiTimeSignatureEvent[];
  endTicks: number;
};

function asciiOf(data: Uint8Array): string {
  let out = '';
  for (const byte of data) out += String.fromCharCode(byte);
  return out;
}

/**
 * Reads one `MTrk` body into channel events plus the global meta events it
 * happens to carry.
 *
 * Tempo and time signature are collected per track and merged by the caller:
 * they are properties of the piece rather than of a part, and while they
 * conventionally sit on track 0, nothing in the format requires it.
 */
function readTrackChunk(reader: ByteReader, length: number): ParsedTrack {
  const end = reader.position + length;
  const track: ParsedTrack = {
    name: '',
    events: [],
    tempos: [],
    timeSignatures: [],
    endTicks: 0,
  };
  let ticks = 0;
  let status = 0;

  while (reader.position < end) {
    ticks += reader.varint();
    let byte = reader.uint8();

    if (byte < 0x80) {
      // Running status: the status byte is implied, and this byte is already
      // the first data byte — so step back over it and re-read under `status`.
      if (status === 0) {
        throw new MidiParseError(
          `A data byte appeared before any status byte at ${reader.position - 1}.`
        );
      }
      reader.seek(reader.position - 1);
      byte = status;
    } else if (byte < 0xf0) {
      status = byte;
    } else {
      // System and meta messages cancel running status.
      status = 0;
    }

    if (byte === 0xff) {
      const type = reader.uint8();
      const data = reader.bytes(reader.varint());
      if (type === META_TRACK_NAME) {
        track.name = asciiOf(data);
      } else if (type === META_TEMPO && data.length === 3) {
        const microseconds = (data[0] << 16) | (data[1] << 8) | data[2];
        if (microseconds > 0) {
          track.tempos.push({
            ticks,
            bpm: MICROSECONDS_PER_MINUTE / microseconds,
          });
        }
      } else if (type === META_TIME_SIGNATURE && data.length >= 2) {
        track.timeSignatures.push({
          ticks,
          timeSignature: [data[0], 2 ** data[1]],
        });
      } else if (type === META_END_OF_TRACK) {
        track.endTicks = Math.max(track.endTicks, ticks);
        break;
      }
      continue;
    }

    if (byte === 0xf0 || byte === 0xf7) {
      // Sysex — length-prefixed, and nothing here reads it.
      reader.bytes(reader.varint());
      continue;
    }

    const channel = byte & 0x0f;
    switch (byte & 0xf0) {
      case 0x80: {
        const note = reader.uint8();
        reader.uint8();
        track.events.push({ kind: 'noteOff', ticks, channel, note });
        break;
      }
      case 0x90: {
        const note = reader.uint8();
        const velocity = reader.uint8();
        // A note-on at velocity 0 is a note-off. Many writers emit that rather
        // than a real one, and taking it literally leaves the note sounding
        // for the rest of the piece.
        track.events.push(
          velocity === 0
            ? { kind: 'noteOff', ticks, channel, note }
            : {
                kind: 'noteOn',
                ticks,
                channel,
                note,
                velocity: velocity / MAX_7_BIT,
              }
        );
        break;
      }
      case 0xb0: {
        const controller = reader.uint8();
        const value = reader.uint8();
        track.events.push({
          kind: 'controlChange',
          ticks,
          channel,
          controller,
          value: value / MAX_7_BIT,
        });
        break;
      }
      case 0xc0: {
        track.events.push({
          kind: 'programChange',
          ticks,
          channel,
          program: reader.uint8(),
        });
        break;
      }
      case 0xa0:
      case 0xe0:
        reader.skip(2); // polyphonic aftertouch, pitch bend
        break;
      case 0xd0:
        reader.skip(1); // channel aftertouch
        break;
      default:
        throw new MidiParseError(
          `Unknown status byte 0x${byte.toString(16)} at ${reader.position - 1}.`
        );
    }
    track.endTicks = Math.max(track.endTicks, ticks);
  }

  reader.seek(end);
  return track;
}

/** Where a tick falls in seconds, walking the tempo map to get there. */
export function secondsAtTick(
  tick: number,
  tempos: readonly MidiTempoEvent[],
  ppq: number
): number {
  let seconds = 0;
  let cursor = 0;
  let bpm = DEFAULT_BPM;
  for (const tempo of tempos) {
    if (tempo.ticks >= tick) break;
    seconds += ((tempo.ticks - cursor) / ppq) * (60 / bpm);
    cursor = tempo.ticks;
    bpm = tempo.bpm;
  }
  return seconds + ((tick - cursor) / ppq) * (60 / bpm);
}

function notesFrom(
  events: readonly ChannelEvent[],
  endTicks: number
): MidiNote[] {
  const open = new Map<number, { ticks: number; velocity: number }[]>();
  const notes: MidiNote[] = [];

  for (const event of events) {
    if (event.kind === 'noteOn') {
      const queue = open.get(event.note);
      const started = { ticks: event.ticks, velocity: event.velocity };
      if (queue) queue.push(started);
      else open.set(event.note, [started]);
    } else if (event.kind === 'noteOff') {
      const started = open.get(event.note)?.shift();
      if (started) {
        notes.push({
          midi: event.note,
          ticks: started.ticks,
          durationTicks: event.ticks - started.ticks,
          velocity: started.velocity,
        });
      }
    }
  }

  // A note the file never released ends where the track does. The sound was
  // written; only its release was not, and dropping it loses real music.
  for (const [note, queue] of open) {
    for (const started of queue) {
      notes.push({
        midi: note,
        ticks: started.ticks,
        durationTicks: Math.max(0, endTicks - started.ticks),
        velocity: started.velocity,
      });
    }
  }

  return notes.sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);
}

function controlChangesFrom(
  events: readonly ChannelEvent[]
): Record<number, MidiControlChange[]> {
  const out: Record<number, MidiControlChange[]> = {};
  for (const event of events) {
    if (event.kind !== 'controlChange') continue;
    // No `??=`: this package targets ES2020 so the server can consume it.
    if (!out[event.controller]) out[event.controller] = [];
    out[event.controller].push({
      number: event.controller,
      ticks: event.ticks,
      value: event.value,
    });
  }
  return out;
}

function trackFrom(
  name: string,
  events: readonly ChannelEvent[],
  endTicks: number,
  tempos: readonly MidiTempoEvent[],
  ppq: number
): MidiTrackData {
  const notes = notesFrom(events, endTicks);
  const program = events.find(
    (event): event is Extract<ChannelEvent, { kind: 'programChange' }> =>
      event.kind === 'programChange'
  );
  const number = program ? program.program : 0;
  const durationTicks = notes.reduce(
    (max, note) => Math.max(max, note.ticks + note.durationTicks),
    0
  );

  return {
    name,
    channel: events.length > 0 ? events[0].channel : 0,
    instrument: { number, name: gmInstrument(number)?.name },
    notes,
    controlChanges: controlChangesFrom(events),
    durationTicks,
    durationSeconds: secondsAtTick(durationTicks, tempos, ppq),
  };
}

/** A leading chunk carrying no channel events at all is the conductor track. */
function isConductor(track: ParsedTrack | undefined): boolean {
  return track !== undefined && track.events.length === 0;
}

/**
 * Format 0 is one chunk carrying every channel. Split it into one track per
 * channel that has events, in channel order.
 *
 * This is where this codec deliberately differs from `@tonejs/midi`, which
 * splits on program-change boundaries instead: on a two-channel file that
 * produces *three* tracks — a phantom one labelled with the wrong channel
 * holding the second channel's tick-0 CC7/CC10, and the second channel's real
 * notes stranded with no controllers at all. `withFormatZeroSetupControls`
 * existed in four copies to patch that up after the fact. Splitting by the
 * channel each event actually names needs no patching.
 */
function splitByChannel(
  track: ParsedTrack | undefined,
  tempos: readonly MidiTempoEvent[],
  ppq: number
): MidiTrackData[] {
  if (!track) return [];
  const byChannel = new Map<number, ChannelEvent[]>();
  for (const event of track.events) {
    const existing = byChannel.get(event.channel);
    if (existing) existing.push(event);
    else byChannel.set(event.channel, [event]);
  }
  return [...byChannel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, events]) =>
      trackFrom(track.name, events, track.endTicks, tempos, ppq)
    );
}

/** Reads a Standard MIDI File into the neutral model. */
export function decodeMidi(data: ArrayBuffer): MidiFile {
  const reader = new ByteReader(data);
  if (reader.remaining < 14 || reader.ascii(4) !== 'MThd') {
    throw new MidiParseError(
      'Not a Standard MIDI File: the MThd header chunk is missing.'
    );
  }
  const headerLength = reader.uint32();
  const format = reader.uint16();
  reader.uint16(); // declared track count — the chunks actually present win
  const division = reader.uint16();
  if ((division & 0x8000) !== 0) {
    throw new MidiParseError(
      'SMPTE timecode division is not supported; this reader needs ticks per quarter note.'
    );
  }
  const ppq = division;
  reader.seek(8 + headerLength);

  const parsed: ParsedTrack[] = [];
  while (reader.remaining >= 8) {
    const id = reader.ascii(4);
    const length = reader.uint32();
    if (id === 'MTrk') parsed.push(readTrackChunk(reader, length));
    else reader.skip(length); // an unrecognised chunk type is skippable by spec
  }

  const tempos = parsed
    .flatMap(track => track.tempos)
    .sort((a, b) => a.ticks - b.ticks);
  const timeSignatures = parsed
    .flatMap(track => track.timeSignatures)
    .sort((a, b) => a.ticks - b.ticks);

  const tracks =
    format === 0
      ? splitByChannel(parsed[0], tempos, ppq)
      : (isConductor(parsed[0]) ? parsed.slice(1) : parsed).map(track =>
          trackFrom(track.name, track.events, track.endTicks, tempos, ppq)
        );

  const conductor =
    format !== 0 && isConductor(parsed[0]) ? parsed[0] : undefined;

  return {
    header: {
      ppq,
      name: conductor && conductor.name !== '' ? conductor.name : undefined,
      tempos,
      timeSignatures,
    },
    tracks,
    duration: tracks.reduce(
      (max, track) => Math.max(max, track.durationSeconds),
      0
    ),
  };
}
