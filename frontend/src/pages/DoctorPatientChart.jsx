import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../api/client';
import { viewFile } from '../api/viewFile';
import Navbar from '../components/Navbar';
import MedicalHistoryForm from '../components/MedicalHistoryForm';
import DocumentList from '../components/DocumentList';
import VisitTimeline from '../components/VisitTimeline';
import Spinner from '../components/Spinner';
import { calculateAge } from '../utils/age';
import useHaptics from '../hooks/useHaptics';

/**
 * Full read-only chart for one patient, addressed by ABHA ID in the URL —
 * reached from the doctor dashboard's ABHA ID search.
 */
export default function DoctorPatientChart() {
  const { abhaId } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const haptics = useHaptics();

  useEffect(() => {
    setLoading(true);
    setError('');
    client
      .get(`/doctor/patients/${abhaId}`)
      .then(({ data }) => setResult(data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load this patient'))
      .finally(() => setLoading(false));
  }, [abhaId]);

  const handleView = (doc) => viewFile(`/doctor/documents/${doc._id}/file`);

  const fetchVisitDetail = async (id) => {
    const { data } = await client.get(`/doctor/visits/${id}`);
    return data;
  };

  const handleFlag = async (visitId, reason) => {
    try {
      const { data } = await client.patch(`/doctor/visits/${visitId}/flag`, { reason });
      setResult((r) => ({ ...r, visits: r.visits.map((v) => (v._id === visitId ? data : v)) }));
      haptics.success();
    } catch {
      haptics.error();
    }
  };

  return (
    <div>
      <Navbar />
      <div className="dashboard">
        <Link className="btn btn-ghost" to="/doctor/dashboard">&larr; Back to search</Link>

        {loading && <Spinner label="Loading patient..." />}
        {error && <div className="error-banner">{error}</div>}

        {result && (
          <>
            <section className="card">
              <h2>Profile</h2>
              <div className="profile-grid">
                <div>
                  <span className="label">ABHA ID</span>
                  <span>{result.patient.abhaId}</span>
                </div>
                <div>
                  <span className="label">Name</span>
                  <span>{result.patient.name}</span>
                </div>
                <div>
                  <span className="label">Date of birth</span>
                  <span>{new Date(result.patient.dob).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="label">Age</span>
                  <span>{calculateAge(result.patient.dob)} years</span>
                </div>
                <div>
                  <span className="label">Gender</span>
                  <span>{result.patient.gender}</span>
                </div>
                <div>
                  <span className="label">Phone</span>
                  <span>{result.patient.phone || '—'}</span>
                </div>
                <div>
                  <span className="label">Email</span>
                  <span>{result.patient.email || '—'}</span>
                </div>
              </div>
            </section>

            <section className="card">
              <h2>Visit history</h2>
              <VisitTimeline visits={result.visits} fetchDetail={fetchVisitDetail} onFlag={handleFlag} />
            </section>

            <section className="card">
              <h2>Medical History</h2>
              <MedicalHistoryForm history={result.history} editable={false} />
            </section>

            <section className="card">
              <h2>Documents</h2>
              <DocumentList documents={result.documents} onView={handleView} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
