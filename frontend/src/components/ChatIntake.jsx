import { useEffect, useMemo, useRef, useState } from 'react';
import client from '../api/client';
import { MicIcon, StethoscopeIcon, LeafIcon } from './icons';
import useConfirm from '../hooks/useConfirm';
import IconSelect from './IconSelect';
import useHaptics from '../hooks/useHaptics';
import useTextToSpeech from '../hooks/useTextToSpeech';
import { useAccessibility } from '../context/AccessibilityContext';
import { LANGUAGES, LANGUAGE_LABELS, LANGUAGE_BCP47 } from '../constants/languages';

const TRIAGE_LABELS = {
  emergency: 'Emergency',
  urgent: 'Urgent',
  soon: 'See soon',
  routine: 'Routine',
};

// Live, in-browser speech recognition (Web Speech API) — the preferred mic
// path when it's available: real-time, no backend round trip. It's not
// on-device though (audio typically goes to a cloud recognition service),
// and browser support/reliability varies (notably Brave, which has a
// history of restricting Chromium's speech service) — the record-then-
// upload-to-Whisper path below is the fallback when this isn't available,
// and stays the fully local option.
const SpeechRecognitionCtor =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const SPEECH_ERROR_MESSAGES = {
  'not-allowed': 'Microphone permission was denied.',
  'service-not-allowed': "This browser blocked the speech service — try typing instead, or a different browser.",
  network: 'The speech service is unreachable — check your connection.',
  'no-speech': "Didn't catch that — please try again.",
  'audio-capture': 'No microphone could be found.',
  'language-not-supported': 'This language is not supported for live speech recognition here.',
};

// getUserMedia() failures come back as a DOMException whose .message is
// browser-specific and often technical ("Permission dismissed", "Requested
// device not found") — mapped by .name to the same plain language used
// above, so a patient sees one consistent, actionable sentence regardless
// of which mic path failed.
const MIC_ACCESS_ERROR_MESSAGES = {
  NotAllowedError: 'Microphone permission was denied.',
  PermissionDeniedError: 'Microphone permission was denied.',
  NotFoundError: 'No microphone could be found.',
  NotReadableError: 'The microphone is already in use by another app.',
  OverconstrainedError: 'This device has no microphone that works here.',
  SecurityError: 'Microphone access isn’t allowed on this page.',
};

function LiveFieldsPanel({ visit }) {
  const hpiEntries = visit.hpi
    ? Object.entries({
        Site: visit.hpi.site,
        Onset: visit.hpi.onset,
        Character: visit.hpi.character,
        Radiation: visit.hpi.radiation,
        'Associated symptoms': visit.hpi.associatedSymptoms?.join(', '),
        Timing: visit.hpi.timing,
        'Exacerbating/relieving': visit.hpi.exacerbatingRelieving,
        Severity: visit.hpi.severity,
      }).filter(([, v]) => v)
    : [];

  const hasAnything =
    visit.chiefComplaint ||
    hpiEntries.length > 0 ||
    visit.currentMedications?.length ||
    visit.drugAllergyHistory?.length ||
    visit.familyHistory?.length ||
    visit.reviewOfSystems?.length ||
    visit.personalHistory;

  if (!hasAnything) {
    return <p className="empty-state">Nothing captured yet — keep chatting and this fills in live.</p>;
  }

  return (
    <div className="live-fields">
      {visit.chiefComplaint && (
        <div className="live-field-row">
          <strong>Chief complaint:</strong> {visit.chiefComplaint}
        </div>
      )}
      {hpiEntries.map(([label, value]) => (
        <div className="live-field-row" key={label}>
          <strong>{label}:</strong> {value}
        </div>
      ))}
      {visit.currentMedications?.length > 0 && (
        <div className="live-field-row">
          <strong>Current medications:</strong> {visit.currentMedications.join(', ')}
        </div>
      )}
      {visit.drugAllergyHistory?.length > 0 && (
        <div className="live-field-row">
          <strong>Drug allergies:</strong> {visit.drugAllergyHistory.join(', ')}
        </div>
      )}
      {visit.familyHistory?.length > 0 && (
        <div className="live-field-row">
          <strong>Family history:</strong> {visit.familyHistory.join(', ')}
        </div>
      )}
      {visit.personalHistory && (
        <div className="live-field-row">
          <strong>Personal history:</strong> {visit.personalHistory}
        </div>
      )}
      {visit.reviewOfSystems?.length > 0 && (
        <div className="live-field-row">
          <strong>Review of systems:</strong> {visit.reviewOfSystems.join(', ')}
        </div>
      )}
    </div>
  );
}

