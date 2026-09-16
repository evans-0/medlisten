import { useOutletContext } from 'react-router-dom';
import ChatIntake from '../../components/ChatIntake';

export default function ChatSection() {
  const { refreshVisits, refreshHistory } = useOutletContext();

  const handleVisitSaved = (visit) => {
    refreshVisits();
    // A visit only merges into MedicalHistory once it's completed, but
    // re-fetching on every turn is cheap and keeps this from silently
    // drifting stale if that ever changes.
    refreshHistory();
    // The overall-summary regeneration is fire-and-forget on the backend
    // (another full LLM call, several seconds) — it won't be done yet by
    // the time the request above returns, so poll once more shortly after
    // to actually pick it up, same pattern as the document-upload OCR poll.
    if (visit?.status === 'completed') {
      setTimeout(refreshHistory, 8000);
    }
  };

  return (
    <section className="card chat-page-card">
      <h2>Talk to MedListen</h2>
      <ChatIntake onVisitSaved={handleVisitSaved} />
    </section>
  );
}
