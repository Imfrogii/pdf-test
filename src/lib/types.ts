export const SAMPLE_PDF_NAME = 'TTS-alignment-sample.pdf';
export const PDF_SCALE = 1.22;

export type HighlightKind = 'word' | 'sentence';

export type HighlightMatches = Record<HighlightKind, boolean>;

export type PdfViewerResult = {
  fileName: string;
  pageCount: number;
  matches: HighlightMatches;
};

export const EMPTY_MATCHES = {
  word: false,
  sentence: false
} as const satisfies HighlightMatches;
