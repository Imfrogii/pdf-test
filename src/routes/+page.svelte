<script lang="ts">
  import PdfPage from '$lib/PdfPage.svelte';
  import { EMPTY_MATCHES, PDF_SCALE, SAMPLE_PDF_NAME, type PdfViewerResult } from '$lib/types';
  import '../app.css';

  const DEFAULT_WORD = 'synchronization';
  const DEFAULT_SENTENCE = 'We need to improve text-to-speech synchronization.';

  let word = $state(DEFAULT_WORD);
  let sentence = $state(DEFAULT_SENTENCE);
  let selectedFile = $state<File>();
  let requestId = $state(0);
  let result = $state<PdfViewerResult>({
    fileName: SAMPLE_PDF_NAME,
    pageCount: 1,
    matches: { ...EMPTY_MATCHES }
  });
  let fileInput: HTMLInputElement;

  function requestHighlights() {
    requestId += 1;
  }

  function onWordKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    requestHighlights();
  }

  function onFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    selectedFile = file;
    input.value = '';
  }
</script>

<svelte:head>
  <title>Verba — PDF text alignment lab</title>
  <meta
    name="description"
    content="A SvelteKit and PDF.js proof of concept for word-accurate speech highlighting."
  />
</svelte:head>

<div class="app-shell">
  <header class="topbar">
    <a class="brand" href="/" aria-label="Verba home">
      <span class="brand-mark">V</span>
      <span>verba</span>
    </a>
    <div class="prototype-label"><span></span>PDF alignment prototype</div>
    <div class="page-state">
      <span class="page-icon">▤</span>
      Page 1 of {result.pageCount}
    </div>
  </header>

  <main>
    <aside class="controls">
      <div class="intro">
        <span class="eyebrow">Text geometry lab</span>
        <h1>Highlight what the reader hears.</h1>
        <p>Search the live PDF.js text layer and paint exact browser-measured regions above it.</p>
      </div>

      <section class="source-section" aria-labelledby="source-title">
        <div class="section-heading">
          <span class="step">01</span>
          <div>
            <h2 id="source-title">PDF source</h2>
            <p>Use the sample or bring your own.</p>
          </div>
        </div>

        <button class="file-card" type="button" onclick={() => fileInput.click()}>
          <span class="file-type">PDF</span>
          <span class="file-copy">
            <strong>{result.fileName}</strong>
            <small>{selectedFile ? 'Custom document' : 'Built-in text sample'}</small>
          </span>
          <span class="replace">Replace</span>
        </button>
        <input
          bind:this={fileInput}
          class="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          onchange={onFileChange}
        />
      </section>

      <section class="search-section" aria-labelledby="search-title">
        <div class="section-heading">
          <span class="step">02</span>
          <div>
            <h2 id="search-title">Highlight text</h2>
            <p>Only complete words and sentences are matched.</p>
          </div>
        </div>

        <label for="word-input">
          <span class="label-row">
            <span><i class="legend word"></i>Word</span>
            {#if requestId > 0}
              <small aria-live="polite" class:miss={!result.matches.word}>
                {result.matches.word ? 'Found' : 'Not found'}
              </small>
            {/if}
          </span>
          <input id="word-input" bind:value={word} onkeydown={onWordKeydown} />
        </label>

        <label for="sentence-input">
          <span class="label-row">
            <span><i class="legend sentence"></i>Sentence</span>
            {#if requestId > 0}
              <small aria-live="polite" class:miss={!result.matches.sentence}>
                {result.matches.sentence ? 'Found' : 'Not found'}
              </small>
            {/if}
          </span>
          <textarea id="sentence-input" rows="4" bind:value={sentence}></textarea>
        </label>

        <button class="highlight-button" type="button" onclick={requestHighlights}>
          <span>Apply highlights</span>
          <span aria-hidden="true">→</span>
        </button>
      </section>

      <div class="accuracy-note">
        <span class="accuracy-icon">⌖</span>
        <div>
          <strong>Frontend-measured accuracy</strong>
          <p>Rects come from DOM Range geometry after PDF.js positions every text run.</p>
        </div>
      </div>
    </aside>

    <section class="document-panel" aria-label="PDF preview">
      <div class="document-toolbar">
        <div>
          <span class="status-dot"></span>
          <strong>Text layer ready</strong>
          <span class="divider"></span>
          <span>Canvas + text + custom overlay</span>
        </div>
        <div class="scale-badge">{Math.round(PDF_SCALE * 100)}%</div>
      </div>
      <div class="document-scroll">
        <PdfPage
          {word}
          {sentence}
          file={selectedFile}
          {requestId}
          onResult={(next) => (result = next)}
        />
      </div>
    </section>
  </main>
</div>
