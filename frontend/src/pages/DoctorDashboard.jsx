import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import useHaptics from '../hooks/useHaptics';

export default function DoctorDashboard() {
  const [abhaId, setAbhaId] = useState('');
  const [error, setError] = useState('');
  const haptics = useHaptics();
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{14}$/.test(abhaId)) {
      setError('ABHA ID must be exactly 14 digits');
      haptics.error();
      return;
    }
    navigate(`/doctor/patients/${abhaId}`);
  };

  return (
    <div>
      <Navbar />
      <div className="dashboard">
        <section className="card">
          <h2>Look up a patient</h2>
          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter 14-digit ABHA ID"
              value={abhaId}
              onChange={(e) => setAbhaId(e.target.value.replace(/\D/g, ''))}
              maxLength={14}
              required
            />
            <button className="btn btn-primary" type="submit">
              Search
            </button>
          </form>
          {error && <div key={error} className="error-banner">{error}</div>}
        </section>
      </div>
    </div>
  );
}
