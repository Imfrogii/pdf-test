import type { HighlightKind } from './types';

type TextPosition = {
  node: Text;
  startOffset: number;
  endOffset: number;
};

export type TextSearchIndex = {
  readonly text: string;
  readonly positions: readonly TextPosition[];
};

export type HighlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const PARAGRAPH_SEPARATOR = '\u2029';
const WORD_CHARACTER = /[\p{L}\p{M}\p{N}_'’-]/u;
const SENTENCE_END = /[.!?。！？]/u;
const CLOSING_MARK = /["'”’»）)\]]/u;

function canonicalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function isWhitespace(value: string): boolean {
  return /\s/u.test(value);
}

function collectTextNodes(layer: HTMLElement): Text[] {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
  });
  const nodes: Text[] = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
  }

  return nodes;
}

function separatorBetween(previous: Text, current: Text): '' | ' ' | typeof PARAGRAPH_SEPARATOR {
  if (
    !previous.data ||
    !current.data ||
    isWhitespace(previous.data.at(-1) ?? '') ||
    isWhitespace(current.data[0])
  ) {
    return '';
  }

  const previousRect = previous.parentElement?.getBoundingClientRect();
  const currentRect = current.parentElement?.getBoundingClientRect();
  if (!previousRect || !currentRect) return '';

  const lineTolerance = Math.max(2, previousRect.height * 0.45);
  const lineDistance = Math.abs(currentRect.top - previousRect.top);
  if (lineDistance > lineTolerance) {
    const lineHeight = Math.max(previousRect.height, currentRect.height);
    return lineDistance > lineHeight * 1.65 ? PARAGRAPH_SEPARATOR : ' ';
  }

  const horizontalGap = currentRect.left - previousRect.right;
  const minimumWordGap = Math.max(1.5, previousRect.height * 0.12);
  return horizontalGap > minimumWordGap ? ' ' : '';
}

/**
 * Builds normalized searchable text while retaining a DOM position for every
 * UTF-16 code unit. The mapping lets matches span multiple PDF.js text items.
 */
export function createTextSearchIndex(layer: HTMLElement): TextSearchIndex {
  const positions: TextPosition[] = [];
  let text = '';
  let previousNode: Text | undefined;

  const append = (value: string, position: TextPosition) => {
    if (isWhitespace(value)) {
      if (!text || text.endsWith(' ')) return;
      text += ' ';
      positions.push(position);
      return;
    }

    const canonical = canonicalize(value);
    text += canonical;
    for (let index = 0; index < canonical.length; index += 1) {
      positions.push(position);
    }
  };

  for (const node of collectTextNodes(layer)) {
    const separator = previousNode ? separatorBetween(previousNode, node) : '';
    const boundaryPosition = { node, startOffset: 0, endOffset: 0 };

    if (separator === PARAGRAPH_SEPARATOR) {
      text += PARAGRAPH_SEPARATOR;
      positions.push(boundaryPosition);
    } else if (separator) {
      append(separator, boundaryPosition);
    }

    for (let offset = 0; offset < node.data.length;) {
      const codePoint = node.data.codePointAt(offset);
      if (codePoint === undefined) break;

      const character = String.fromCodePoint(codePoint);
      append(character, {
        node,
        startOffset: offset,
        endOffset: offset + character.length
      });
      offset += character.length;
    }

    previousNode = node;
  }

  while (text.endsWith(' ')) {
    text = text.slice(0, -1);
    positions.pop();
  }

  return { text, positions };
}

export function normalizeQuery(query: string): string {
  return canonicalize(query).replace(/\s+/gu, ' ').trim();
}

function isWordCharacter(character: string | undefined): boolean {
  return Boolean(character && WORD_CHARACTER.test(character));
}

function isWholeWord(text: string, start: number, end: number): boolean {
  return !isWordCharacter(text[start - 1]) && !isWordCharacter(text[end]);
}

function isSentenceEnd(character: string | undefined): boolean {
  return Boolean(character && SENTENCE_END.test(character));
}

