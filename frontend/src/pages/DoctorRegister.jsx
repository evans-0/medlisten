import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import PasswordInput from '../components/PasswordInput';
import useHaptics from '../hooks/useHaptics';

const initialForm = {
  doctorId: '',
  password: '',
  name: '',
  specialization: '',
  registrationNumber: '',
};

export default function DoctorRegister() {
  const [form, setForm] = useState(initialForm);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const haptics = useHaptics();

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== confirmPassword) {
      setError('Passwords do not match');
      haptics.error();
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/auth/doctor/register', form);
      haptics.success();
      login(data.token, 'doctor', data.doctor);
      navigate('/doctor/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="centered-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <Link to="/" className="auth-logo" aria-label="MedListen home"><Logo /></Link>
        <h1>Doctor Registration</h1>
        {error && <div key={error} className="error-banner">{error}</div>}
        <label>
          Doctor ID
          <input type="text" value={form.doctorId} onChange={update('doctorId')} required />
        </label>
        <label>
          Password <span className="field-hint">(at least 6 characters)</span>
          <PasswordInput
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </label>
        <label>
          Confirm password
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </label>
        <label>
          Full name
          <input type="text" value={form.name} onChange={update('name')} required />
        </label>
        <label>
          Specialization
          <input type="text" value={form.specialization} onChange={update('specialization')} />
        </label>
        <label>
          Medical registration number
          <input type="text" value={form.registrationNumber} onChange={update('registrationNumber')} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Register'}
        </button>
        <p className="form-footer">
          Already registered? <Link to="/doctor/login">Log in</Link>
        </p>
        <p className="form-footer">
          <Link to="/">&larr; Back</Link>
        </p>
      </form>
    </div>
  );
}
