/**
 * Fast, rule-based red-flag pre-check.
 *
 * Ported from a teammate's converse-module (SIH2026/converse-module/app/safety.py).
 * Design decision (theirs, kept here): don't rely solely on the LLM to catch
 * emergency symptoms. This keyword check runs on every patient message
 * BEFORE the LLM call, so an emergency is flagged even if the model call
 * fails, times out, or simply misjudges a turn. The LLM's own red-flag
 * judgment (see prompts.js) is a second, complementary layer — not a
 * replacement for this one.
 *
 * This list is a starting point, not a clinically validated one — same
 * caveat as the source module. Get a clinician to review and extend it
 * before this goes anywhere near a real patient.
 *
 * Multilingual: checked against ALL known languages' keywords regardless of
 * which language the session was started in — a patient can code-switch
 * mid-conversation. Over-flagging just costs a moment of staff attention;
 * under-flagging could matter. RED_FLAG_KEYWORDS_HI/BN/TE/MR are all
 * machine-generated translations, not reviewed by a native or clinical
 * speaker of any of those languages. The BN/TE/MR lists are also narrower
 * than EN/HI — core emergency categories only, not an exhaustive translation
 * of the English list.
 *
 * RED_FLAG_KEYWORDS_TA/GU/KN/ML/PA/UR/OR were machine-translated via
 * IndicTrans2 (translate-service/) from the same 18 core phrases as the
 * BN/TE/MR lists, then verified by round-tripping each phrase back to
 * English and checking the meaning survived — NOT reviewed by a native or
 * clinical speaker, same caveat as the rest. One phrase — "seizure" — was
 * the single hardest concept to get right across every language tested,
 * including with a different translation model (NLLB) at two sizes before
 * switching to IndicTrans2; if a red flag list here still reads oddly for
 * that concept, that's the specific phrase to double-check first. Tamil
 * was excluded entirely in an earlier design (qwen2.5:14b produced
 * consistently broken Tamil when asked to converse in it directly) — it's
 * back now that translation happens via IndicTrans2 instead of the chat
 * LLM itself; see translate-service/README.md.
 */

const RED_FLAG_KEYWORDS_EN = [
  'chest pain',
  "can't breathe",
  'cant breathe',
  'cannot breathe',
  'difficulty breathing',
  'shortness of breath',
  'choking',
  'severe bleeding',
  'heavy bleeding',
  'coughing blood',
  'vomiting blood',
  'unconscious',
  'fainted',
  'seizure',
  'slurred speech',
  'face drooping',
  'one side of my face',
  'sudden weakness',
  "can't move my",
  'cant move my',
  'sudden numbness',
  'sudden confusion',
  'worst headache of my life',
  'sudden severe headache',
  'suicidal',
  'want to die',
  'kill myself',
  'severe abdominal pain',
  'anaphylaxis',
  'severe allergic reaction',
  'throat is closing',
  'throat closing up',
  'swelling of my throat',
  'swollen tongue',
  'tongue is swelling',
  'overdose',
  'swallowed poison',
  'took too many pills',
  'took too many tablets',
  'stiff neck',
  'neck stiffness',
  'sudden vision loss',
  'lost vision in',
  "can't see out of",
  "bleeding and i'm pregnant",
  'pregnant and bleeding',
  'baby not moving',
  'baby stopped moving',
  'reduced fetal movement',
  'baby has a high fever',
  'infant fever',
  'newborn fever',
  'severe burn',
  'testicular pain',
  'twisted testicle',
];

const RED_FLAG_KEYWORDS_HI = [
  'सीने में दर्द',
  'छाती में दर्द',
  'सांस नहीं आ रही',
  'सांस लेने में तकलीफ',
  'दम घुट रहा है',
  'बहुत खून बह रहा है',
  'ज़्यादा खून बह रहा है',
  'खून की खांसी',
  'खून की उल्टी',
  'बेहोश',
  'दौरा पड़ा',
  'मिर्गी का दौरा',
  'बोलने में दिक्कत',
  'चेहरा एक तरफ झुक',
  'अचानक कमज़ोरी',
  'हिल नहीं पा रहा',
  'हिल नहीं पा रही',
  'सुन्न पड़ गया',
  'अचानक भ्रम',
  'ज़िंदगी का सबसे तेज़ सिरदर्द',
  'अचानक तेज़ सिरदर्द',
  'आत्महत्या',
  'मरना चाहता हूं',
  'मरना चाहती हूं',
  'खुद को मारना',
  'पेट में तेज़ दर्द',
  'गंभीर एलर्जी',
  'गला बंद हो रहा है',
  'जीभ में सूजन',
  'ज़हर खा लिया',
  'ज़्यादा दवा खा ली',
  'ओवरडोज़',
  'गर्दन में अकड़न',
  'अचानक दिखना बंद',
  'एक आंख से दिखना बंद',
  'गर्भवती हूं और खून बह रहा है',
  'बच्चा हिल नहीं रहा',
  'बच्चे को तेज़ बुखार',
  'नवजात को बुखार',
  'गंभीर जलन',
];

