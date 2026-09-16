import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';
import Spinner from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import useHaptics from '../hooks/useHaptics';
import { calculateAge } from '../utils/age';

function toDateInputValue(dob) {
  return dob ? new Date(dob).toISOString().slice(0, 10) : '';
}

export default function PatientProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { auth, login } = useAuth();
  const haptics = useHaptics();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.get('/patient/me');
        setProfile(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const startEditing = () => {
    setForm({
      name: profile.name,
      dob: toDateInputValue(profile.dob),
      gender: profile.gender,
      phone: profile.phone || '',
      email: profile.email || '',
    });
    setError('');
    setMessage('');
    setEditing(true);
  };

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await client.put('/patient/me', form);
      setProfile(data);
      setEditing(false);
      setMessage('Profile updated.');
      haptics.success();
      login(auth.token, auth.role, { ...auth.user, name: data.name });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="centered-page"><Spinner label="Loading..." /></div>;

  return (
    <div>
      <Navbar />
      <div className="dashboard">
        <Link className="back-link" to="/patient/dashboard">
          &larr; Back to dashboard
        </Link>
        <section className="card">
          <div className="card-header-row">
            <h2>Profile</h2>
            {!editing && (
              <button className="btn btn-secondary" onClick={startEditing}>
                Edit
              </button>
            )}
          </div>

          {message && !editing && <div className="info-banner">{message}</div>}

          {editing ? (
            <form className="history-form" onSubmit={handleSave}>
              {error && <div className="error-banner">{error}</div>}
              <label>
                ABHA ID
                <input type="text" value={profile.abhaId} disabled />
              </label>
              <label>
                Full name
                <input type="text" value={form.name} onChange={update('name')} required />
              </label>
              <label>
                Date of birth
                <input type="date" value={form.dob} onChange={update('dob')} required />
              </label>
              <label>
                Gender
                <select value={form.gender} onChange={update('gender')} required>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Phone
                <input type="tel" value={form.phone} onChange={update('phone')} />
              </label>
              <label>
                Email
                <input type="email" value={form.email} onChange={update('email')} />
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-grid">
              <div>
                <span className="label">ABHA ID</span>
                <span>{profile.abhaId}</span>
              </div>
              <div>
                <span className="label">Name</span>
                <span>{profile.name}</span>
              </div>
              <div>
                <span className="label">Date of birth</span>
                <span>{new Date(profile.dob).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="label">Age</span>
                <span>{calculateAge(profile.dob)} years</span>
              </div>
              <div>
                <span className="label">Gender</span>
                <span>{profile.gender}</span>
              </div>
              <div>
                <span className="label">Phone</span>
                <span>{profile.phone || '—'}</span>
              </div>
              <div>
                <span className="label">Email</span>
                <span>{profile.email || '—'}</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
