import { useOutletContext } from 'react-router-dom';
import MedicalHistoryForm from '../../components/MedicalHistoryForm';

export default function HistorySection() {
  const { history, handleSaveHistory, saving, historyMessage, historyError } = useOutletContext();
  return (
    <section className="card">
      <h2>Medical History</h2>
      {historyMessage && (
        <div key={historyMessage} className={historyError ? 'error-banner' : 'info-banner'}>
          {historyMessage}
        </div>
      )}
      <MedicalHistoryForm history={history} editable onSave={handleSaveHistory} saving={saving} />
    </section>
  );
}