// Bengali, Telugu, and Marathi equivalents of the highest-priority categories
// above (cardiac/respiratory, bleeding, neuro/stroke, mental health crisis,
// abdominal, allergic reaction, poisoning). Narrower than the EN/HI lists —
// covers the core categories, not every EN entry — and, same as the Hindi
// list, AI-generated and NOT reviewed by a native or clinical speaker. Get
// that review before relying on these for a real patient.
const RED_FLAG_KEYWORDS_BN = [
  'বুকে ব্যথা',
  'শ্বাস নিতে কষ্ট',
  'শ্বাস নিতে পারছি না',
  'অজ্ঞান',
  'খিঁচুনি',
  'প্রচুর রক্তপাত',
  'রক্ত বমি',
  'আত্মহত্যা',
  'মরে যেতে চাই',
  'পেটে প্রচণ্ড ব্যথা',
  'মারাত্মক অ্যালার্জি',
  'গলা বন্ধ হয়ে যাচ্ছে',
  'বিষ খেয়েছি',
  'অতিরিক্ত ওষুধ খেয়েছি',
  'ঘাড় শক্ত',
  'হঠাৎ দেখতে পাচ্ছি না',
  'শরীরের একপাশ অবশ',
  'কথা জড়িয়ে যাচ্ছে',
];

const RED_FLAG_KEYWORDS_TE = [
  'ఛాతీ నొప్పి',
  'శ్వాస తీసుకోవడం కష్టం',
  'శ్వాస ఆడటం లేదు',
  'అపస్మారక స్థితి',
  'మూర్ఛ',
  'విపరీతమైన రక్తస్రావం',
  'రక్తం వాంతి',
  'ఆత్మహత్య',
  'చనిపోవాలని ఉంది',
  'కడుపులో తీవ్రమైన నొప్పి',
  'తీవ్రమైన అలర్జీ',
  'గొంతు మూసుకుపోతోంది',
  'విషం తాగాను',
  'ఎక్కువ మందులు వేసుకున్నాను',
  'మెడ బిగుసుకుపోయింది',
  'అకస్మాత్తుగా కనిపించడం లేదు',
  'శరీరం ఒక వైపు తిమ్మిరి',
  'మాట తడబడుతోంది',
];

const RED_FLAG_KEYWORDS_MR = [
  'छातीत दुखणे',
  'श्वास घ्यायला त्रास',
  'श्वास घेता येत नाही',
  'बेशुद्ध',
  'फिट येणे',
  'झटका येणे',
  'खूप रक्तस्त्राव',
  'रक्ताची उलटी',
  'आत्महत्या',
  'मरून जावेसे वाटते',
  'पोटात तीव्र वेदना',
  'गंभीर ऍलर्जी',
  'घसा बंद होत आहे',
  'विष प्यायलो',
  'जास्त गोळ्या खाल्ल्या',
  'मान आखडली आहे',
  'अचानक दिसणे बंद झाले',
  'शरीराची एक बाजू बधीर',
  'बोलताना अडखळणे',
];

const RED_FLAG_KEYWORDS_TA = [
  'எனக்கு மார்பு வலி உள்ளது',
  'எனக்கு மூச்சு விடுவதில் சிரமம் உள்ளது',
  'என்னால் மூச்சு விட முடியவில்லை',
  'அவர் மயக்கமடைந்து விழுந்தார்',
  'அவருக்கு வலிப்பு உள்ளது',
  'பலத்த இரத்தப்போக்கு உள்ளது',
  'எனக்கு ரத்தம் வாந்தி எடுக்கிறது',
  'நான் தற்கொலை செய்து கொண்டதாக உணர்கிறேன்',
  'நான் இறக்க விரும்புகிறேன்',
  'எனக்கு வயிற்றில் கடுமையான வலி உள்ளது',
  'எனக்கு கடுமையான ஒவ்வாமை எதிர்வினை உள்ளது',
  'என் தொண்டை மூடப்படுகிறது',
  'நான் விஷத்தை விழுங்கிவிட்டேன்',
  'நான் நிறைய மாத்திரை எடுத்துக்கொண்டேன்',
  'என் கழுத்து இறுக்கமாக உள்ளது',
  'நான் திடீரென்று கண்பார்வை இழந்தேன்',
  'நான் திடீரென்று என் உடலின் ஒரு பக்கத்தில் பலவீனமாக உணர்கிறேன்',
  'என் பேச்சு மங்கலாக உள்ளது',
];

