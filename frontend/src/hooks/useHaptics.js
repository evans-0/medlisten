/**
 * Thin wrapper around the Web Vibration API for short confirmatory buzzes
 * on success/error/warning moments — paired with the matching visual
 * feedback (popIn/shake on .info-banner/.error-banner, see index.css).
 *
 * Real device support is narrow and that's fine: Android Chrome/Firefox
 * support it, iOS Safari never has (Apple has not implemented the
 * Vibration API) and desktop browsers ignore it. Every call is
 * feature-detected and wrapped, so this is always a safe no-op rather
 * than a thing to guard at each call site.
 */
function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Some browsers throw if called outside a user gesture — never worth
    // surfacing to the patient over a missed buzz.
  }
}

export default function useHaptics() {
  return {
    // Routine confirmation — a button press that did something (End chat,
    // selecting an option, sending a message).
    tap: () => vibrate(10),
    // A save/upload/action completed successfully.
    success: () => vibrate([15, 60, 15]),
    // A request failed / validation error.
    error: () => vibrate([30, 50, 30]),
    // Red-flag / urgent triage moment — deliberately more insistent than
    // the others so it reads as distinct, not just "another buzz".
    warning: () => vibrate([40, 40, 40, 40, 90]),
  };
}
