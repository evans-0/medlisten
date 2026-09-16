import { useState } from 'react';
import ExtractionDetails from './ExtractionDetails';

const CATEGORY_LABELS = {
  prescription: 'Prescription',
  lab_report: 'Lab report',
  discharge_summary: 'Discharge summary',
  imaging: 'Imaging',
  other: 'Other',
};

const STATUS_LABELS = {
  pending: 'Extracting...',
  completed: 'Extraction complete',
  unsupported: 'Extraction not available',
  failed: 'Extraction failed',
};

export default function DocumentList({ documents, onView, onDelete }) {
  const [expandedId, setExpandedId] = useState(null);
  const [viewError, setViewError] = useState('');

  if (!documents || documents.length === 0) {
    return <p className="empty-state">No documents uploaded yet.</p>;
  }

  const handleView = async (doc) => {
    setViewError('');
    try {
      await onView(doc);
    } catch (err) {
      setViewError(err.message || 'Could not open that file.');
    }
  };

  return (
    <>
      {viewError && <div key={viewError} className="error-banner">{viewError}</div>}
      <ul className="document-list">
      {documents.map((doc) => (
        <li key={doc._id} className="document-item">
          <div className="document-row">
            <div className="document-info">
              <strong className="document-name">{doc.originalName}</strong>
              <span className={`badge badge-${doc.category}`}>
                {CATEGORY_LABELS[doc.category] || doc.category}
              </span>
              {doc.extracted?.needsReview && <span className="badge-abnormal">needs review</span>}
              <div className="document-meta">
                {new Date(doc.createdAt).toLocaleString()} &middot; {STATUS_LABELS[doc.ocrStatus]}
                {doc.ocrStatus === 'unsupported' && doc.ocrNote ? ` — ${doc.ocrNote}` : ''}
              </div>
            </div>
            <div className="document-actions">
              <button className="btn btn-ghost" onClick={() => handleView(doc)}>
                View file
              </button>
              {doc.ocrStatus === 'completed' && doc.extracted && (
                <button
                  className="btn btn-ghost"
                  onClick={() => setExpandedId(expandedId === doc._id ? null : doc._id)}
                >
                  {expandedId === doc._id ? 'Hide details' : 'Show extracted details'}
                </button>
              )}
              {onDelete && (
                <button className="btn btn-danger" onClick={() => onDelete(doc._id)}>
                  Delete
                </button>
              )}
            </div>
          </div>
          {expandedId === doc._id && <ExtractionDetails extracted={doc.extracted} />}
        </li>
      ))}
      </ul>
    </>
  );
}
