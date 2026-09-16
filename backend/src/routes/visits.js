const express = require('express');
const Visit = require('../models/Visit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { keywordRedFlagCheck } = require('../utils/chat/safety');
const { runTurnWithRetry } = require('../utils/chat/turnRunner');
const { OPENING_QUESTIONS, SUPPORTED_LANGUAGES } = require('../utils/chat/prompts');
const { mergeVisitIntoMedicalHistory } = require('../utils/mergeMedicalHistory');
const { toEnglish, fromEnglish } = require('../utils/translate/client');
const { summarizeHistory } = require('../utils/chat/historySummary');
const { generateOverallSummary } = require('../utils/overallSummary');

// Not awaited at any call site — this is a "nice to have" enrichment on top
// of the already-durable merge above it, and it's another full LLM call
// (can take several seconds), so it must never add latency to the
// patient's turn or leave a completed visit's response waiting on it.
function refreshOverallSummary(patientId) {
  generateOverallSummary(patientId).catch((err) =>
    console.error('[visits] overall summary refresh failed:', err.message)
  );
}

const router = express.Router();

router.use(requireAuth, requireRole('patient'));

const MAX_PATIENT_TURNS = 14;

// Same "generated, not reviewed" caveat as prompts.js/turnRunner.js.
// TA/GU/KN/ML/PA/UR/OR were machine-translated via IndicTrans2 rather than
// qwen2.5:14b — see translate-service/README.md.
const URGENT_MESSAGES = {
  en: 'This sounds urgent — please alert staff immediately. Do not wait for the rest of this form.',
  hi: 'यह गंभीर लग रहा है — कृपया तुरंत स्टाफ को बताएं। इस फ़ॉर्म को पूरा करने का इंतज़ार न करें।',
  bn: 'এটি জরুরি মনে হচ্ছে — অনুগ্রহ করে অবিলম্বে স্টাফকে জানান। এই ফর্মটি সম্পূর্ণ করার জন্য অপেক্ষা করবেন না।',
  te: 'ఇది అత్యవసరంగా అనిపిస్తోంది — దయచేసి వెంటనే సిబ్బందికి తెలియజేయండి. ఈ ఫారమ్ పూర్తి చేయడానికి వేచి ఉండకండి.',
  mr: 'हे गंभीर वाटत आहे — कृपया लगेच कर्मचाऱ्यांना कळवा. हा फॉर्म पूर्ण होण्याची वाट पाहू नका.',
  ta: 'இது அவசரமாகத் தெரிகிறது. தயவுசெய்து உடனடியாக ஊழியர்களை எச்சரிக்கவும். இந்த படிவத்தின் எஞ்சிய பகுதிக்கு காத்திருக்க வேண்டாம்.',
  gu: 'આ તાત્કાલિક લાગે છે. મહેરબાની કરીને તાત્કાલિક કર્મચારીઓને ચેતવણી આપો. આ ફોર્મના બાકીના ભાગની રાહ ન જુઓ.',
  kn: 'ಇದು ತುರ್ತು ಎಂದು ತೋರುತ್ತದೆ. ದಯವಿಟ್ಟು ತಕ್ಷಣವೇ ಸಿಬ್ಬಂದಿಯನ್ನು ಎಚ್ಚರಿಸಿ. ಈ ಫಾರ್ಮ್ನ ಉಳಿದ ಭಾಗಕ್ಕಾಗಿ ಕಾಯಬೇಡಿ.',
  ml: 'ഇത് അടിയന്തിരമായി തോന്നുന്നു. ദയവായി ഉടൻ തന്നെ ജീവനക്കാരെ അറിയിക്കുക. ഈ ഫോമിന്റെ ബാക്കി ഭാഗത്തിനായി കാത്തിരിക്കരുത്.',
  pa: 'ਇਹ ਜ਼ਰੂਰੀ ਲੱਗਦਾ ਹੈ। ਕ੍ਰਿਪਾ ਕਰਕੇ ਸਟਾਫ ਨੂੰ ਤੁਰੰਤ ਚੌਕਸ ਕਰੋ। ਇਸ ਫਾਰਮ ਦੇ ਬਾਕੀ ਹਿੱਸੇ ਦੀ ਉਡੀਕ ਨਾ ਕਰੋ।',
  ur: 'یہ ضروری لگتا ہے۔ براہ کرم عملے کو فوری طور پر آگاہ کریں۔ اس فارم کے باقی حصے کا انتظار نہ کریں۔',
  or: 'ଏହା ଜରୁରୀ ମନେହେଉଛି। ଦୟାକରି ତୁରନ୍ତ କର୍ମଚାରୀଙ୍କୁ ସତର୍କ କରନ୍ତୁ। ଏହି ଫର୍ମର ଅବଶିଷ୍ଟ ଅଂଶକୁ ଅପେକ୍ଷା କରନ୍ତୁ ନାହିଁ।',
};

// Shown when the patient ends the chat themselves rather than the model
// deciding it's complete — so the transcript/doctor view can tell the
// difference from a natural or red-flag ending.
const ENDED_BY_PATIENT_MESSAGES = {
  en: 'Ended by the patient. Thank you — this has been saved to your visit history.',
  hi: 'मरीज़ द्वारा समाप्त किया गया। धन्यवाद — यह आपके विज़िट इतिहास में सहेज लिया गया है।',
  bn: 'রোগী নিজে শেষ করেছেন। ধন্যবাদ — এটি আপনার ভিজিট ইতিহাসে সংরক্ষিত হয়েছে।',
  te: 'రోగి స్వయంగా ముగించారు. ధన్యవాదాలు — ఇది మీ విజిట్ చరిత్రలో సేవ్ చేయబడింది.',
  mr: 'रुग्णाने स्वतः संभाषण संपवले. धन्यवाद — हे तुमच्या भेटीच्या इतिहासात जतन केले आहे.',
  ta: 'நோயாளியால் முடிந்தது. நன்றி. இது உங்கள் வருகை வரலாற்றில் சேமிக்கப்பட்டுள்ளது.',
  gu: 'દર્દી દ્વારા સમાપ્ત. આભાર. આ તમારી મુલાકાતના ઇતિહાસમાં સાચવવામાં આવ્યું છે.',
  kn: 'ರೋಗಿಯಿಂದ ಕೊನೆಗೊಂಡಿದೆ. ಧನ್ಯವಾದಗಳು. ಇದನ್ನು ನಿಮ್ಮ ಭೇಟಿಯ ಇತಿಹಾಸದಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ.',
  ml: 'രോഗി അവസാനിപ്പിച്ചു. നന്ദി. ഇത് നിങ്ങളുടെ സന്ദർശന ചരിത്രത്തിൽ സൂക്ഷിച്ചിരിക്കുന്നു.',
  pa: 'ਮਰੀਜ਼ ਦੁਆਰਾ ਖਤਮ ਕੀਤਾ ਗਿਆ। ਧੰਨਵਾਦ। ਇਹ ਤੁਹਾਡੇ ਦੌਰੇ ਦੇ ਇਤਿਹਾਸ ਵਿੱਚ ਸੁਰੱਖਿਅਤ ਕਰ ਲਿਆ ਗਿਆ ਹੈ।',
  ur: 'مریض نے اسے ختم کر دیا۔ شکریہ۔ یہ آپ کے دورے کی تاریخ میں محفوظ کر لیا گیا ہے۔',
  or: 'ରୋଗୀ ଦ୍ୱାରା ସମାପ୍ତ ହୋଇଛି। ଧନ୍ୟବାଦ। ଏହା ଆପଣଙ୍କ ପରିଦର୍ଶନ ଇତିହାସରେ ସଂରକ୍ଷିତ ହୋଇଛି।',
};

router.post('/', async (req, res) => {
  const { ayushMode, language } = req.body;
  const lang = SUPPORTED_LANGUAGES.has(language) ? language : 'en';
  const visit = await Visit.create({
    patient: req.user.id,
    ayushMode: !!ayushMode,
    language: lang,
    // A fixed, hand-translated opening line (see prompts.js) — no need to
    // round-trip it through the translation service.
    transcript: [{ role: 'assistant', text: OPENING_QUESTIONS[lang], textEn: OPENING_QUESTIONS.en }],
  });
  res.status(201).json(visit);
});

router.get('/', async (req, res) => {
  const visits = await Visit.find({ patient: req.user.id })
    .select('-transcript')
    .sort({ createdAt: -1 });
  res.json(visits);
});

router.get('/:id', async (req, res) => {
  const visit = await Visit.findOne({ _id: req.params.id, patient: req.user.id });
  if (!visit) return res.status(404).json({ message: 'Visit not found' });
  res.json(visit);
});

router.post('/:id/message', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ message: 'text is required' });
  }

  const visit = await Visit.findOne({ _id: req.params.id, patient: req.user.id });
  if (!visit) return res.status(404).json({ message: 'Visit not found' });

  // Sending another message after completion reopens the conversation
  // (e.g. the patient wants to add something) rather than rejecting it.
  if (visit.status === 'completed' && !visit.redFlag) {
    visit.status = 'in_progress';
  }

  const trimmed = text.trim();

  // Runs on the ORIGINAL text, before translation, against ALL languages'
  // keyword lists — same reasoning as always: this must still work even if
  // the translation service (or the LLM) is down, and a patient can
  // code-switch mid-conversation regardless of the visit's chosen language.
  const matched = keywordRedFlagCheck(trimmed);
  if (matched) {
    visit.transcript.push({ role: 'patient', text: trimmed, textEn: trimmed });
    visit.patientTurnCount += 1;
    visit.redFlag = true;
    visit.redFlagReason = `keyword match: '${matched}'`;
    visit.triageLevel = 'emergency';
    visit.status = 'completed';
    const urgentMessage = URGENT_MESSAGES[visit.language] || URGENT_MESSAGES.en;
    visit.transcript.push({ role: 'assistant', text: urgentMessage, textEn: URGENT_MESSAGES.en });
    await visit.save();
    await mergeVisitIntoMedicalHistory(req.user.id, visit);
    refreshOverallSummary(req.user.id);
    return res.json(visit);
  }

  // The chat LLM only ever sees English (see prompts.js) — translate the
  // patient's message before it reaches the model. A failure here aborts
  // the turn outright (rather than falling back to the untranslated text)
  // since feeding the LLM text in the wrong language would silently produce
  // a nonsensical turn instead of a clean, retryable error.
  let patientTextEn = trimmed;
  if (visit.language !== 'en') {
    try {
      patientTextEn = await toEnglish(trimmed, visit.language);
    } catch (err) {
      console.error('[visits] translation to English failed:', err.message);
      return res.status(502).json({
        message: 'Having trouble understanding that right now — please try again shortly, or switch to English.',
      });
    }
  }

  visit.transcript.push({ role: 'patient', text: trimmed, textEn: patientTextEn });
  visit.patientTurnCount += 1;

  const transcriptForModel = visit.transcript.map((t) => ({ role: t.role, text: t.textEn || t.text }));
  let result;
  try {
    result = await runTurnWithRetry(transcriptForModel, {
      ayushMode: visit.ayushMode,
      currentHistory: summarizeHistory(visit),
    });
  } catch (err) {
    console.error('[visits] chat turn failed:', err.message);
    return res.status(502).json({ message: 'The chat assistant is currently unavailable. Please try again shortly.' });
  }

  visit.chiefComplaint = result.history.chiefComplaint;
  visit.hpi = result.history.hpi;
  visit.pastMedicalSurgicalHistory = result.history.pastMedicalSurgicalHistory;
  visit.currentMedications = result.history.currentMedications;
  visit.drugAllergyHistory = result.history.drugAllergyHistory;
  visit.familyHistory = result.history.familyHistory;
  visit.personalHistory = result.history.personalHistory;
  visit.reviewOfSystems = result.history.reviewOfSystems;
  visit.ayush = result.history.ayush;

  if (result.redFlag) {
    visit.redFlag = true;
    visit.redFlagReason = result.redFlagReason;
  }
  if (result.triageLevel) visit.triageLevel = result.triageLevel;

  const hardCapHit = visit.patientTurnCount >= MAX_PATIENT_TURNS;
  visit.status = result.complete || visit.redFlag || hardCapHit ? 'completed' : 'in_progress';

  // The LLM's nextQuestion is English — translate it for display. Unlike
  // the incoming translation above, a failure here degrades to showing the
  // English text rather than failing the turn: the patient's answer has
  // already been processed and the structured history above already
  // updated, so discarding all of that over a translation hiccup would lose
  // more than it protects.
  let assistantTextEn = result.nextQuestion;
  let assistantText = assistantTextEn;
  if (visit.language !== 'en') {
    try {
      assistantText = await fromEnglish(assistantTextEn, visit.language);
    } catch (err) {
      console.error('[visits] translation from English failed:', err.message);
    }
  }

  visit.transcript.push({ role: 'assistant', text: assistantText, textEn: assistantTextEn });

  await visit.save();
  if (visit.status === 'completed') {
    await mergeVisitIntoMedicalHistory(req.user.id, visit);
    refreshOverallSummary(req.user.id);
  }
  res.json(visit);
});

