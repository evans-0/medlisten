import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserIcon, StethoscopeIcon } from './icons';
import Logo from './Logo';

export default function Navbar() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const brandTo = auth?.role === 'patient'
    ? '/patient/dashboard'
    : auth?.role === 'doctor'
      ? '/doctor/dashboard'
      : '/';

  return (
    <header className="navbar">
      <Link className="navbar-brand" to={brandTo} aria-label="MedListen home"><Logo /></Link>
      {auth && (
        <div className="navbar-user">
          <span className="navbar-user-name">
            {auth.role === 'doctor' && (
              <span className="navbar-role-icon" aria-hidden="true">
                <StethoscopeIcon />
              </span>
            )}
            {auth.user.name}
          </span>
          {auth.role === 'patient' && (
            <Link className="navbar-icon-btn" to="/patient/profile" aria-label="Profile" title="Profile">
              <UserIcon />
            </Link>
          )}
          <button className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}
    </header>
  );
}
