/**
 * MedListen wordmark: "Med" (brand red) + a cross badge + "Listen" (navy),
 * set in a serif face — matches the brand reference the product name and
 * color scheme (index.css's --color-primary/--color-navy) are both drawn
 * from. Real text, not an image, so it stays sharp at any size and is
 * screen-reader friendly.
 */
export default function Logo({ className = '' }) {
  return (
    <span className={`brand-logo ${className}`.trim()}>
      <span className="brand-logo-med">Med</span>
      <svg viewBox="0 0 24 24" width="1em" height="1em" className="brand-logo-cross" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="currentColor" />
        <rect x="10.4" y="5.5" width="3.2" height="13" rx="1" fill="white" />
        <rect x="5.5" y="10.4" width="13" height="3.2" rx="1" fill="white" />
      </svg>
      <span className="brand-logo-listen">Listen</span>
    </span>
  );
}
