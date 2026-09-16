import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { UserIcon, StethoscopeIcon } from '../components/icons';
import useHaptics from '../hooks/useHaptics';

const ROLES = {
  patient: {
    label: 'Patient',
    icon: <UserIcon />,
    loginTo: '/patient/login',
  },
  doctor: {
    label: 'Doctor',
    icon: <StethoscopeIcon />,
    loginTo: '/doctor/login',
  },
};

export default function Home() {
  const haptics = useHaptics();

  return (
    <div className="centered-page">
      <div className="card home-card">
        <h1><Logo /></h1>
        <p className="subtitle">Patient Case-Taking &amp; Records Dashboard</p>

        <div className="role-grid">
          {Object.entries(ROLES).map(([key, r]) => (
            <Link
              key={key}
              to={r.loginTo}
              className="role-card role-card-select"
              onClick={() => haptics.tap()}
            >
              <span className="role-card-icon">{r.icon}</span>
              <h2>{r.label}</h2>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
