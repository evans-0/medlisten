import { useEffect, useRef, useState } from 'react';
import useHaptics from '../hooks/useHaptics';

/**
 * A dropdown that behaves like a native <select> (compact closed state,
 * click to open a list, click outside/Escape to close) but can show a
 * custom icon per option — something a real <option> element can't do.
 * Built for cases where "which icon for each choice" matters enough to
 * be worth a custom control instead of a native select.
 */
export default function IconSelect({ value, onChange, options, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const haptics = useHaptics();
  const selected = options.find((o) => o.value === value);

  const selectOption = (optValue) => {
    if (optValue !== value) haptics.tap();
    onChange(optValue);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="icon-select" ref={containerRef}>
      <button
        type="button"
        className="icon-select-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="icon-select-icon">{selected?.icon}</span>
        <span className="icon-select-label">{selected?.label}</span>
        <span className={`icon-select-caret${open ? ' icon-select-caret-open' : ''}`} aria-hidden="true">
          &#9662;
        </span>
      </button>
      {open && (
        <ul className="icon-select-list" role="listbox" aria-label={ariaLabel}>
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              tabIndex={0}
              className={`icon-select-option${opt.value === value ? ' icon-select-option-active' : ''}`}
              onClick={() => selectOption(opt.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectOption(opt.value);
                }
              }}
            >
              <span className="icon-select-icon">{opt.icon}</span>
              <span>{opt.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