// The patient ending the chat themselves, independent of the model ever
// deciding it's complete, the red-flag path, or the hard turn cap. No LLM
// call needed — the visit's fields already reflect everything captured up
// to the last turn, since each assistant turn re-derives the full state.
router.post('/:id/end', async (req, res) => {
  const visit = await Visit.findOne({ _id: req.params.id, patient: req.user.id });
  if (!visit) return res.status(404).json({ message: 'Visit not found' });

  if (visit.status !== 'completed') {
    visit.status = 'completed';
    const closingMessage = ENDED_BY_PATIENT_MESSAGES[visit.language] || ENDED_BY_PATIENT_MESSAGES.en;
    visit.transcript.push({ role: 'assistant', text: closingMessage, textEn: ENDED_BY_PATIENT_MESSAGES.en });
    await visit.save();
    await mergeVisitIntoMedicalHistory(req.user.id, visit);
    refreshOverallSummary(req.user.id);
  }

  res.json(visit);
});

// The patient's own read on whether the chat captured things correctly,
// asked once on the completion screen. Only meaningful once the visit is
// done — there's nothing to judge yet mid-conversation.
router.post('/:id/feedback', async (req, res) => {
  const { helpful } = req.body;
  if (typeof helpful !== 'boolean') {
    return res.status(400).json({ message: 'helpful must be true or false' });
  }

  const visit = await Visit.findOne({ _id: req.params.id, patient: req.user.id });
  if (!visit) return res.status(404).json({ message: 'Visit not found' });
  if (visit.status !== 'completed') {
    return res.status(400).json({ message: 'Feedback can only be given once the visit is complete' });
  }

  visit.patientFeedback = { helpful, submittedAt: new Date() };
  await visit.save();
  res.json(visit);
});

module.exports = router;
