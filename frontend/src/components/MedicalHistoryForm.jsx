import { useEffect, useState } from 'react';

const FIELDS = [
  { key: 'chiefComplaint', label: 'Chief complaint', type: 'text' },
  { key: 'historyOfPresentIllness', label: 'History of present illness', type: 'textarea' },
  { key: 'pastMedicalHistory', label: 'Past medical history', type: 'textarea' },
  { key: 'pastSurgicalHistory', label: 'Past surgical history', type: 'textarea' },
  { key: 'drugAllergyHistory', label: 'Drug & allergy history', type: 'textarea' },
  { key: 'familyHistory', label: 'Family history', type: 'textarea' },
  { key: 'personalHistory', label: 'Personal history (diet, habits, lifestyle)', type: 'textarea' },
  { key: 'reviewOfSystems', label: 'Review of systems', type: 'textarea' },
];

const emptyHistory = {
  chiefComplaint: '',
  historyOfPresentIllness: '',
  pastMedicalHistory: '',
  pastSurgicalHistory: '',
  drugAllergyHistory: '',
  currentMedications: [],
  familyHistory: '',
  personalHistory: '',
  reviewOfSystems: '',
};

export default function MedicalHistoryForm({ history, editable, onSave, saving }) {
  const [form, setForm] = useState({ ...emptyHistory, ...history });
  const [medicationsText, setMedicationsText] = useState(
    (history?.currentMedications || []).join(', ')
  );

  useEffect(() => {
    setForm({ ...emptyHistory, ...history });
    setMedicationsText((history?.currentMedications || []).join(', '));
  }, [history]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const currentMedications = medicationsText
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    onSave({ ...form, currentMedications });
  };

  return (
    <>
      {history?.overallSummary && (
        <div className="history-summary">
          <h4>Overall summary</h4>
          <p>{history.overallSummary}</p>
        </div>
      )}
      <form className="history-form" onSubmit={editable ? handleSubmit : (e) => e.preventDefault()}>
      {FIELDS.map(({ key, label, type }) => (
        <label key={key}>
          {label}
          {type === 'textarea' ? (
            <textarea
              rows={3}
              value={form[key] || ''}
              onChange={update(key)}
              disabled={!editable}
            />
          ) : (
            <input type="text" value={form[key] || ''} onChange={update(key)} disabled={!editable} />
          )}
        </label>
      ))}
      <label>
        Current medications (comma-separated)
        <input
          type="text"
          value={medicationsText}
          onChange={(e) => setMedicationsText(e.target.value)}
          disabled={!editable}
        />
      </label>
      {editable && (
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save history'}
        </button>
      )}
      </form>
    </>
  );
}
