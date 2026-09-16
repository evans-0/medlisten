import { useEffect, useRef } from 'react';
import useHaptics from '../hooks/useHaptics';

/**
 * Replaces the browser's native `confirm()` — same yes/no shape, but
 * styled to match the rest of the app instead of the OS's own dialog
 * chrome. Rendered conditionally by useConfirm(); not meant to be used
 * directly.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const haptics = useHaptics();

  // Fires the instant the confirm button is tapped, not after whatever
  // async work the caller does with it — this is about acknowledging the
  // tap itself, the same way the click already gets a visible :active
  // press state.
  const handleConfirm = () => {
    haptics.tap();
    onConfirm();
  };

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title">{title}</h3>
        {message && <p>{message}</p>}
        <div className="confirm-actions">
          <button type="button" ref={cancelRef} className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
