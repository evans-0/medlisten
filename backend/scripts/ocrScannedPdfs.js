/**
 * OCRs scanned (image-only) PDFs into plain-text .txt files sitting
 * alongside them — the missing step ingestRagCorpus.js itself explicitly
 * doesn't do (it skips a PDF with no extractable text layer, by design).
 * Once this has run, ingestRagCorpus.js picks up the resulting .txt files
 * like any other source document — no changes needed there.
 *
 * Why a separate script instead of teaching ingestRagCorpus.js to OCR
 * inline: OCR quality directly determines whether the whole RAG corpus is
 * any good, so it needs to be independently inspectable (open the .txt,
 * read it) before ever being chunked/embedded — and a 900-page scanned
 * book is a genuinely long-running job that needs its own resumability,
 * not something to bolt onto the already-fast ingest step.
 *
 * Pipeline per PDF: render each page to an image (pdfjs-dist + node-canvas,
 * no system PDF tools needed) -> OCR that image (tesseract.js, pure
 * JS/WASM, no system Tesseract install needed) -> concatenate all pages.
 *
 * Resumable: progress for a file in progress is checkpointed to
 * "<file>.ocr-progress.json" after every page, so killing this mid-book
 * and rerunning picks up from the next un-OCR'd page instead of restarting.
 * Already-finished files (a sibling .txt already exists) are skipped
 * entirely, and any PDF that already has a real text layer is skipped too
 * (nothing for this script to do — ingestRagCorpus.js handles those directly).
 *
 * Usage:
 *   node scripts/ocrScannedPdfs.js <sourceDir> [--lang=eng] [--max-pages=N] [--scale=2.0] [--concurrency=8]
 *
 * --max-pages caps how many pages of EACH file get OCR'd — use it for a
 * quick quality check on a handful of pages before committing to a whole
 * 900-page book.
 *
 * --concurrency controls how many pages OCR concurrently via a tesseract.js
 * worker pool (Tesseract.createScheduler) — each worker is a real OS
 * thread doing the actual recognition work, so this scales close to
 * linearly with CPU cores. Page RENDERING (pdfjs-dist + node-canvas) still
 * happens one at a time on the main thread — it's pure synchronous JS, not
 * something multiple workers help with — but it's the fast part of each
 * page anyway; OCR is the actual bottleneck, and that's what gets
 * parallelized. Pages are processed in concurrency-sized batches: render
 * that batch, hand all of it to the pool at once, wait for the batch,
 * checkpoint, move on — bounds how many rendered page images sit in memory
 * at once regardless of book length.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const pdfParse = require('pdf-parse');
const { createCanvas, Image, ImageData, Path2D } = require('canvas');
const Tesseract = require('tesseract.js');

// pdfjs-dist's renderer is written for a browser DOM and does an
// `instanceof Image`/`OffscreenCanvas` check when drawing a scanned page's
// embedded raster image — which is exactly what a scanned PDF's pages are.
// Without these globals it throws "Image or Canvas expected" on every page
// that contains an image (i.e. every page of a scanned book). Polyfilling
// them from node-canvas is pdfjs-dist's own documented fix for Node.js use.
global.Image = Image;
global.ImageData = ImageData;
global.Path2D = Path2D;

// Per-page, not total: a scanner app's watermark (e.g. "Scanned by
// TapScanner") stamped on every page adds up to a few hundred characters
// across a whole document even though every page is otherwise a bare image
// with zero real text — a raw total threshold would wrongly skip those.
const MIN_CHARS_PER_PAGE_TO_SKIP = 60;

function parseArgs(argv) {
  const [, , sourceDir, ...rest] = argv;
  // Leave real headroom for the rest of the stack likely also running on
  // this machine (Node backend, Mongo, the Python services, and especially
  // Ollama serving a 14B model) — capped well below core count rather than
  // just "cores minus a couple," since each tesseract.js worker also has
  // its own memory footprint (loaded language data) and diminishing
  // returns set in well before one-worker-per-core on top of everything
  // else already running.
  const defaultConcurrency = Math.max(1, Math.min(10, os.cpus().length - 4));
  const opts = { lang: 'eng', maxPages: Infinity, scale: 2.0, concurrency: defaultConcurrency };
  for (const arg of rest) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'lang') opts.lang = value;
    if (key === 'max-pages') opts.maxPages = Number(value);
    if (key === 'scale') opts.scale = Number(value);
    if (key === 'concurrency') opts.concurrency = Number(value);
  }
  return { sourceDir, opts };
}

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

function walkPdfs(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkPdfs(fullPath));
    else if (path.extname(entry.name).toLowerCase() === '.pdf') results.push(fullPath);
  }
  return results;
}

function loadProgress(progressPath) {
  if (!fs.existsSync(progressPath)) return { pageTexts: [] };
  try {
    return JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  } catch {
    return { pageTexts: [] };
  }
}

function saveProgress(progressPath, progress) {
  fs.writeFileSync(progressPath, JSON.stringify(progress), 'utf-8');
}

async function renderPage(pdfDocument, canvasFactory, pageNum, scale) {
  const page = await pdfDocument.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
  await page.render({ canvasContext: canvasAndContext.context, viewport, canvasFactory }).promise;
  const imageBuffer = canvasAndContext.canvas.toBuffer('image/png');
  canvasFactory.destroy(canvasAndContext);
  return imageBuffer;
}

async function ocrPdf(pdfjsLib, filePath, opts, scheduler) {
  const txtPath = filePath.replace(/\.pdf$/i, '.txt');
  const progressPath = filePath.replace(/\.pdf$/i, '.ocr-progress.json');
  const progress = loadProgress(progressPath);

  const data = new Uint8Array(fs.readFileSync(filePath));
  const canvasFactory = new NodeCanvasFactory();
  const pdfDocument = await pdfjsLib.getDocument({ data, canvasFactory }).promise;
  const totalPages = Math.min(pdfDocument.numPages, opts.maxPages);

  for (let batchStart = progress.pageTexts.length + 1; batchStart <= totalPages; batchStart += opts.concurrency) {
    const batchEnd = Math.min(batchStart + opts.concurrency - 1, totalPages);
    const startedAt = Date.now();

    // Render this batch's pages one at a time (main-thread CPU work, not
    // parallelizable in Node), then hand every rendered image to the
    // worker pool at once so the actual OCR runs concurrently across
    // however many workers were started.
    const jobs = [];
    for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
      const imageBuffer = await renderPage(pdfDocument, canvasFactory, pageNum, opts.scale);
      jobs.push(
        scheduler.addJob('recognize', imageBuffer).then(({ data: ocrResult }) => ({ pageNum, text: ocrResult.text }))
      );
    }

    const results = await Promise.all(jobs);
    results.sort((a, b) => a.pageNum - b.pageNum);
    for (const r of results) progress.pageTexts.push(r.text);
    saveProgress(progressPath, progress);

    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    const perPage = (Number(seconds) / results.length).toFixed(1);
    console.log(`  pages ${batchStart}-${batchEnd}/${totalPages} (${seconds}s, ~${perPage}s/page)`);
  }

  fs.writeFileSync(txtPath, progress.pageTexts.join('\n\n'), 'utf-8');
  fs.unlinkSync(progressPath);
  console.log(`  -> wrote ${txtPath} (${progress.pageTexts.join('').length} chars from ${totalPages} page(s))`);
}

async function main() {
  const { sourceDir, opts } = parseArgs(process.argv);
  if (!sourceDir) {
    console.error('Usage: node scripts/ocrScannedPdfs.js <sourceDir> [--lang=eng] [--max-pages=N] [--scale=2.0]');
    process.exit(1);
  }

  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const files = walkPdfs(sourceDir);
  console.log(
    `Found ${files.length} PDF(s) under ${sourceDir}. Language: ${opts.lang}, scale: ${opts.scale}, concurrency: ${opts.concurrency}${opts.maxPages !== Infinity ? `, capped at ${opts.maxPages} page(s)/file` : ''}\n`
  );

  console.log(`Starting ${opts.concurrency} OCR worker(s)...`);
  const scheduler = Tesseract.createScheduler();
  for (let i = 0; i < opts.concurrency; i++) {
    scheduler.addWorker(await Tesseract.createWorker(opts.lang));
  }

  try {
    for (const filePath of files) {
      const txtPath = filePath.replace(/\.pdf$/i, '.txt');
      const relPath = path.relative(sourceDir, filePath);

      if (fs.existsSync(txtPath)) {
        console.log(`SKIP (already OCR'd): ${relPath}`);
        continue;
      }

      const buffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(buffer).catch(() => ({ text: '', numpages: 1 }));
      const charsPerPage = (parsed.text || '').trim().length / Math.max(1, parsed.numpages);
      if (charsPerPage >= MIN_CHARS_PER_PAGE_TO_SKIP) {
        console.log(`SKIP (already has a real text layer, not scanned): ${relPath}`);
        continue;
      }

      console.log(`OCR: ${relPath}`);
      try {
        await ocrPdf(pdfjsLib, filePath, opts, scheduler);
      } catch (err) {
        console.error(`  FAILED: ${err.message}`);
      }
    }
  } finally {
    await scheduler.terminate();
  }

  console.log('\nDone. Now run: node scripts/ingestRagCorpus.js <sourceDir> <corpusName>');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
