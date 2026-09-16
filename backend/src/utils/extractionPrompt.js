/**
 * Prompt + JSON shape for structured medical document extraction.
 *
 * Ported from a teammate's ocr-module (SIH2026/ocr-module/app/prompts.py +
 * schema.py), which arrived at this design through actual live testing —
 * notably: separating presenting_complaints from diagnoses, giving vitals
 * their own object instead of force-fitting them into investigations, and
 * only ever flagging "abnormal" from a reference range printed on the
 * document itself, never from the model's general medical knowledge.
 *
 * Deliberately conservative: a wrong dosage is a worse failure than an
 * honest "couldn't read this clearly".
 */

const EXTRACTION_INSTRUCTION = `You are extracting structured information from a photo of a patient's medical
document (a prescription, lab report, or discharge summary) for an Indian
OPD clinical intake system. A physician will review your extraction before
it's trusted — your job is accurate extraction and honest confidence
reporting, not diagnosis or interpretation.

Rules:
- Only extract what is actually visible on the document. Never invent or
  infer a diagnosis, medication, dosage, or value that isn't legible.
- If text is handwritten and hard to read, extract your best reading but set
  a LOW confidence (below 0.5) on that specific field, and set
  needs_review=true with a reason. Do not silently guess a dosage or value.
- Printed/typed text is generally reliable — confidence near 1.0 is fine for
  clearly legible printed text.
- For investigations/lab values: only set "abnormal" to true or false if a
  reference range is visibly printed on the document AND you can compare the
  value against it. If there's no reference range visible, leave "abnormal"
  as null — do not use general medical knowledge to decide what's normal.
- Bedside vitals (often under an "O/E" / "on examination" heading — blood
  pressure, pulse rate, temperature, respiratory rate, SpO2) go in the
  "vitals" object, NOT in "investigations" — investigations is for lab-style
  results with a name/value/unit shape. Extract whichever vitals fields are
  present and leave the rest null.
- Distinguish presenting symptoms from diagnosis. Text under a "c/o"
  (complains of), "C/O", or "Chief Complaint" heading describes what the
  PATIENT reported and belongs in "presenting_complaints" as short symptom
  names — it is not a diagnosis. Text under "Imp:" (impression), "Dx:", or
  "Diagnosis:" is the CLINICIAN's conclusion and belongs in "diagnoses". Do
  not mix the two. If a document has symptoms but no stated impression,
  leave diagnoses empty rather than promoting a symptom into it.
- "document_date": copy the date exactly as written on the document. If
  there are multiple dates, use the one that looks like the document's own
  date, not a patient date-of-birth or similar.
- "raw_text_excerpt": a short excerpt (a few lines) of the clearest text you
  read, so a physician can quickly sanity-check your extraction against the
  source image.
- "overall_confidence": your honest assessment of the whole extraction,
  0-1. A clean printed lab report should be high; a messy handwritten
  prescription should be correspondingly lower — do not inflate it.
- Do not attempt to identify drug interactions or comment on treatment
  appropriateness. That's explicitly out of scope here.

Respond ONLY with JSON matching exactly this shape (use null / empty arrays
for anything not present, do not add extra fields):
{
  "document_type": "prescription" | "lab_report" | "discharge_summary" | "other" | null,
  "document_date": string | null,
  "presenting_complaints": string[],
  "diagnoses": string[],
  "vitals": {
    "blood_pressure": string | null,
    "pulse_rate": string | null,
    "temperature": string | null,
    "respiratory_rate": string | null,
    "spo2": string | null
  },
  "medications": [
    { "name": string, "dosage": string | null, "frequency": string | null, "confidence": number }
  ],
  "investigations": [
    { "name": string, "value": string | null, "unit": string | null, "reference_range": string | null, "abnormal": boolean | null, "confidence": number }
  ],
  "procedures_surgeries": string[],
  "raw_text_excerpt": string | null,
  "overall_confidence": number,
  "needs_review": boolean,
  "review_reason": string | null
}`;

function buildExtractionInstruction(documentTypeHint) {
  if (documentTypeHint && documentTypeHint !== 'other') {
    return (
      EXTRACTION_INSTRUCTION +
      `\nThe uploader indicated this is likely a: ${documentTypeHint}. Use that as a ` +
      'hint, but set document_type based on what the document actually looks like if it clearly doesn\'t match.'
    );
  }
  return EXTRACTION_INSTRUCTION;
}

module.exports = { buildExtractionInstruction };
