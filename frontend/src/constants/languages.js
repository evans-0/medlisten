// Shared between ChatIntake (per-visit language choice) and the Settings
// page (default chat language) — same list, same codes as the chat engine
// supports (backend/src/utils/chat/prompts.js).
//
// "badge" is the language's own opening character — shown as a compact
// script-accurate stand-in for a per-language icon, since a generic globe
// icon wouldn't distinguish one language from another.
export const LANGUAGES = [
  { code: 'en', label: 'English', bcp47: 'en-IN', badge: 'A' },
  { code: 'hi', label: 'हिन्दी', englishName: 'Hindi', bcp47: 'hi-IN', badge: 'अ' },
  { code: 'bn', label: 'বাংলা', englishName: 'Bengali', bcp47: 'bn-IN', badge: 'অ' },
  { code: 'te', label: 'తెలుగు', englishName: 'Telugu', bcp47: 'te-IN', badge: 'త' },
  { code: 'mr', label: 'मराठी', englishName: 'Marathi', bcp47: 'mr-IN', badge: 'म' },
  { code: 'ta', label: 'தமிழ்', englishName: 'Tamil', bcp47: 'ta-IN', badge: 'த' },
  { code: 'gu', label: 'ગુજરાતી', englishName: 'Gujarati', bcp47: 'gu-IN', badge: 'ગ' },
  { code: 'kn', label: 'ಕನ್ನಡ', englishName: 'Kannada', bcp47: 'kn-IN', badge: 'ಕ' },
  { code: 'ml', label: 'മലയാളം', englishName: 'Malayalam', bcp47: 'ml-IN', badge: 'മ' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ', englishName: 'Punjabi', bcp47: 'pa-IN', badge: 'ਪ' },
  { code: 'ur', label: 'اردو', englishName: 'Urdu', bcp47: 'ur-IN', badge: 'ا' },
  { code: 'or', label: 'ଓଡ଼ିଆ', englishName: 'Odia', bcp47: 'or-IN', badge: 'ଓ' },
];

export const LANGUAGE_LABELS = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.englishName ? `${l.label} (${l.englishName})` : l.label])
);
export const LANGUAGE_BCP47 = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.bcp47]));
