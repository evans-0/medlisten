/**
 * Shared embedding client for both rag.js (live query embedding at request
 * time) and scripts/embedRagCorpus.js (pre-computed corpus embedding,
 * offline). These MUST use the exact same model — cosine similarity
 * between a query vector and a corpus of vectors only means anything when
 * both came from the same embedding space. Splitting this into its own
 * module (like groqPacer.js for the chat/OCR Groq calls) makes that
 * guaranteed by construction rather than something two independently-
 * maintained getEmbedding() functions could quietly drift apart on.
 *
 * Two backends:
 * - HF_TOKEN set -> Hugging Face's hf-inference provider (BAAI/bge-small-en-v1.5
 *   by default, 384-dim, confirmed genuinely deployed there — unlike
 *   nomic-embed-text, which HF explicitly does not host on any provider).
 *   Billed under the same Inference Providers credit system as any other
 *   HF usage (see huggingface.co/settings/billing) — not a separate free
 *   quota, so re-embedding a large corpus is a real, if small, cost.
 * - Otherwise: local Ollama (nomic-embed-text by default), as before.
 *
 * IMPORTANT: switching HF_TOKEN on/off changes which embedding space
 * queries land in. A corpus embedded with one backend is NOT compatible
 * with queries embedded by the other — retrieval would silently return
 * near-random matches rather than erroring. Re-run
 * scripts/embedRagCorpus.js for every corpus after changing this.
 */
const HF_TOKEN = process.env.HF_TOKEN;
const HF_EMBED_MODEL = process.env.HF_EMBED_MODEL || 'BAAI/bge-small-en-v1.5';
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_EMBED_MODEL}`;

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

async function getEmbeddingFromHF(text) {
  const res = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${HF_TOKEN}`,
    },
    body: JSON.stringify({ inputs: text }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HF embeddings request failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  // sentence-transformers models on hf-inference return a flat number[]
  // for a single string input (or number[][] if the model's pooling
  // config returns per-token vectors instead of one pooled sentence
  // vector) — normalize to a flat vector either way.
  if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
  return data;
}

async function getEmbeddingFromOllama(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Ollama embeddings request failed (${res.status})`);
  const data = await res.json();
  return data.embedding || [];
}

async function getEmbedding(text) {
  return HF_TOKEN ? getEmbeddingFromHF(text) : getEmbeddingFromOllama(text);
}

module.exports = { getEmbedding, HF_TOKEN, HF_EMBED_MODEL, OLLAMA_EMBED_MODEL };
