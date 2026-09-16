import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import PasswordInput from '../components/PasswordInput';
import useHaptics from '../hooks/useHaptics';

export default function PatientResetPassword() {
  const [abhaId, setAbhaId] = useState('');
  const [dob, setDob] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const haptics = useHaptics();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      haptics.error();
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/auth/patient/reset-password', { abhaId, dob, newPassword });
      haptics.success();
      login(data.token, 'patient', data.patient);
      navigate('/patient/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset password');
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="centered-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <Link to="/" className="auth-logo" aria-label="MedListen home"><Logo /></Link>
        <h1>Reset password</h1>
        <p className="subtitle">
          Confirm your ABHA ID and date of birth to set a new password.
        </p>
        {error && <div key={error} className="error-banner">{error}</div>}
        <label>
          ABHA ID
          <input
            type="text"
            inputMode="numeric"
            placeholder="14-digit ABHA number"
            value={abhaId}
            onChange={(e) => setAbhaId(e.target.value.replace(/\D/g, ''))}
            maxLength={14}
            required
          />
        </label>
        <label>
          Date of birth
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
        </label>
        <label>
          New password <span className="field-hint">(at least 6 characters)</span>
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </label>
        <label>
          Confirm new password
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Resetting...' : 'Reset password'}
        </button>
        <p className="form-footer">
          <Link to="/patient/login">&larr; Back to login</Link>
        </p>
      </form>
    </div>
  );
}