function isClosingMark(character: string | undefined): boolean {
  return Boolean(character && CLOSING_MARK.test(character));
}

function isWholeSentence(text: string, start: number, end: number): boolean {
  let before = start - 1;
  while (before >= 0 && text[before] === ' ') before -= 1;
  while (before >= 0 && isClosingMark(text[before])) before -= 1;

  const startsAtBoundary =
    before < 0 || text[before] === PARAGRAPH_SEPARATOR || isSentenceEnd(text[before]);

  let queryEnd = end - 1;
  while (queryEnd >= start && isClosingMark(text[queryEnd])) queryEnd -= 1;

  let after = end;
  while (after < text.length && text[after] === ' ') after += 1;

  const hasTerminalPunctuation = isSentenceEnd(text[queryEnd]);
  const endsAtParagraph = after >= text.length || text[after] === PARAGRAPH_SEPARATOR;
  return startsAtBoundary && (hasTerminalPunctuation || endsAtParagraph);
}

function findNormalizedMatchStart(text: string, needle: string, kind: HighlightKind): number {
  if (!needle) return -1;

  for (let from = 0; from <= text.length - needle.length;) {
    const start = text.indexOf(needle, from);
    if (start < 0) return -1;

    const end = start + needle.length;
    const isCompleteMatch =
      kind === 'word' ? isWholeWord(text, start, end) : isWholeSentence(text, start, end);

    if (isCompleteMatch) return start;
    from = start + 1;
  }

  return -1;
}

export function findMatchStart(text: string, query: string, kind: HighlightKind): number {
  return findNormalizedMatchStart(text, normalizeQuery(query), kind);
}

export function findTextRange(
  index: TextSearchIndex,
  query: string,
  kind: HighlightKind
): Range | null {
  const normalizedQuery = normalizeQuery(query);
  const startIndex = findNormalizedMatchStart(index.text, normalizedQuery, kind);
  if (startIndex < 0) return null;

  const start = index.positions[startIndex];
  const end = index.positions[startIndex + normalizedQuery.length - 1];
  if (!start || !end) return null;

  const range = document.createRange();
  range.setStart(start.node, start.startOffset);
  range.setEnd(end.node, end.endOffset);
  return range;
}

function verticalOverlap(first: HighlightRect, second: HighlightRect): number {
  return (
    Math.min(first.top + first.height, second.top + second.height) - Math.max(first.top, second.top)
  );
}

function union(first: HighlightRect, second: HighlightRect): HighlightRect {
  const left = Math.min(first.left, second.left);
  const top = Math.min(first.top, second.top);
  const right = Math.max(first.left + first.width, second.left + second.width);
  const bottom = Math.max(first.top + first.height, second.top + second.height);
  return { left, top, width: right - left, height: bottom - top };
}

/** Combines adjacent PDF text items while preserving wrapped lines. */
export function mergeRectsByLine(rects: readonly HighlightRect[]): HighlightRect[] {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const merged: HighlightRect[] = [];

  for (const rect of sorted) {
    const previous = merged.at(-1);
    if (!previous) {
      merged.push({ ...rect });
      continue;
    }

    const sameLine = verticalOverlap(previous, rect) > Math.min(previous.height, rect.height) * 0.5;
    const gap = rect.left - (previous.left + previous.width);
    const maximumGap = Math.max(3, Math.min(14, Math.max(previous.height, rect.height)));

    if (sameLine && gap <= maximumGap) {
      merged[merged.length - 1] = union(previous, rect);
    } else {
      merged.push({ ...rect });
    }
  }

  return merged;
}

/** Converts browser Range geometry to coordinates relative to the overlay. */
export function getHighlightRects(range: Range, overlay: HTMLElement): HighlightRect[] {
  const origin = overlay.getBoundingClientRect();
  const relativeRects = Array.from(range.getClientRects(), (rect) => ({
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    width: rect.width,
    height: rect.height
  })).filter(({ width, height }) => width > 0 && height > 0);

  return mergeRectsByLine(relativeRects);
}