const RED_FLAG_KEYWORDS_GU = [
  'મને છાતીમાં દુખાવો થાય છે',
  'મને શ્વાસ લેવામાં તકલીફ થઈ રહી છે',
  'હું શ્વાસ લઈ શકતો નથી',
  'તે બેભાન થઈ ગયો',
  'તેને હુમલા થઈ રહ્યા છે',
  'ભારે રક્તસ્રાવ થાય છે',
  'મને લોહીની ઉલટી થઈ રહી છે',
  'મને આત્મહત્યા કરવાની લાગણી થાય છે',
  'મારે મરવું છે',
  'મને પેટમાં ભારે દુખાવો થાય છે',
  'મને ગંભીર એલર્જીક પ્રતિક્રિયા થઈ રહી છે',
  'મારું ગળું બંધ થઈ રહ્યું છે',
  'મેં ઝેર ગળી લીધું',
  'મેં ઘણી બધી ગોળીઓ લીધી',
  'મારી ગરદન સખત છે',
  'મેં અચાનક મારી દ્રષ્ટિ ગુમાવી દીધી',
  'હું અચાનક મારા શરીરની એક બાજુએ નબળાઈ અનુભવું છું',
  'મારી વાણી અસ્પષ્ટ છે',
];

const RED_FLAG_KEYWORDS_KN = [
  'ನನಗೆ ಎದೆ ನೋವು ಇದೆ',
  'ನನಗೆ ಉಸಿರಾಡಲು ಕಷ್ಟವಾಗುತ್ತಿದೆ',
  'ನನಗೆ ಉಸಿರಾಡಲು ಆಗುತ್ತಿಲ್ಲ',
  'ಆತ ಪ್ರಜ್ಞಾಹೀನನಾಗಿ ಬಿದ್ದನು',
  'ಆತನಿಗೆ ರೋಗಗ್ರಸ್ತವಾಗುವಿಕೆ ಇದೆ',
  'ಭಾರೀ ರಕ್ತಸ್ರಾವವಾಗಿದೆ',
  'ನನಗೆ ರಕ್ತ ವಾಂತಿ ಆಗುತ್ತಿದೆ',
  'ನನಗೆ ಆತ್ಮಹತ್ಯೆ ಮಾಡಿಕೊಳ್ಳುವ ಹಂಬಲವಾಗುತ್ತಿದೆ',
  'ನಾನು ಸಾಯಲು ಬಯಸುತ್ತೇನೆ',
  'ನನಗೆ ಹೊಟ್ಟೆಯಲ್ಲಿ ತೀವ್ರ ನೋವು ಇದೆ',
  'ನಾನು ತೀವ್ರ ಅಲರ್ಜಿಯ ಪ್ರತಿಕ್ರಿಯೆಯನ್ನು ಹೊಂದಿದ್ದೇನೆ',
  'ನನ್ನ ಗಂಟಲು ಮುಚ್ಚುತ್ತಿದೆ',
  'ನಾನು ವಿಷವನ್ನು ನುಂಗಿದ್ದೇನೆ',
  'ನಾನು ತುಂಬಾ ಮಾತ್ರೆಗಳನ್ನು ತೆಗೆದುಕೊಂಡಿದ್ದೇನೆ',
  'ನನ್ನ ಕುತ್ತಿಗೆ ಗಟ್ಟಿಯಾಗಿದೆ',
  'ನಾನು ಇದ್ದಕ್ಕಿದ್ದಂತೆ ನನ್ನ ದೃಷ್ಟಿಯನ್ನು ಕಳೆದುಕೊಂಡೆ',
  'ನಾನು ಇದ್ದಕ್ಕಿದ್ದಂತೆ ನನ್ನ ದೇಹದ ಒಂದು ಬದಿಯಲ್ಲಿ ದುರ್ಬಲನಾಗಿದ್ದೇನೆ',
  'ನನ್ನ ಮಾತು ಅಸ್ಪಷ್ಟವಾಗಿದೆ',
];

