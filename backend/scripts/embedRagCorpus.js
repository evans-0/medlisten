/**
 * Embeds the chunks produced by scripts/ingestRagCorpus.js, via the same
 * local Ollama embedding model rag.js already uses (nomic-embed-text) —
 * so retrieval at runtime and embedding here are the same model, which
 * matters for cosine-similarity scores to mean anything.
 *
 * This is the actual bottleneck at 1GB-of-source-text scale, not the
 * ingestion step: a large corpus can easily chunk into hundreds of
 * thousands of pieces, and embedding is one model call per chunk. This
 * script is built around that reality:
 *
 * - CONCURRENT requests (CONCURRENCY below), not one-at-a-time — a small
 *   embedding model handles several parallel requests fine, unlike the
 *   14B chat model.
 * - RESUMABLE: already-embedded chunks (matched by id — which is a hash
 *   of the chunk's own content, so if source text changes, the id changes
 *   and it re-embeds automatically) are skipped on a re-run. Killing this
 *   mid-run and re-running it later picks up where it left off instead of
 *   starting over.
 * - CHECKPOINTED: writes progress to disk periodically (every
 *   CHECKPOINT_EVERY chunks), not only at the very end — a crash partway
 *   through doesn't lose everything already embedded.
 *
 * Usage:
 *   node scripts/embedRagCorpus.js <corpusName>
 *
 * Reads src/utils/chat/ragCorpus/<corpusName>.chunks.json (from the
 * ingest script) and writes src/utils/chat/ragCorpus/<corpusName>.embeddings.json.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getEmbedding, HF_TOKEN } = require('../src/utils/embeddingClient');

// Lower concurrency for HF specifically — its hf-inference provider is
// billed under the same small Inference Providers credit pool as any other
// HF usage (not a separate free rate limit), so hammering it with the same
// concurrency tuned for a free local Ollama call risks burning through that
// budget faster than intended on a single corpus run. Local Ollama keeps
// the original concurrency since there's no external cost to it.
const CONCURRENCY = HF_TOKEN ? 2 : 6;
const CHECKPOINT_EVERY = 200;

function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

async function main() {
  const [, , corpusName] = process.argv;
  if (!corpusName) {
    console.error('Usage: node scripts/embedRagCorpus.js <corpusName>');
    process.exit(1);
  }

  const corpusDir = path.join(__dirname, '..', 'src', 'utils', 'chat', 'ragCorpus');
  const chunksPath = path.join(corpusDir, `${corpusName}.chunks.json`);
  const embeddingsPath = path.join(corpusDir, `${corpusName}.embeddings.json`);

  if (!fs.existsSync(chunksPath)) {
    console.error(`Chunks file not found: ${chunksPath} — run scripts/ingestRagCorpus.js first.`);
    process.exit(1);
  }

  const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));

  let existing = {};
  if (fs.existsSync(embeddingsPath)) {
    existing = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
    console.log(`Found ${Object.keys(existing).length} already-embedded chunk(s) — resuming.`);
  }

  const todo = chunks.filter((c) => !existing[c.id]);
  console.log(`${chunks.length} total chunks, ${todo.length} need embedding.`);

  if (todo.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const startTime = Date.now();
  let done = 0;
  let failed = 0;

  function save() {
    fs.writeFileSync(embeddingsPath, JSON.stringify(existing), 'utf-8');
  }

  async function worker(queue) {
    while (queue.length) {
      const chunk = queue.pop();
      try {
        const vec = normalize(await getEmbedding(chunk.text));
        existing[chunk.id] = { source: chunk.source, vector: vec };
      } catch (err) {
        console.warn(`\n  FAILED: ${chunk.source} — ${err.message}`);
        failed += 1;
      }
      done += 1;
      if (done % CHECKPOINT_EVERY === 0) save();

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = done / elapsed;
      const remaining = todo.length - done;
      const etaMin = rate > 0 ? Math.round(remaining / rate / 60) : '?';
      process.stdout.write(
        `\r  ${done}/${todo.length} embedded (${failed} failed) — ${rate.toFixed(1)}/s, ETA ${etaMin}m   `
      );
    }
  }

  const queue = [...todo];
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  save();
  console.log(`\n\nDone. ${Object.keys(existing).length} chunks embedded to ${embeddingsPath}`);
  if (failed) console.log(`${failed} chunk(s) failed to embed — re-run this script to retry just those.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
