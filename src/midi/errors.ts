/**
 * A file that is not a Standard MIDI File, or is one and is malformed.
 *
 * Its own class rather than a bare `Error` for the same reason `XmlParseError`
 * is: an import dialog has to tell "this is not a MIDI file" apart from "this
 * codec has a bug", and a message match is not a test anybody can rely on.
 */
export class MidiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MidiParseError';
  }
}
