import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import PasswordInput from '../components/PasswordInput';
import useHaptics from '../hooks/useHaptics';

export default function DoctorLogin() {
  const [doctorId, setDoctorId] = useState('');
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
      const { data } = await client.post('/auth/doctor/login', { doctorId, password });
      login(data.token, 'doctor', data.doctor);
      navigate('/doctor/dashboard');
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
        <h1>Doctor Login</h1>
        {error && <div key={error} className="error-banner">{error}</div>}
        <label>
          Doctor ID
          <input type="text" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required />
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
          New here? <Link to="/doctor/register">Register</Link>
        </p>
        <p className="form-footer">
          <Link to="/">&larr; Back</Link>
        </p>
      </form>
    </div>
  );
}
