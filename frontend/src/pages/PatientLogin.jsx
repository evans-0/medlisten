import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import PasswordInput from '../components/PasswordInput';
import useHaptics from '../hooks/useHaptics';

export default function PatientLogin() {
  const [abhaId, setAbhaId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const haptics = useHaptics();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/auth/patient/login', { abhaId, password });
      login(data.token, 'patient', data.patient);
      navigate('/patient/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="centered-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <Link to="/" className="auth-logo" aria-label="MedListen home"><Logo /></Link>
        <h1>Patient Login</h1>
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
          Password
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
        <p className="form-footer">
          <Link to="/patient/reset-password">Forgot password?</Link>
        </p>
        <p className="form-footer">
          New patient? <Link to="/patient/register">Register here</Link>
        </p>
        <p className="form-footer">
          <Link to="/">&larr; Back</Link>
        </p>
      </form>
    </div>
  );
}
