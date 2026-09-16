/**
 * Lightweight RAG guardrail: embeds a small curated set of clinical
 * guidelines and retrieves the closest match to what the patient has said
 * so far, to ground the LLM's follow-up questions in a vetted protocol
 * instead of free-wheeling.
 *
 * Ported from a teammate's converse-module (SIH2026/converse-module/app/rag.py
 * + guidelines.json), which uses the same embedding model and approach.
 */
const fs = require('fs');
const path = require('path');
const { getEmbedding: getEmbeddingRaw } = require('../embeddingClient');

const GUIDELINES_PATH = path.join(__dirname, 'guidelines.json');
const SIMILARITY_THRESHOLD = 0.55;

let guidelines = null;
let vectors = null; // array of normalized number[] embeddings, same order as guidelines

async function getEmbedding(text) {
  try {
    return await getEmbeddingRaw(text);
  } catch (err) {
    console.error('[rag] Error getting embedding:', err.message);
    return [];
  }
}

function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

async function loadAndEmbed() {
  if (vectors !== null) return;

  if (!fs.existsSync(GUIDELINES_PATH)) {
    guidelines = [];
    vectors = [];
    return;
  }

  guidelines = JSON.parse(fs.readFileSync(GUIDELINES_PATH, 'utf-8'));
  console.log(`[rag] Loading ${guidelines.length} clinical guidelines into vector space...`);

  const embeds = [];
  for (const g of guidelines) {
    const text = `Patient symptom: ${g.condition}. Protocol: ${g.protocol}`;
    // eslint-disable-next-line no-await-in-loop
    embeds.push(normalize(await getEmbedding(text)));
  }
  vectors = embeds;
  console.log('[rag] Vector store ready.');
}

/**
 * Looks at what the patient has said so far and returns the most relevant
 * clinical guideline's protocol text, or '' if nothing matches closely enough.
 */
async function retrieveGuideline(transcript) {
  await loadAndEmbed();
  if (!guidelines.length) return '';

  const patientText = transcript
    .filter((t) => t.role === 'patient')
    .map((t) => t.text)
    .join(' ')
    .trim();
  if (!patientText) return '';

  const queryVec = normalize(await getEmbedding(patientText));
  if (queryVec.every((v) => v === 0)) return '';

  let bestIdx = -1;
  let bestScore = -Infinity;
  vectors.forEach((v, i) => {
    const score = dot(v, queryVec);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });

  if (bestIdx >= 0 && bestScore > SIMILARITY_THRESHOLD) {
    console.log(`[rag] Matched '${guidelines[bestIdx].condition}' with score ${bestScore.toFixed(2)}`);
    return guidelines[bestIdx].protocol;
  }
  return '';
}

const CORPUS_DIR = path.join(__dirname, 'ragCorpus');
const CORPUS_TOP_K = 2;

// name -> { chunks, ids, vectors } | null (null = files don't exist, checked once)
const corpusCache = new Map();

/**
 * Loads a bulk-ingested corpus (scripts/ingestRagCorpus.js +
 * scripts/embedRagCorpus.js output) from its pre-computed embeddings —
 * unlike guidelines.json's ~20 hand-written entries, a real corpus is far
 * too large to embed at server boot, so embedding happens once, offline,
 * ahead of time. Returns null if that corpus hasn't been ingested/embedded
 * yet, so callers can no-op cleanly rather than erroring.
 */
function loadCorpus(corpusName) {
  if (corpusCache.has(corpusName)) return corpusCache.get(corpusName);

  const chunksPath = path.join(CORPUS_DIR, `${corpusName}.chunks.json`);
  const embeddingsPath = path.join(CORPUS_DIR, `${corpusName}.embeddings.json`);
  if (!fs.existsSync(chunksPath) || !fs.existsSync(embeddingsPath)) {
    corpusCache.set(corpusName, null);
    return null;
  }

  const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
  const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
  const chunksById = new Map(chunks.map((c) => [c.id, c]));

  const entries = Object.entries(embeddings)
    .filter(([id]) => chunksById.has(id))
    .map(([id, { vector }]) => ({ chunk: chunksById.get(id), vector }));

  console.log(`[rag] Loaded corpus '${corpusName}': ${entries.length} embedded chunk(s).`);
  const loaded = { entries };
  corpusCache.set(corpusName, loaded);
  return loaded;
}

/**
 * Same retrieval as retrieveGuideline, but against a bulk-ingested corpus
 * and returning the top-K chunk texts (a corpus chunk is a raw excerpt,
 * not a hand-written protocol summary, so several are more useful than
 * just the single best match). Returns [] if the named corpus hasn't been
 * ingested/embedded — safe to call unconditionally.
 */
async function retrieveFromCorpus(corpusName, transcript, topK = CORPUS_TOP_K) {
  const corpus = loadCorpus(corpusName);
  if (!corpus || !corpus.entries.length) return [];

  const patientText = transcript
    .filter((t) => t.role === 'patient')
    .map((t) => t.text)
    .join(' ')
    .trim();
  if (!patientText) return [];

  const queryVec = normalize(await getEmbedding(patientText));
  if (queryVec.every((v) => v === 0)) return [];

  const scored = corpus.entries
    .map(({ chunk, vector }) => ({ chunk, score: dot(vector, queryVec) }))
    .filter((e) => e.score > SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (scored.length) {
    console.log(
      `[rag] Corpus '${corpusName}' matched: ${scored.map((e) => `${e.chunk.source} (${e.score.toFixed(2)})`).join(', ')}`
    );
  }
  return scored.map((e) => e.chunk.text);
}

module.exports = { retrieveGuideline, retrieveFromCorpus };
