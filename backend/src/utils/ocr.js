const fs = require('fs');
const pdfParse = require('pdf-parse');
const { buildExtractionInstruction } = require('./extractionPrompt');
const { EXTRACTION_SCHEMA } = require('./ocrGroqSchema');
const { GROQ_API_KEY, GROQ_BASE_URL, waitForGroqSlot } = require('./groqPacer');

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'medgemma:4b';
const OLLAMA_TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || OLLAMA_VISION_MODEL;
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120000;

// OCR defaults to local Ollama even when GROQ_API_KEY is set for chat —
// deliberately decoupled, not tied to the same switch. Decision: only the
// chat LLM is worth the cloud round-trip (it's the piece that was
// genuinely unreliable locally — 15-200+ second turns); local hardware
// handles document OCR, translation, and embeddings fine on their own, so
// there's no reason to also route them through Groq's shared, rate-limited
// account. Set OCR_USE_GROQ=true to opt back in — the integration is still
// here (qwen/qwen3.8-27b is vision-capable with Strict Mode JSON) and was
// verified working; it's just off by default.
const OCR_USE_GROQ = process.env.OCR_USE_GROQ === 'true' && !!GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_CHAT_MODEL || 'qwen/qwen3.8-27b';

function stripCodeFence(content) {
  const trimmed = content.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const lines = trimmed.split('\n');
  if (lines[0].startsWith('```')) lines.shift();
  if (lines.length && lines[lines.length - 1].startsWith('```')) lines.pop();
  return lines.join('\n').trim();
}

function asStringOrNull(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
}

function asConfidence(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function asBoolOrNull(v) {
  return typeof v === 'boolean' ? v : null;
}

/** Coerces a raw parsed-JSON extraction (untrusted, LLM-produced) into our schema shape. */
function normalizeExtraction(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const vitalsRaw = r.vitals && typeof r.vitals === 'object' ? r.vitals : {};

  return {
    documentType: asStringOrNull(r.document_type),
    documentDate: asStringOrNull(r.document_date),
    presentingComplaints: asStringArray(r.presenting_complaints),
    diagnoses: asStringArray(r.diagnoses),
    vitals: {
      bloodPressure: asStringOrNull(vitalsRaw.blood_pressure),
      pulseRate: asStringOrNull(vitalsRaw.pulse_rate),
      temperature: asStringOrNull(vitalsRaw.temperature),
      respiratoryRate: asStringOrNull(vitalsRaw.respiratory_rate),
      spo2: asStringOrNull(vitalsRaw.spo2),
    },
    medications: Array.isArray(r.medications)
      ? r.medications
          .filter((m) => m && asStringOrNull(m.name))
          .map((m) => ({
            name: asStringOrNull(m.name),
            dosage: asStringOrNull(m.dosage),
            frequency: asStringOrNull(m.frequency),
            confidence: asConfidence(m.confidence),
          }))
      : [],
    investigations: Array.isArray(r.investigations)
      ? r.investigations
          .filter((i) => i && asStringOrNull(i.name))
          .map((i) => ({
            name: asStringOrNull(i.name),
            value: asStringOrNull(i.value),
            unit: asStringOrNull(i.unit),
            referenceRange: asStringOrNull(i.reference_range),
            abnormal: asBoolOrNull(i.abnormal),
            confidence: asConfidence(i.confidence),
          }))
      : [],
    proceduresSurgeries: asStringArray(r.procedures_surgeries),
    rawTextExcerpt: asStringOrNull(r.raw_text_excerpt),
    overallConfidence: asConfidence(r.overall_confidence),
    needsReview: typeof r.needs_review === 'boolean' ? r.needs_review : false,
    reviewReason: asStringOrNull(r.review_reason),
  };
}

async function callOllamaChat({ model, messages }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        format: 'json',
        stream: false,
        options: { temperature: 0.1 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama request failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const content = stripCodeFence(data.message?.content || '');
    return JSON.parse(content);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @param {string} instruction
 * @param {{mimeType: string, base64: string}|null} image - present for vision
 *   extraction, null for text-only extraction.
 */
async function callGroqExtraction(instruction, image) {
  await waitForGroqSlot();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const content = image
      ? [
          { type: 'text', text: instruction },
          { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
        ]
      : instruction;
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        messages: [{ role: 'user', content }],
        temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'document_extraction', strict: true, schema: EXTRACTION_SCHEMA },
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Groq request failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extracts structured clinical data from an image — via Groq's cloud vision
 * model when OCR_USE_GROQ is opted into, otherwise a local Ollama vision
 * model (medgemma:4b by default — a medical-domain-tuned vision model).
 * See this file's OCR_USE_GROQ comment for why OCR defaults to local even
 * when GROQ_API_KEY is set (for chat).
 */
async function runVisionExtraction(filePath, mimeType, documentTypeHint) {
  const imageBase64 = fs.readFileSync(filePath).toString('base64');
  const instruction = buildExtractionInstruction(documentTypeHint);

  const raw = OCR_USE_GROQ
    ? await callGroqExtraction(instruction, { mimeType, base64: imageBase64 })
    : await callOllamaChat({
        model: OLLAMA_VISION_MODEL,
        messages: [{ role: 'user', content: instruction, images: [imageBase64] }],
      });

  return normalizeExtraction(raw);
}

/**
 * Runs the same structured extraction against plain text already pulled
 * from a digital PDF's text layer (no image/vision step needed).
 */
async function runTextExtraction(text, documentTypeHint) {
  const instruction = buildExtractionInstruction(documentTypeHint);
  const fullInstruction = `${instruction}\n\nHere is the document's text content:\n"""\n${text}\n"""`;

  if (OCR_USE_GROQ) {
    const raw = await callGroqExtraction(fullInstruction, null);
    return normalizeExtraction(raw);
  }

  const raw = await callOllamaChat({
    model: OLLAMA_TEXT_MODEL,
    messages: [
      {
        role: 'user',
        content: fullInstruction,
      },
    ],
  });

  return normalizeExtraction(raw);
}

/**
 * Extracts structured clinical data from an uploaded document.
 * - Images: run through a local Ollama vision model.
 * - Text-based PDFs: text layer pulled via pdf-parse, then structured via
 *   the same extraction prompt (text-only, no vision step needed).
 * - Scanned (image-only) PDFs are out of scope for this MVP (would need a
 *   PDF->image render step before they could go through the vision model).
 */
async function extractDocument(filePath, mimeType, documentTypeHint) {
  try {
    if (IMAGE_MIME_TYPES.has(mimeType)) {
      const extracted = await runVisionExtraction(filePath, mimeType, documentTypeHint);
      return { status: 'completed', extracted };
    }

    if (mimeType === 'application/pdf') {
      const buffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(buffer);
      const text = (parsed.text || '').trim();
      if (text.length === 0) {
        return {
          status: 'unsupported',
          extracted: null,
          note: 'No embedded text found (likely a scanned PDF). Image-based PDF OCR is not yet supported.',
        };
      }
      const extracted = await runTextExtraction(text, documentTypeHint);
      return { status: 'completed', extracted };
    }

    return { status: 'unsupported', extracted: null };
  } catch (err) {
    console.error('Document extraction failed:', err.message);
    return { status: 'failed', extracted: null };
  }
}

module.exports = { extractDocument };
