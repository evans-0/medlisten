// Standard adult reference ranges — not a document-specific value, so
// (unlike investigations, where extractionPrompt.js deliberately never
// lets the model call something "abnormal" without a reference range
// printed on the document itself) it's safe to classify these on the
// frontend against fixed clinical thresholds rather than trusting the
// model's own judgment call.
function classifyBloodPressure(value) {
  const match = /(\d+)\s*\/\s*(\d+)/.exec(value || '');
  if (!match) return null;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (systolic > 120 || diastolic > 80) return 'high';
  if (systolic < 90 || diastolic < 60) return 'low';
  return 'normal';
}

function classifyPulse(value) {
  const match = /(\d+)/.exec(value || '');
  if (!match) return null;
  const bpm = Number(match[1]);
  if (bpm > 100) return 'high';
  if (bpm < 60) return 'low';
  return 'normal';
}

function ConfidenceTag({ value }) {
  if (value >= 0.75) return null;
  const level = value < 0.5 ? 'low' : 'medium';
  return <span className={`confidence-tag confidence-${level}`}>{Math.round(value * 100)}% confidence</span>;
}

export default function ExtractionDetails({ extracted }) {
  if (!extracted) return null;

  const {
    documentType,
    documentDate,
    presentingComplaints,
    diagnoses,
    vitals,
    medications,
    investigations,
    proceduresSurgeries,
    rawTextExcerpt,
    overallConfidence,
    needsReview,
    reviewReason,
  } = extracted;

  const vitalsEntries = vitals
    ? [
        { label: 'Blood pressure', value: vitals.bloodPressure, status: classifyBloodPressure(vitals.bloodPressure) },
        { label: 'Pulse', value: vitals.pulseRate, status: classifyPulse(vitals.pulseRate) },
        { label: 'Temperature', value: vitals.temperature, status: null },
        { label: 'Resp. rate', value: vitals.respiratoryRate, status: null },
        { label: 'SpO2', value: vitals.spo2, status: null },
      ].filter((entry) => entry.value)
    : [];

  return (
    <div className="extraction-details">
      {needsReview && (
        <div className="review-banner">
          Needs physician review{reviewReason ? ` — ${reviewReason}` : ''}
        </div>
      )}

      <div className="extraction-summary-row">
        {documentType && <span className="chip">{documentType.replace('_', ' ')}</span>}
        {documentDate && <span className="chip">Date on document: {documentDate}</span>}
        <span className="chip">Overall confidence: {Math.round(overallConfidence * 100)}%</span>
      </div>

      {presentingComplaints?.length > 0 && (
        <div className="extraction-section">
          <h4>Presenting complaints</h4>
          <ul>
            {presentingComplaints.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {diagnoses?.length > 0 && (
        <div className="extraction-section">
          <h4>Diagnoses</h4>
          <ul>
            {diagnoses.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {vitalsEntries.length > 0 && (
        <div className="extraction-section">
          <h4>Vitals</h4>
          <div className="vitals-row">
            {vitalsEntries.map(({ label, value, status }) => (
              <span
                key={label}
                className={`vitals-chip${status && status !== 'normal' ? ` vitals-chip-${status}` : ''}`}
              >
                <strong>{label}:</strong> {value}
                {status === 'high' && <span className="vitals-status-label">high</span>}
                {status === 'low' && <span className="vitals-status-label">low</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {medications?.length > 0 && (
        <div className="extraction-section">
          <h4>Medications</h4>
          <div className="table-scroll">
            <table className="extraction-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                </tr>
              </thead>
              <tbody>
                {medications.map((m, i) => (
                  <tr key={i}>
                    <td>
                      {m.name} <ConfidenceTag value={m.confidence} />
                    </td>
                    <td>{m.dosage || '—'}</td>
                    <td>{m.frequency || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {investigations?.length > 0 && (
        <div className="extraction-section">
          <h4>Investigations</h4>
          <div className="table-scroll">
            <table className="extraction-table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Value</th>
                  <th>Reference range</th>
                </tr>
              </thead>
              <tbody>
                {investigations.map((inv, i) => (
                  <tr key={i} className={inv.abnormal ? 'row-abnormal' : ''}>
                    <td>
                      {inv.name} <ConfidenceTag value={inv.confidence} />
                    </td>
                    <td>
                      {inv.value || '—'} {inv.unit || ''}
                      {inv.abnormal === true && <span className="badge-abnormal">abnormal</span>}
                    </td>
                    <td>{inv.referenceRange || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {proceduresSurgeries?.length > 0 && (
        <div className="extraction-section">
          <h4>Procedures / surgeries</h4>
          <ul>
            {proceduresSurgeries.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {rawTextExcerpt && (
        <div className="extraction-section">
          <h4>Excerpt (for sanity-check against the source)</h4>
          <pre className="ocr-text">{rawTextExcerpt}</pre>
        </div>
      )}
    </div>
  );
}