const RED_FLAG_KEYWORDS_ML = [
  'എനിക്ക് നെഞ്ചുവേദനയുണ്ട്',
  'എനിക്ക് ശ്വസിക്കാൻ ബുദ്ധിമുട്ടുണ്ട്',
  'എനിക്ക് ശ്വസിക്കാൻ കഴിയുന്നില്ല',
  'അവൻ അബോധാവസ്ഥയിൽ വീണു',
  'അദ്ദേഹത്തിന് അപസ്മാരം പിടിപെട്ടു',
  'കനത്ത രക്തസ്രാവമുണ്ട്',
  'ഞാൻ രക്തം ഛർദ്ദിക്കുന്നു',
  'എനിക്ക് ആത്മഹത്യ തോന്നുന്നു',
  'എനിക്ക് മരിക്കണം',
  'എനിക്ക് വയറ്റിൽ കഠിനമായ വേദനയുണ്ട്',
  'എനിക്ക് ഗുരുതരമായ ഒരു അലർജി പ്രതിപ്രവർത്തനമുണ്ട്',
  'എൻ്റെ തൊണ്ട അടയുകയാണ്',
  'ഞാൻ വിഷം വിഴുങ്ങി',
  'ഞാൻ വളരെയധികം ഗുളികകൾ കഴിച്ചു',
  'എൻ്റെ കഴുത്ത് കഠിനമാണ്',
  'എനിക്ക് പെട്ടെന്ന് കാഴ്ച നഷ്ടപ്പെട്ടു',
  'എനിക്ക് പെട്ടെന്ന് എൻ്റെ ശരീരത്തിൻ്റെ ഒരു വശത്ത് ബലഹീനത അനുഭവപ്പെടുന്നു',
  'എൻ്റെ സംസാരം മങ്ങിയിരിക്കുന്നു',
];

const RED_FLAG_KEYWORDS_PA = [
  'ਮੈਨੂੰ ਛਾਤੀ ਵਿੱਚ ਦਰਦ ਹੈ',
  'ਮੈਨੂੰ ਸਾਹ ਲੈਣ ਵਿੱਚ ਮੁਸ਼ਕਲ ਆ ਰਹੀ ਹੈ',
  'ਮੈਂ ਸਾਹ ਨਹੀਂ ਲੈ ਸਕਦਾ',
  'ਉਹ ਬੇਹੋਸ਼ ਹੋ ਗਿਆ',
  'ਉਸ ਨੂੰ ਦੌਰਾ ਪੈ ਰਿਹਾ ਹੈ',
  'ਭਾਰੀ ਖੂਨ ਵਹਿ ਰਿਹਾ ਹੈ',
  'ਮੈਨੂੰ ਖੂਨ ਦੀ ਉਲਟੀਆਂ ਹੋ ਰਹੀਆਂ ਹਨ',
  'ਮੈਂ ਆਤਮ ਹੱਤਿਆ ਕਰਨ ਦੀ ਭਾਵਨਾ ਮਹਿਸੂਸ ਕਰਦਾ ਹਾਂ',
  'ਮੈਂ ਮਰਨਾ ਚਾਹੁੰਦਾ ਹਾਂ',
  'ਮੇਰੇ ਪੇਟ ਵਿੱਚ ਬਹੁਤ ਦਰਦ ਹੈ',
  'ਮੈਨੂੰ ਗੰਭੀਰ ਐਲਰਜੀ ਪ੍ਰਤੀਕ੍ਰਿਆ ਹੋ ਰਹੀ ਹੈ',
  'ਮੇਰਾ ਗਲਾ ਬੰਦ ਹੋ ਰਿਹਾ ਹੈ',
  'ਮੈਂ ਜ਼ਹਿਰ ਨਿਗਲ ਲਿਆ',
  'ਮੈਂ ਬਹੁਤ ਸਾਰੀਆਂ ਗੋਲੀਆਂ ਖਾ ਲਈਆਂ',
  'ਮੇਰੀ ਗਰਦਨ ਸਖ਼ਤ ਹੈ',
  'ਮੈਂ ਅਚਾਨਕ ਆਪਣੀ ਨਜ਼ਰ ਗੁਆ ਦਿੱਤੀ',
  'ਮੈਂ ਅਚਾਨਕ ਆਪਣੇ ਸਰੀਰ ਦੇ ਇੱਕ ਪਾਸੇ ਕਮਜ਼ੋਰ ਮਹਿਸੂਸ ਕਰਦਾ ਹਾਂ',
  'ਮੇਰੀ ਗੱਲ ਧੁੰਦਲੀ ਹੈ',
];

