# PDF text alignment PoC

A focused SvelteKit proof of concept for accurate word and sentence highlights on a PDF page. It uses `pdfjs-dist` directly—without a Svelte wrapper—and adds a custom highlight overlay above PDF.js's canvas and text layers.

## Run locally

```bash
npm install
npm run dev
```

The app opens a deterministic text-based sample PDF. You can replace it with a local PDF, enter a complete word and sentence, and select **Apply highlights**.

## Architecture

Each page is rendered as three aligned layers:

1. **Canvas layer** — PDF.js paints the visible page.
2. **Text layer** — PDF.js positions transparent, selectable DOM text.
3. **Highlight layer** — the PoC draws pointer-transparent rectangles above both native layers.

`PdfPage.svelte` owns PDF.js lifecycle and layer rendering. `textGeometry.ts` contains the text matching and geometry pipeline:

1. Build one normalized search index from the live PDF.js text layer.
2. Preserve a DOM position for every normalized UTF-16 code unit, allowing matches across PDF text items.
3. Enforce complete word or sentence boundaries.
4. Create an exact DOM `Range` for the matched source characters.
5. Translate `Range.getClientRects()` into overlay coordinates and merge adjacent items on the same line.

The implementation deliberately does not infer glyph positions from PDF metadata or scan canvas pixels. PDF.js's browser-laid-out text layer is the single geometry source, so native selection and custom highlights stay aligned.

## PDF.js integration detail

The standalone `TextLayer` requires the scaling rules normally supplied by `pdf_viewer.css`. The component includes only that required CSS subset and explicitly defines `--total-scale-factor` on its page shell. Importing the entire viewer stylesheet would add unrelated viewer UI rules to this small PoC.

## Validation

```bash
npm run validate     # run every check below
npm run check        # Svelte and TypeScript diagnostics
npm test             # matching and rectangle-merging unit tests
npm run format:check # formatting
npm run build        # production build
```

## Scope and limitations

- The PoC renders the first page at a fixed scale; zoom and multi-page rendering are intentionally out of scope.
- The first complete occurrence of each query is highlighted.
- Scanned or image-only PDFs require OCR before text-layer matching can work.
- PDF text extraction order is author-dependent. The geometry remains accurate, but malformed logical text order can still affect search.
