import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import PasswordInput from '../components/PasswordInput';
import useHaptics from '../hooks/useHaptics';

const initialForm = {
  abhaId: '',
  password: '',
  name: '',
  dob: '',
  gender: 'male',
  phone: '',
  email: '',
};

export default function PatientRegister() {
  const [form, setForm] = useState(initialForm);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const haptics = useHaptics();

  const update = (field) => (e) =>
    setForm((f) => ({
      ...f,
      [field]: field === 'abhaId' ? e.target.value.replace(/\D/g, '') : e.target.value,
    }));

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
      const { data } = await client.post('/auth/patient/register', form);
      haptics.success();
      login(data.token, 'patient', data.patient);
      navigate('/patient/dashboard');
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
        <h1>Patient Registration</h1>
        {error && <div key={error} className="error-banner">{error}</div>}
        <label>
          ABHA ID <span className="field-hint">(the 14-digit number on your ABHA health card)</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="14-digit ABHA number"
            value={form.abhaId}
            onChange={update('abhaId')}
            maxLength={14}
            required
          />
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
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Register'}
        </button>
        <p className="form-footer">
          Already registered? <Link to="/patient/login">Log in</Link>
        </p>
        <p className="form-footer">
          <Link to="/">&larr; Back</Link>
        </p>
      </form>
    </div>
  );
}
