/**
 * A real XML parser for tests, via jsdom.
 *
 * XML is the one format still injected: `DOMParser` on the web and
 * `fast-xml-parser` on React Native are genuinely different implementations,
 * so `XmlParser` stays a platform capability while the MusicXML semantics live
 * here. The MIDI codec used to be faked alongside it and no longer is — the
 * real one is in `src/midi/`, checked against `@tonejs/midi` as an oracle.
 */
import { JSDOM } from 'jsdom';
import { XmlParseError } from '@sudobility/music_types';
import type { XmlElement, XmlParser } from '@sudobility/music_types';

/**
 * A real XML parser, via jsdom.
 *
 * `DOMParser` reports malformed input by returning a document rooted at
 * `<parsererror>` rather than by throwing, so that is checked explicitly —
 * otherwise a broken document reads as a successful parse of a strange element.
 */
export function testXmlParser(): XmlParser {
  return {
    parse(text: string): XmlElement {
      const { window } = new JSDOM('');
      const doc = new window.DOMParser().parseFromString(
        text,
        'application/xml'
      );
      const root = doc.documentElement;
      if (
        !root ||
        root.tagName === 'parsererror' ||
        root.getElementsByTagName('parsererror').length > 0
      ) {
        throw new XmlParseError('Malformed XML');
      }
      return root as unknown as XmlElement;
    },
  };
}