const RED_FLAG_KEYWORDS_UR = [
  'مجھے سینے میں درد ہے',
  'مجھے سانس لینے میں دشواری ہو رہی ہے',
  'میں سانس نہیں لے سکتا',
  'وہ بے ہوش ہو گیا',
  'اسے دورہ پڑ رہا ہے',
  'شدید خون بہہ رہا ہے',
  'مجھے خون کی الٹی ہو رہی ہے',
  'میں خودکشی محسوس کر رہا ہوں',
  'میں مرنا چاہتا ہوں',
  'میرے پیٹ میں شدید درد ہے',
  'مجھے شدید الرجک ردعمل ہو رہا ہے',
  'میرا گلے بند ہو رہا ہے',
  'میں نے زہر نگل لیا',
  'میں نے بہت زیادہ گولیاں لیں',
  'میری گردن سخت ہے',
  'میں نے اچانک اپنی بینائی کھو دی',
  'میں اچانک اپنے جسم کے ایک طرف کمزور محسوس کرتا ہوں',
  'میری تقریر مبہم ہے',
];

const RED_FLAG_KEYWORDS_OR = [
  'ମୋର ଛାତିରେ ଯନ୍ତ୍ରଣା ହେଉଛି',
  'ମୋର ନିଶ୍ୱାସ ପ୍ରଶ୍ୱାସ ନେବାରେ ଅସୁବିଧା ହେଉଛି',
  'ନିଃଶ୍ୱାସ ପ୍ରଶ୍ୱାସ ନେଉନି',
  'ସେ ଚେତାଶୂନ୍ଯ଼ ହୋଇପଡ଼ିଥିଲେ',
  'ସେ ଏକ ଆକ୍ରମଣର ଶିକାର ହେଉଛନ୍ତି',
  'ପ୍ରବଳ ରକ୍ତସ୍ରାବ ହେଉଛି',
  'ମୁଁ ରକ୍ତ ବାନ୍ତି କରୁଛି',
  'ମୁଁ ଆତ୍ମହତ୍ଯ଼ା କରିବା ଭଳି ଅନୁଭବ କରୁଛି',
  'ମୁଁ ମରିବାକୁ ଚାହେଁ',
  'ମୋର ପେଟରେ ପ୍ରବଳ ଯନ୍ତ୍ରଣା ହେଉଛି',
  'ମୋର ଏକ ଗୁରୁତର ଆଲର୍ଜି ପ୍ରତିକ୍ରିଯ଼ା ହେଉଛି',
  'ମୋ ଗଳା ବନ୍ଦ ହେଉଛି',
  'ମୁଁ ବିଷ ଗିଲି',
  'ମୁଁ ବହୁତ ଗୁଳିକରି ଖାଇଲି',
  'ମୋ ବେକରେ ଯନ୍ତ୍ରଣା ହେଉଛି',
  'ମୁଁ ହଠାତ୍ ମୋ ଦୃଷ୍ଟିଶକ୍ତି ହରାଇଲି',
  'ମୁଁ ହଠାତ୍ ମୋ ଶରୀରର ଗୋଟିଏ ପାର୍ଶ୍ୱରେ ଦୁର୍ବଳ ଅନୁଭବ କରୁଛି',
  'ମୋ ଭାଷଣ ଅସ୍ପଷ୍ଟ',
];

const RED_FLAG_KEYWORDS = [
  ...RED_FLAG_KEYWORDS_EN,
  ...RED_FLAG_KEYWORDS_HI,
  ...RED_FLAG_KEYWORDS_BN,
  ...RED_FLAG_KEYWORDS_TE,
  ...RED_FLAG_KEYWORDS_MR,
  ...RED_FLAG_KEYWORDS_TA,
  ...RED_FLAG_KEYWORDS_GU,
  ...RED_FLAG_KEYWORDS_KN,
  ...RED_FLAG_KEYWORDS_ML,
  ...RED_FLAG_KEYWORDS_PA,
  ...RED_FLAG_KEYWORDS_UR,
  ...RED_FLAG_KEYWORDS_OR,
];

/** Returns the matched phrase, or null if nothing matched. */
function keywordRedFlagCheck(text) {
  const low = text.toLowerCase();
  for (const phrase of RED_FLAG_KEYWORDS) {
    if (low.includes(phrase)) return phrase;
  }
  return null;
}

module.exports = { keywordRedFlagCheck };
