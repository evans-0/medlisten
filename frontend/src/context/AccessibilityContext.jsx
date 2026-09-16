import { createContext, useContext, useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from './AuthContext';

const AccessibilityContext = createContext(null);

const DEFAULT_SETTINGS = {
  fontSize: 'normal',
  highContrast: false,
  largerTouchTargets: false,
  preferredLanguage: 'en',
};

/**
 * Loads the patient's accessibility + default-language settings and
 * applies them globally via attributes/classes on <html> — deliberately
 * stored on the account (see backend/src/models/Patient.js) rather than
 * localStorage, so they follow the patient across devices instead of
 * being tied to whichever kiosk terminal they're using.
 */
export function AccessibilityProvider({ children }) {
  const { auth } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!auth || auth.role !== 'patient') {
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    (async () => {
      try {
        const { data } = await client.get('/patient/me');
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      } catch {
        // Not logged in yet, or a transient failure — defaults are a safe fallback.
      }
    })();
  }, [auth]);

  useEffect(() => {
    const root = document.documentElement;

    if (settings.fontSize && settings.fontSize !== 'normal') {
      root.setAttribute('data-font-size', settings.fontSize);
    } else {
      root.removeAttribute('data-font-size');
    }

    if (settings.highContrast) {
      root.setAttribute('data-contrast', 'high');
    } else {
      root.removeAttribute('data-contrast');
    }

    root.classList.toggle('a11y-large-targets', !!settings.largerTouchTargets);
  }, [settings]);

  const updateSettings = async (partial) => {
    const { data } = await client.put('/patient/settings', partial);
    setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    return data;
  };

  return (
    <AccessibilityContext.Provider value={{ settings, updateSettings }}>{children}</AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility must be used within an AccessibilityProvider');
  return ctx;
}
