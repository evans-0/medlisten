import { useState } from 'react';
import { useAccessibility } from '../../context/AccessibilityContext';
import { LANGUAGES } from '../../constants/languages';
import useHaptics from '../../hooks/useHaptics';

const FONT_SIZES = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Extra large' },
];

export default function SettingsSection() {
  const { settings, updateSettings } = useAccessibility();
  const haptics = useHaptics();
  const [error, setError] = useState('');

  // Every control here saves immediately (no separate Save button) — for
  // font size / contrast especially, the point is to see the effect right
  // away and adjust, not to commit a batch of changes blind. The visible
  // effect (bigger text, higher contrast) is most of the feedback; the tap
  // just confirms it actually reached the server.
  const apply = async (partial) => {
    setError('');
    try {
      await updateSettings(partial);
      haptics.tap();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save that setting.');
      haptics.error();
    }
  };

  return (
    <section className="card">
      <h2>Settings</h2>
      {error && <div key={error} className="error-banner">{error}</div>}

      <div className="field-group">
        <span className="field-group-label">Text size</span>
        <div className="option-grid option-grid-3" role="radiogroup" aria-label="Text size">
          {FONT_SIZES.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={settings.fontSize === f.value}
              className={`option-card${settings.fontSize === f.value ? ' option-card-active' : ''}`}
              onClick={() => apply({ fontSize: f.value })}
            >
              <span className="option-card-label" style={{ fontSize: f.value === 'xlarge' ? '1.3em' : f.value === 'large' ? '1.1em' : '1em' }}>
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <span className="field-group-label">Display</span>
        <label className="settings-toggle-row">
          <span>
            <strong>High contrast</strong>
            <span className="settings-toggle-hint">Stronger borders and text contrast throughout the app.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.highContrast}
            onChange={(e) => apply({ highContrast: e.target.checked })}
          />
        </label>
        <label className="settings-toggle-row">
          <span>
            <strong>Larger touch targets</strong>
            <span className="settings-toggle-hint">Bigger buttons and form fields, easier to tap accurately.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.largerTouchTargets}
            onChange={(e) => apply({ largerTouchTargets: e.target.checked })}
          />
        </label>
      </div>

      <div className="field-group">
        <span className="field-group-label">Default language for &quot;Talk to MedListen&quot;</span>
        <div className="option-grid option-grid-lang" role="radiogroup" aria-label="Default language">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={settings.preferredLanguage === l.code}
              className={`option-card${settings.preferredLanguage === l.code ? ' option-card-active' : ''}`}
              onClick={() => apply({ preferredLanguage: l.code })}
            >
              <span className="option-card-icon lang-badge" lang={l.code} aria-hidden="true">
                {l.badge}
              </span>
              <span className="option-card-label">{l.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
