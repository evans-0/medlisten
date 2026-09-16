// Mirrors the mic input side (Web Speech API's SpeechRecognition) with its
// output counterpart (SpeechSynthesis) — both are browser-native, work
// fully offline once the OS/browser has voices installed, and need no
// backend service. Feature-detected and silently no-op where unsupported,
// same pattern as useHaptics.

export default function useTextToSpeech() {
  const speak = (text, lang, voice) => {
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
      window.speechSynthesis.cancel(); // don't let turns overlap/queue
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang || 'en-IN';
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* never let a TTS failure break the chat turn */
    }
  };

  const stop = () => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* no-op */
    }
  };

  return { speak, stop };
}
