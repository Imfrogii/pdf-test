import { describe, expect, it } from 'vitest';
import { findMatchStart, mergeRectsByLine, normalizeQuery } from './textGeometry';

describe('normalizeQuery', () => {
  it('normalizes case, whitespace, dashes, quotes, and compatibility characters', () => {
    expect(normalizeQuery('  “TEXT–TO–SPEECH”  \n  ﬀ  ')).toBe('"text-to-speech" ff');
  });
});

describe('findMatchStart', () => {
  const sentence = 'we need to improve text-to-speech synchronization.';

  it('matches complete words case-insensitively', () => {
    expect(findMatchStart(sentence, 'SYNCHRONIZATION', 'word')).toBe(34);
  });

  it('rejects partial words', () => {
    expect(findMatchStart(sentence, 'sync', 'word')).toBe(-1);
  });

  it('matches a complete sentence but rejects sentence fragments', () => {
    expect(findMatchStart(sentence, sentence, 'sentence')).toBe(0);
    expect(findMatchStart(sentence, 'need to improve text-to-speech', 'sentence')).toBe(-1);
  });

  it('accepts a sentence without punctuation at a paragraph boundary', () => {
    expect(
      findMatchStart(`first paragraph\u2029second paragraph`, 'first paragraph', 'sentence')
    ).toBe(0);
  });
});

describe('mergeRectsByLine', () => {
  it('joins neighbouring text items on the same line', () => {
    expect(
      mergeRectsByLine([
        { left: 10, top: 20, width: 30, height: 12 },
        { left: 44, top: 20, width: 25, height: 12 }
      ])
    ).toEqual([{ left: 10, top: 20, width: 59, height: 12 }]);
  });

  it('keeps wrapped lines and distant columns separate', () => {
    const rects = [
      { left: 10, top: 20, width: 30, height: 12 },
      { left: 100, top: 20, width: 25, height: 12 },
      { left: 10, top: 40, width: 50, height: 12 }
    ];

    expect(mergeRectsByLine(rects)).toEqual(rects);
  });
});
