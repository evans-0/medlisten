import { useOutletContext } from 'react-router-dom';
import VisitTimeline from '../../components/VisitTimeline';

export default function VisitsSection() {
  const { visits, fetchVisitDetail } = useOutletContext();
  return (
    <section className="card">
      <h2>Visit history</h2>
      <VisitTimeline visits={visits} fetchDetail={fetchVisitDetail} />
    </section>
  );
}
