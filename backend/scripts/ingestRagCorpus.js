/**
 * Turns a folder of mixed reference documents (PDF/.docx/.txt/.md) into
 * retrieval-sized text chunks for RAG — the bulk-corpus counterpart to the
 * small, hand-curated src/utils/chat/guidelines.json. That file works
 * because someone hand-wrote ~20 short, tightly-scoped protocol summaries;
 * a 1GB reference corpus can't be hand-curated the same way, so this
 * script does the chunking mechanically instead.
 *
 * This is a ONE-TIME (or run-when-the-corpus-changes) offline step, not
 * something the server does at boot — unlike guidelines.json's ~20
 * entries, a real corpus is far too large to parse and chunk on every
 * server restart.
 *
 * Usage:
 *   node scripts/ingestRagCorpus.js <sourceDir> <corpusName>
 *
 * Example:
 *   node scripts/ingestRagCorpus.js ./ayush-source-docs ayush
 *   -> writes src/utils/chat/ragCorpus/ayush.chunks.json
 *
 * Next step after this: scripts/embedRagCorpus.js embeds the chunks this
 * produces (a separate, much slower step — see that script's own header).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

// Words per chunk. Small enough that a single chunk is a focused, coherent
// unit to embed and retrieve (matches the rough size of a guidelines.json
// protocol entry); large enough to keep the total chunk count manageable
// for the embedding step, which is the actual bottleneck at 1GB scale.
const CHUNK_WORD_TARGET = 250;

// Hard safety net on top of the word-count target above. Word count is a
// poor proxy for chunk size on OCR'd text with no real paragraph breaks
// (a whole scanned page can land as a single "paragraph") and on
// non-Latin scripts (Devanagari tokenizes far more densely than English) —
// either can produce a chunk that overflows the embedding model's context
// window. Anything over this character count gets hard-split on whitespace
// regardless of paragraph/sentence boundaries.
const MAX_CHUNK_CHARS = 2000;

function splitByCharLimit(text, maxChars) {
  const words = text.split(/\s+/);
  const pieces = [];
  let current = [];
  let currentLen = 0;
  for (const word of words) {
    if (currentLen + word.length + 1 > maxChars && current.length) {
      pieces.push(current.join(' '));
      current = [];
      currentLen = 0;
    }
    current.push(word);
    currentLen += word.length + 1;
  }
  if (current.length) pieces.push(current.join(' '));
  return pieces;
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return value;
  }
  // .txt / .md
  return fs.readFileSync(filePath, 'utf-8');
}

/** A markdown heading, or a short standalone line that reads like a plain-text
 * section title (its own paragraph, no terminal punctuation, title-length) —
 * PDFs and .docx extraction both lose markdown syntax, so headings there
 * usually survive only as a short line sitting alone in its own paragraph. */
function looksLikeHeading(paragraph) {
  if (/^#{1,6}\s/.test(paragraph)) return true;
  const words = paragraph.split(/\s+/);
  return words.length <= 8 && !/[.,;:]$/.test(paragraph);
}

/**
 * Splits text into ~CHUNK_WORD_TARGET-word chunks. Headings are treated as
 * hard section boundaries — even a short section is never merged across a
 * heading into its neighbor — so two distinct topics in the same file (e.g.
 * "Vata Dosha" and "Pitta Dosha") never dilute into one averaged embedding.
 * Within a section, chunks still break on paragraph boundaries rather than
 * mid-sentence.
 */
function chunkText(text) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Group paragraphs into sections wherever a heading-like paragraph starts
  // a new one — this is the hard boundary; word-count chunking happens
  // within each section afterward.
  const sections = [];
  let currentSection = [];
  for (const para of paragraphs) {
    if (looksLikeHeading(para) && currentSection.length) {
      sections.push(currentSection);
      currentSection = [];
    }
    currentSection.push(para);
  }
  if (currentSection.length) sections.push(currentSection);

  const chunks = [];
  for (const section of sections) {
    let current = [];
    let currentWordCount = 0;

    for (const para of section) {
      const paraWordCount = para.split(/\s+/).length;

      // A single paragraph longer than the target is its own chunk rather
      // than being split mid-sentence — better an oversized chunk than a
      // fragment that stops halfway through a clinical instruction.
      if (paraWordCount > CHUNK_WORD_TARGET * 1.5) {
        if (current.length) {
          chunks.push(current.join('\n\n'));
          current = [];
          currentWordCount = 0;
        }
        chunks.push(para);
        continue;
      }

      if (currentWordCount + paraWordCount > CHUNK_WORD_TARGET && current.length) {
        chunks.push(current.join('\n\n'));
        current = [];
        currentWordCount = 0;
      }

      current.push(para);
      currentWordCount += paraWordCount;
    }
    if (current.length) chunks.push(current.join('\n\n'));
  }

  return chunks.flatMap((chunk) => (chunk.length > MAX_CHUNK_CHARS ? splitByCharLimit(chunk, MAX_CHUNK_CHARS) : chunk));
}

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

async function main() {
  const [, , sourceDir, corpusName] = process.argv;
  if (!sourceDir || !corpusName) {
    console.error('Usage: node scripts/ingestRagCorpus.js <sourceDir> <corpusName>');
    process.exit(1);
  }
  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const files = walkDir(sourceDir);
  console.log(`Found ${files.length} supported file(s) under ${sourceDir}`);

  const allChunks = [];
  let skipped = 0;

  for (const filePath of files) {
    const relPath = path.relative(sourceDir, filePath);
    let text;
    try {
      text = await extractText(filePath);
    } catch (err) {
      console.warn(`  SKIPPED (extraction failed): ${relPath} — ${err.message}`);
      skipped += 1;
      continue;
    }

    if (!text || !text.trim()) {
      console.warn(`  SKIPPED (no extractable text — likely a scanned/image PDF): ${relPath}`);
      skipped += 1;
      continue;
    }

    const chunks = chunkText(text);
    chunks.forEach((chunkContent, i) => {
      const id = crypto.createHash('sha1').update(`${relPath}#${i}:${chunkContent}`).digest('hex').slice(0, 16);
      allChunks.push({ id, source: `${relPath}#chunk${i}`, text: chunkContent });
    });
    console.log(`  ${relPath}: ${chunks.length} chunk(s)`);
  }

  const outDir = path.join(__dirname, '..', 'src', 'utils', 'chat', 'ragCorpus');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${corpusName}.chunks.json`);
  fs.writeFileSync(outPath, JSON.stringify(allChunks, null, 2), 'utf-8');

  console.log(`\nWrote ${allChunks.length} chunks to ${outPath}`);
  if (skipped) console.log(`Skipped ${skipped} file(s) — see warnings above.`);
  console.log(`\nNext: node scripts/embedRagCorpus.js ${corpusName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
