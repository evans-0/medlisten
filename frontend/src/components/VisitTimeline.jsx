import { useState } from 'react';
import Spinner from './Spinner';

const TRIAGE_LABELS = {
  emergency: 'Emergency',
  urgent: 'Urgent',
  soon: 'See soon',
  routine: 'Routine',
};

const LANGUAGE_LABELS = {
  hi: 'Hindi',
  bn: 'Bengali',
  te: 'Telugu',
  mr: 'Marathi',
};

function VisitDetail({ visit }) {
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

  return (
    <div className="visit-detail">
      {hpiEntries.length > 0 && (
        <div className="extraction-section">
          <h4>History of present illness</h4>
          <ul>
            {hpiEntries.map(([label, value]) => (
              <li key={label}>
                <strong>{label}:</strong> {value}
              </li>
            ))}
          </ul>
        </div>
      )}
      {visit.pastMedicalSurgicalHistory?.length > 0 && (
        <div className="extraction-section">
          <h4>Past medical/surgical history</h4>
          <ul>
            {visit.pastMedicalSurgicalHistory.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      {visit.currentMedications?.length > 0 && (
        <div className="extraction-section">
          <h4>Current medications</h4>
          <ul>
            {visit.currentMedications.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      {visit.drugAllergyHistory?.length > 0 && (
        <div className="extraction-section">
          <h4>Drug allergies</h4>
          <ul>
            {visit.drugAllergyHistory.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      {visit.familyHistory?.length > 0 && (
        <div className="extraction-section">
          <h4>Family history</h4>
          <ul>
            {visit.familyHistory.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      {visit.personalHistory && (
        <div className="extraction-section">
          <h4>Personal history</h4>
          <p>{visit.personalHistory}</p>
        </div>
      )}
      {visit.reviewOfSystems?.length > 0 && (
        <div className="extraction-section">
          <h4>Review of systems</h4>
          <ul>
            {visit.reviewOfSystems.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      {visit.transcript?.length > 0 && (
        <div className="extraction-section">
          <h4>Conversation transcript</h4>
          <div className="chat-transcript chat-transcript-readonly">
            {visit.transcript.map((t, i) => (
              <div key={i} className={`chat-bubble chat-bubble-${t.role}`}>
                {t.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VisitTimeline({ visits, fetchDetail, onFlag }) {
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [flaggingId, setFlaggingId] = useState(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);

  if (!visits || visits.length === 0) {
    return <p className="empty-state">No visits recorded yet.</p>;
  }

  const toggle = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!details[id]) {
      setLoadingId(id);
      try {
        const full = await fetchDetail(id);
        setDetails((d) => ({ ...d, [id]: full }));
      } finally {
        setLoadingId(null);
      }
    }
  };

  const startFlagging = (id) => {
    setFlaggingId(id);
    setFlagReason('');
  };

  const submitFlag = async (id) => {
    setFlagSubmitting(true);
    try {
      await onFlag(id, flagReason);
      setFlaggingId(null);
    } finally {
      setFlagSubmitting(false);
    }
  };

  return (
    <ul className="document-list">
      {visits.map((v) => (
        <li key={v._id} className="document-item">
          <div className="document-row">
            <div>
              <strong>{v.chiefComplaint || (v.redFlag ? 'Flagged as urgent' : 'Visit')}</strong>
              {v.language && LANGUAGE_LABELS[v.language] && <span className="chip">{LANGUAGE_LABELS[v.language]}</span>}
              {v.triageLevel && <span className={`chip triage-${v.triageLevel}`}>{TRIAGE_LABELS[v.triageLevel]}</span>}
              {v.redFlag && <span className="badge-abnormal">urgent</span>}
              {v.doctorFeedback?.flagged && <span className="badge-abnormal">flagged inaccurate</span>}
              <div className="document-meta">
                {new Date(v.createdAt).toLocaleString()} &middot; {v.status === 'completed' ? 'Completed' : 'In progress'}
              </div>
            </div>
            <div className="document-actions">
              <button className="btn btn-ghost" onClick={() => toggle(v._id)}>
                {expandedId === v._id ? 'Hide details' : 'Show details'}
              </button>
              {onFlag && !v.doctorFeedback?.flagged && (
                <button className="btn btn-ghost" onClick={() => startFlagging(v._id)}>
                  Flag as inaccurate
                </button>
              )}
            </div>
          </div>
          {flaggingId === v._id && (
            <div className="flag-form">
              <label>
                What looks wrong about this visit&apos;s AI-collected history?
                <textarea
                  rows={2}
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="e.g. missed the real chief complaint, wrong triage level..."
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={() => submitFlag(v._id)}
                  disabled={flagSubmitting}
                >
                  {flagSubmitting ? 'Submitting...' : 'Submit flag'}
                </button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setFlaggingId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {v.doctorFeedback?.flagged && v.doctorFeedback.reason && (
            <p className="field-hint">Flagged: {v.doctorFeedback.reason}</p>
          )}
          {expandedId === v._id &&
            (loadingId === v._id ? (
              <Spinner label="Loading..." />
            ) : (
              details[v._id] && <VisitDetail visit={details[v._id]} />
            ))}
        </li>
      ))}
    </ul>
  );
}
