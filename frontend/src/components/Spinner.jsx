export default function Spinner({ label }) {
  return (
    <div className="spinner-row">
      <span className="spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </div>
  );
}
