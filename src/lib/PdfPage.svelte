<script lang="ts">
  import type { PDFDocumentLoadingTask, RenderTask, TextLayer } from 'pdfjs-dist';
  import { onMount } from 'svelte';
  import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
  import { createSamplePdf } from './samplePdf';
  import {
    createTextSearchIndex,
    findTextRange,
    getHighlightRects,
    type HighlightRect
  } from './textGeometry';
  import { PDF_SCALE, SAMPLE_PDF_NAME, type HighlightKind, type PdfViewerResult } from './types';

  type PdfSource = Uint8Array | ArrayBuffer;
  type PdfJsModule = typeof import('pdfjs-dist');
  type Highlight = HighlightRect & { kind: HighlightKind };
  type Props = {
    word: string;
    sentence: string;
    file?: File;
    requestId: number;
    onResult: (result: PdfViewerResult) => void;
  };

  let { word, sentence, file, requestId, onResult }: Props = $props();

  let canvas: HTMLCanvasElement;
  let textLayer: HTMLDivElement;
  let overlay: HTMLDivElement;
  let pageShell: HTMLDivElement;
  let highlights = $state<Highlight[]>([]);
  let isLoading = $state(true);
  let error = $state('');
  let textLayerReady = false;
  let isMounted = false;
  let renderedRequest = -1;
  let renderGeneration = 0;
  let sourceName = SAMPLE_PDF_NAME;
  let pageCount = 1;
  let pdfjs: PdfJsModule | undefined;
  let activeLoadingTask: PDFDocumentLoadingTask | undefined;
  let activeRenderTask: RenderTask | undefined;
  let activeTextLayer: TextLayer | undefined;

  function isCurrentRender(generation: number): boolean {
    return generation === renderGeneration;
  }

  function reportResult(wordFound = false, sentenceFound = false) {
    onResult({
      fileName: sourceName,
      pageCount,
      matches: { word: wordFound, sentence: sentenceFound }
    });
  }

  async function disposeActivePdf() {
    activeRenderTask?.cancel();
    activeRenderTask = undefined;
    activeTextLayer?.cancel();
    activeTextLayer = undefined;

    const loadingTask = activeLoadingTask;
    activeLoadingTask = undefined;
    // Cancellation is expected when a new file replaces an in-flight render.
    if (loadingTask) await loadingTask.destroy().catch(() => undefined);
  }

  function clearPageLayers() {
    textLayer.replaceChildren();
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function configurePage(viewport: { width: number; height: number; scale: number }) {
    const outputScale = window.devicePixelRatio || 1;

    pageShell.style.width = `${viewport.width}px`;
    pageShell.style.height = `${viewport.height}px`;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    // The complete PDF.js viewer defines this variable on `.page`. This PoC
    // owns the page shell, so the TextLayer scale must be provided explicitly.
    textLayer.style.setProperty('--total-scale-factor', String(viewport.scale));
    return outputScale;
  }

  async function renderPdf(source: PdfSource, name: string) {
    if (!pdfjs) return;

    const generation = ++renderGeneration;
    isLoading = true;
    textLayerReady = false;
    renderedRequest = -1;
    error = '';
    highlights = [];
    sourceName = name;
    pageCount = 1;

    try {
      await disposeActivePdf();
      if (!isCurrentRender(generation)) return;
      clearPageLayers();

      const bytes = source instanceof Uint8Array ? source.slice() : new Uint8Array(source);
      const loadingTask = pdfjs.getDocument({ data: bytes });
      activeLoadingTask = loadingTask;
      const document = await loadingTask.promise;
      if (!isCurrentRender(generation)) return;

      pageCount = document.numPages;
      const page = await document.getPage(1);
      const viewport = page.getViewport({ scale: PDF_SCALE });
      const outputScale = configurePage(viewport);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas is not available in this browser.');

      activeRenderTask = page.render({
        canvasContext: context,
        canvas,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
      });
      await activeRenderTask.promise;
      activeRenderTask = undefined;
      if (!isCurrentRender(generation)) return;

      const textContent = await page.getTextContent({ includeMarkedContent: true });
      activeTextLayer = new pdfjs.TextLayer({
        textContentSource: textContent,
        container: textLayer,
        viewport
      });
      await activeTextLayer.render();
      if (!isCurrentRender(generation)) return;

      textLayerReady = true;
      isLoading = false;
      if (requestId > 0 && requestId !== renderedRequest) {
        await applyHighlights(requestId);
      } else {
        reportResult();
      }
    } catch (cause) {
      if (!isCurrentRender(generation)) return;
      activeRenderTask = undefined;
      textLayerReady = false;
      console.error(cause);
      error = 'This PDF could not be rendered. Try another text-based PDF.';
      isLoading = false;
      reportResult();
    }
  }

  async function applyHighlights(appliedRequest = requestId) {
    if (isLoading || !textLayerReady || !textLayer || !overlay) return;
    const generation = renderGeneration;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!isCurrentRender(generation) || appliedRequest !== requestId || !textLayerReady) return;

    const index = createTextSearchIndex(textLayer);
    const ranges = {
      sentence: findTextRange(index, sentence, 'sentence'),
      word: findTextRange(index, word, 'word')
    } satisfies Record<HighlightKind, Range | null>;

    highlights = (['sentence', 'word'] as const).flatMap((kind) => {
      const range = ranges[kind];
      return range ? getHighlightRects(range, overlay).map((rect) => ({ ...rect, kind })) : [];
    });
    renderedRequest = appliedRequest;
    reportResult(Boolean(ranges.word), Boolean(ranges.sentence));
  }

  async function renderFile(selectedFile: File) {
    try {
      const buffer = await selectedFile.arrayBuffer();
      if (!isMounted || selectedFile !== file) return;
      await renderPdf(buffer, selectedFile.name);
    } catch (cause) {
      console.error(cause);
      error = 'This PDF could not be read. Try selecting the file again.';
      isLoading = false;
    }
  }

  onMount(() => {
    isMounted = true;
    void (async () => {
      const module = await import('pdfjs-dist');
      if (!isMounted) return;

      pdfjs = module;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      if (file) {
        await renderFile(file);
      } else {
        await renderPdf(createSamplePdf(), SAMPLE_PDF_NAME);
      }
    })();

    return () => {
      isMounted = false;
      renderGeneration += 1;
      void disposeActivePdf();
    };
  });

  $effect(() => {
    if (file && pdfjs) void renderFile(file);
  });

  $effect(() => {
    if (requestId > 0 && requestId !== renderedRequest) {
      void applyHighlights(requestId);
    }
  });