export default function ChatIntake({ onVisitSaved }) {
  const { settings } = useAccessibility();
  const [confirm, confirmDialog] = useConfirm();
  const haptics = useHaptics();
  const tts = useTextToSpeech();
  const wasRedFlagRef = useRef(false);
  // Tracks whether the answer currently in the input box came from the mic
  // (either recognition path) rather than typing — read once on send to
  // decide whether to speak the assistant's reply back, so voice-in gets
  // voice-out but typing stays silent. Reset the moment the patient edits
  // the box by hand.
  const usedVoiceRef = useRef(false);
  const [visit, setVisit] = useState(null);
  const [ayushMode, setAyushMode] = useState(false);
  const [language, setLanguage] = useState('en');

  // Pre-fill from the patient's saved default (Settings page) once it's
  // loaded, rather than always starting from English — doesn't override a
  // language the patient has already picked for this session.
  useEffect(() => {
    if (settings?.preferredLanguage) setLanguage(settings.preferredLanguage);
  }, [settings?.preferredLanguage]);

  // The browser's raw voice list — only ever updated by the 'voiceschanged'
  // event (some browsers populate it asynchronously after page load), NOT
  // per language. Filtering by language happens synchronously below via
  // useMemo instead of in an effect: an effect-driven filter would commit
  // and paint with the PREVIOUS language's voice list for one frame before
  // correcting itself on the next render, which is visible as "the old
  // language's voice briefly/sometimes flashes in the dropdown" when
  // switching quickly — computing it during render eliminates that frame
  // entirely rather than just reacting to it after the fact.
  const [allVoices, setAllVoices] = useState(() =>
    typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis.getVoices() : []
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;
    const handleVoicesChanged = () => setAllVoices(window.speechSynthesis.getVoices());
    // Covers the case where the browser already had voices loaded (e.g.
    // cached from an earlier navigation) BEFORE this listener attached —
    // 'voiceschanged' only fires on a future change, so relying on the
    // event alone would miss voices that were already there at mount.
    handleVoicesChanged();
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
  }, []);

  const voices = useMemo(() => {
    const prefix = language.split('-')[0].toLowerCase();
    return allVoices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  }, [allVoices, language]);

  // Which voice is selected is real state (the patient can freely pick a
  // different one within the current language). Rather than tracking
  // "which language does this selection belong to" separately, this just
  // checks whether the current selection is still a member of the current
  // (already language-filtered) voices list — false right after a language
  // switch (the old voice isn't in the new list), and also false on first
  // mount before any voice is chosen yet, so one check covers both cases.
  // This is React's documented "adjust state during render" pattern:
  // calling setState conditionally in the render body itself lets React
  // redo this render with the corrected value before anything paints — no
  // intermediate frame where the previous language's voice is still shown.
  const [voiceURI, setVoiceURI] = useState('');
  if (voices.length > 0 && !voices.some((v) => v.voiceURI === voiceURI)) {
    const savedURI = typeof window !== 'undefined' ? localStorage.getItem(`medlisten_voice_${language}`) : null;
    const stillAvailable = voices.some((v) => v.voiceURI === savedURI);
    setVoiceURI(stillAvailable ? savedURI : voices[0].voiceURI);
  }

  const handleVoiceChange = (uri) => {
    setVoiceURI(uri);
    try {
      localStorage.setItem(`medlisten_voice_${language}`, uri);
    } catch {
      /* per-device convenience only — fine if this fails */
    }
  };

  // Previews whichever voice is CURRENTLY selected in the dropdown, not
  // necessarily the one already saved — so a patient can audition a voice
  // before committing to it. Uses the language's own native name as the
  // sample text (already on hand in LANGUAGES) rather than a hardcoded
  // English phrase, since a voice reading text in the wrong script tells
  // you nothing about how it actually sounds in the language it's for.
  const handlePreviewVoice = (uri) => {
    haptics.tap();
    const voice = voices.find((v) => v.voiceURI === uri);
    const sampleText = LANGUAGES.find((l) => l.code === language)?.label || 'Hello';
    tts.speak(sampleText, LANGUAGE_BCP47[language], voice);
  };
  const [input, setInput] = useState('');
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [recordingState, setRecordingState] = useState('idle'); // idle | recording | transcribing
  const transcriptEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const chunksRef = useRef([]);
  const finalTextRef = useRef('');

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visit?.transcript?.length, sending]);

  // Stop any reply still being read aloud if the patient navigates away
  // mid-speech — speechSynthesis is a page-global, it doesn't stop itself
  // just because this component unmounts.
  useEffect(() => () => tts.stop(), []);

  // Fires once on the transition into a red flag, not on every re-render
  // while it stays true — this is the one moment in the whole app that
  // deserves a distinctly different (longer, more insistent) buzz.
  useEffect(() => {
    if (visit?.redFlag && !wasRedFlagRef.current) {
      haptics.warning();
    }
    wasRedFlagRef.current = !!visit?.redFlag;
  }, [visit?.redFlag]);

  useEffect(() => {
    // Only used to decide whether the Whisper fallback is worth offering
    // when the browser has no native speech recognition — the mic button
    // itself shows if EITHER path is available.
    (async () => {
      try {
        const { data } = await client.get('/patient/voice/backends');
        setWhisperAvailable(!!(data.whisper?.available || data.mock?.available));
      } catch {
        setWhisperAvailable(false);
      }
    })();
  }, []);

  const voiceAvailable = !!SpeechRecognitionCtor || whisperAvailable;

  const handleStart = async () => {
    setStarting(true);
    setError('');
    try {
      const { data } = await client.post('/patient/visits', { ayushMode, language });
      setVisit(data);
      onVisitSaved?.(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start the conversation.');
      haptics.error();
    } finally {
      setStarting(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    haptics.tap();
    setSending(true);
    setError('');
    const text = input.trim();
    const wasVoice = usedVoiceRef.current;
    usedVoiceRef.current = false;
    setInput('');
    // Show the patient's own message the instant they send it, rather than
    // waiting for the full round trip (translation + LLM turn can take
    // several seconds) — the "thinking" indicator below covers that wait
    // instead of the whole bubble appearing to hang.
    const previousVisit = visit;
    setVisit((v) => ({ ...v, transcript: [...v.transcript, { role: 'patient', text }] }));
    try {
      const { data } = await client.post(`/patient/visits/${visit._id}/message`, { text });
      setVisit(data);
      onVisitSaved?.(data);
      // Answered by voice -> read the reply back too, so a patient who can't
      // or doesn't want to read doesn't have to switch modes mid-visit.
      // Typed answers stay silent — nothing here forces audio on a patient
      // who chose to type, which matters on a shared kiosk.
      if (wasVoice) {
        const reply = data.transcript[data.transcript.length - 1];
        if (reply?.role === 'assistant') {
          const selectedVoice = voices.find((v) => v.voiceURI === voiceURI);
          tts.speak(reply.text, LANGUAGE_BCP47[data.language] || 'en-IN', selectedVoice);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Message failed to send.');
      setInput(text);
      setVisit(previousVisit);
      usedVoiceRef.current = wasVoice;
      haptics.error();
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setVisit(null);
    setInput('');
    setError('');
  };

  // Non-critical — a failure here shouldn't interrupt the patient with an
  // error banner over a feedback click, so it fails silently.
  const handleFeedback = async (helpful) => {
    haptics.tap();
    try {
      const { data } = await client.post(`/patient/visits/${visit._id}/feedback`, { helpful });
      setVisit(data);
    } catch {
      /* non-critical */
    }
  };

  const handleEndChat = async () => {
    const ok = await confirm({
      title: 'End this conversation?',
      message: "What you've already told MedListen will still be saved to your visit history.",
      confirmLabel: 'End chat',
      cancelLabel: 'Keep chatting',
    });
    if (!ok) return;
    setError('');
    try {
      const { data } = await client.post(`/patient/visits/${visit._id}/end`);
      setVisit(data);
      onVisitSaved?.(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not end the conversation.');
      haptics.error();
    }
  };

  const startLiveRecognition = () => {
    setError('');
    finalTextRef.current = '';
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = LANGUAGE_BCP47[language] || 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      // Rebuilds from the FULL results list every time (index 0, not
      // event.resultIndex) rather than incrementally appending only the
      // "new" range resultIndex claims. On some mobile browsers (notably
      // Android Chrome), continuous recognition periodically restarts its
      // internal segment and can re-report a result range that overlaps
      // what was already appended — incremental appending then duplicates
      // that text every restart. event.results is cumulative for the whole
      // session (finalized entries never get removed), so recomputing the
      // full final text from scratch each time is naturally immune to that:
      // the same finalized segment just gets counted once, however many
      // times the browser re-reports it.
      let finalText = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const chunk = event.results[i];
        if (chunk.isFinal) finalText += chunk[0].transcript;
        else interim += chunk[0].transcript;
      }
      finalTextRef.current = finalText;
      setInput((finalTextRef.current + interim).trim());
    };

    recognition.onerror = (event) => {
      setError(SPEECH_ERROR_MESSAGES[event.error] || `Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      setRecordingState('idle');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecordingState('recording');
  };

  const startWhisperRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecordingState('transcribing');
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const form = new FormData();
        form.append('file', blob, 'clip.webm');
        if (language && language !== 'en') form.append('language', language);
        try {
          const { data } = await client.post('/patient/voice/transcribe', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          if (data.text) {
            setInput(data.text);
          } else {
            setError("Couldn't make out any speech — please try again or type instead.");
          }
        } catch (err) {
          setError(err.response?.data?.message || "Couldn't transcribe that — please type your answer instead.");
        } finally {
          setRecordingState('idle');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState('recording');
    } catch (err) {
      setError(MIC_ACCESS_ERROR_MESSAGES[err.name] || "Couldn't access the microphone — please type your answer instead.");
      setRecordingState('idle');
    }
  };

  const handleMicClick = () => {
    if (recordingState === 'recording') {
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      return;
    }
    tts.stop(); // don't talk over the patient while they're recording
    usedVoiceRef.current = true;
    if (SpeechRecognitionCtor) {
      startLiveRecognition();
    } else {
      startWhisperRecording();
    }
  };

  if (!visit) {
    return (
      <div className="chat-intake">
        <p>
          Talk through what's bringing you in today — MedListen will ask follow-up questions and fill in
          your history as you go.
        </p>
        {error && <div key={error} className="error-banner">{error}</div>}

        <div className="field-group">
          <span className="field-group-label">Language</span>
          <IconSelect
            value={language}
            onChange={setLanguage}
            ariaLabel="Language"
            options={LANGUAGES.map((l) => ({
              value: l.code,
              label: l.label,
              icon: (
                <span className="lang-badge" lang={l.code} aria-hidden="true">
                  {l.badge}
                </span>
              ),
            }))}
          />
        </div>

        {voices.length > 0 && (
          <div className="field-group">
            <span className="field-group-label">Reply voice (when you speak your answers)</span>
            <div className="voice-select-row">
              <select
                className="voice-select"
                value={voiceURI}
                onChange={(e) => {
                  handleVoiceChange(e.target.value);
                  handlePreviewVoice(e.target.value);
                }}
                aria-label="Reply voice"
              >
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handlePreviewVoice(voiceURI)}
                aria-label="Play a sample of this voice"
              >
                🔊 Preview
              </button>
            </div>
          </div>
        )}

        <div className="field-group">
          <span className="field-group-label">Visit type</span>
          <div className="option-grid option-grid-2" role="radiogroup" aria-label="Visit type">
            <button
              type="button"
              role="radio"
              aria-checked={!ayushMode}
              className={`option-card${!ayushMode ? ' option-card-active' : ''}`}
              onClick={() => {
                if (ayushMode) haptics.tap();
                setAyushMode(false);
              }}
            >
              <span className="option-card-icon"><StethoscopeIcon /></span>
              <span className="option-card-label">General visit</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={ayushMode}
              className={`option-card${ayushMode ? ' option-card-active' : ''}`}
              onClick={() => {
                if (!ayushMode) haptics.tap();
                setAyushMode(true);
              }}
            >
              <span className="option-card-icon"><LeafIcon /></span>
              <span className="option-card-label">AYUSH (Ayurveda) visit</span>
            </button>
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleStart} disabled={starting}>
          {starting ? 'Starting...' : 'Start conversation'}
        </button>
      </div>
    );
  }

  return (
    <div className="chat-intake">
      {confirmDialog}
      <div className={`mode-badge${visit.ayushMode ? ' mode-badge-ayush' : ' mode-badge-general'}`}>
        {visit.ayushMode ? <LeafIcon /> : <StethoscopeIcon />}
        <span>{visit.ayushMode ? 'AYUSH (Ayurveda) visit' : 'General visit'}</span>
      </div>
      {visit.redFlag && (
        <div className="review-banner urgent-banner">
          This may be urgent{visit.redFlagReason ? ` (${visit.redFlagReason})` : ''} — please alert staff now.
        </div>
      )}
      <div className="chat-layout">
        <div className="chat-transcript">
          {visit.transcript.map((t, i) => (
            <div key={i} className={`chat-bubble chat-bubble-${t.role}`}>
              {t.text}
            </div>
          ))}
          {sending && (
            <div className="chat-bubble chat-bubble-assistant chat-bubble-thinking" aria-live="polite" aria-label="MedListen is thinking">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>
        <div className="chat-live-panel">
          <h4>Captured so far</h4>
          <div className="extraction-summary-row">
            {visit.language && visit.language !== 'en' && (
              <span className="chip">{LANGUAGE_LABELS[visit.language] || visit.language}</span>
            )}
            {visit.triageLevel && (
              <span className={`chip triage-${visit.triageLevel}`}>{TRIAGE_LABELS[visit.triageLevel]}</span>
            )}
          </div>
          <LiveFieldsPanel visit={visit} />
        </div>
      </div>

      {error && <div key={error} className="error-banner">{error}</div>}

      {visit.status === 'completed' ? (
        <div className="chat-footer">
          <div className="info-banner">This visit is complete and saved to your history below.</div>
          {visit.patientFeedback?.helpful == null ? (
            <div className="feedback-row">
              <span>Did this capture things correctly?</span>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => handleFeedback(true)}>
                👍 Yes
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => handleFeedback(false)}>
                👎 Not quite
              </button>
            </div>
          ) : (
            <p className="field-hint">Thanks for the feedback.</p>
          )}
          <button className="btn btn-secondary" onClick={handleReset}>
            Start another conversation
          </button>
        </div>
      ) : (
        <form className="chat-input-row" onSubmit={handleSend}>
          {voiceAvailable && (
            <button
              type="button"
              className={`mic-btn${recordingState === 'recording' ? ' mic-btn-recording' : ''}`}
              onClick={handleMicClick}
              disabled={sending || recordingState === 'transcribing'}
              title={recordingState === 'recording' ? 'Stop' : 'Speak your answer'}
              aria-label={recordingState === 'recording' ? 'Stop' : 'Speak your answer'}
            >
              <MicIcon />
            </button>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              usedVoiceRef.current = false;
            }}
            placeholder={
              recordingState === 'recording'
                ? 'Listening...'
                : recordingState === 'transcribing'
                  ? 'Transcribing...'
                  : 'Type your answer...'
            }
            disabled={sending || recordingState !== 'idle'}
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={sending || !input.trim() || recordingState !== 'idle'}>
            {sending ? '...' : 'Send'}
          </button>
        </form>
      )}

      {visit.status !== 'completed' && (
        <div className="chat-end-row">
          <button type="button" className="btn btn-ghost btn-small" onClick={handleEndChat}>
            End chat
          </button>
        </div>
      )}
    </div>
  );
}