</script>

<div class="viewer-stage" class:loading={isLoading}>
  {#if isLoading}
    <div class="loading-card" role="status">
      <span class="spinner"></span>
      <span>Mapping the PDF text layer…</span>
    </div>
  {/if}

  {#if error}
    <div class="error-card" role="alert">{error}</div>
  {/if}

  <div class="page-shell" bind:this={pageShell} aria-label="Rendered PDF page 1">
    <canvas bind:this={canvas}></canvas>
    <div class="textLayer" bind:this={textLayer}></div>
    <div class="highlight-layer" bind:this={overlay} aria-hidden="true">
      {#each highlights as rect}
        <span
          class:word-highlight={rect.kind === 'word'}
          class:sentence-highlight={rect.kind === 'sentence'}
          style:left={`${rect.left}px`}
          style:top={`${rect.top}px`}
          style:width={`${rect.width}px`}
          style:height={`${rect.height}px`}
        ></span>
      {/each}
    </div>
  </div>
</div>

<style>
  .viewer-stage {
    position: relative;
    display: grid;
    min-width: min-content;
    min-height: 100%;
    place-items: start center;
    padding: 38px 52px 72px;
  }

  .viewer-stage.loading .page-shell {
    opacity: 0.32;
  }

  .page-shell {
    position: relative;
    overflow: hidden;
    flex: none;
    background: white;
    box-shadow:
      0 20px 55px rgb(31 37 35 / 12%),
      0 2px 8px rgb(31 37 35 / 8%);
    transition: opacity 180ms ease;
  }

  canvas {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: block;
  }

  :global(.textLayer) {
    --min-font-size: 1;
    --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
    --min-font-size-inv: calc(1 / var(--min-font-size));

    color-scheme: only light;
    position: absolute;
    inset: 0;
    z-index: 2;
    overflow: clip;
    line-height: 1;
    letter-spacing: normal;
    word-spacing: normal;
    opacity: 1;
    text-align: initial;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
    caret-color: CanvasText;
  }

  :global(.textLayer span),
  :global(.textLayer br) {
    position: absolute;
    color: transparent;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
    user-select: text;
  }

  :global(.textLayer > :not(.markedContent)),
  :global(.textLayer .markedContent span:not(.markedContent)) {
    --font-height: 0;
    --scale-x: 1;
    --rotate: 0deg;

    z-index: 1;
    font-size: calc(var(--text-scale-factor) * var(--font-height));
    transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
  }

  :global(.textLayer .markedContent) {
    display: contents;
  }

  :global(.textLayer span[role='img']) {
    cursor: default;
    user-select: none;
  }

  :global(.textLayer ::selection) {
    color: transparent;
    background: rgb(42 104 255 / 24%);
  }

  :global(.textLayer br::selection) {
    background: transparent;
  }

  :global(.textLayer .endOfContent) {
    position: absolute;
    display: block;
    inset: 100% 0 0;
    z-index: 0;
    cursor: default;
    user-select: none;
  }

  .highlight-layer {
    position: absolute;
    inset: 0;
    z-index: 3;
    overflow: hidden;
    pointer-events: none;
    mix-blend-mode: multiply;
  }

  .highlight-layer span {
    position: absolute;
    border-radius: 3px;
    box-decoration-break: clone;
  }

  .sentence-highlight {
    background: rgb(254 217 102 / 58%);
    box-shadow: inset 0 -1px 0 rgb(171 125 0 / 18%);
  }

  .word-highlight {
    background: rgb(105 208 172 / 73%);
    box-shadow: inset 0 -1px 0 rgb(20 112 82 / 24%);
  }

  .loading-card,
  .error-card {
    position: absolute;
    top: 22px;
    left: 50%;
    z-index: 8;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border: 1px solid #dfddd5;
    border-radius: 10px;
    background: rgb(255 255 255 / 94%);
    box-shadow: 0 8px 24px rgb(32 37 35 / 10%);
    color: #454945;
    font-size: 13px;
    transform: translateX(-50%);
  }

  .error-card {
    color: #9a342c;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #d9ddd9;
    border-top-color: #276c55;
    border-radius: 50%;
    animation: spin 750ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 700px) {
    .viewer-stage {
      padding: 24px 18px 54px;
    }
  }
</style>
