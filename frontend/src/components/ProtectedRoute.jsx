import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ role, children }) {
  const { auth } = useAuth();

  if (!auth || auth.role !== role) {
    return <Navigate to="/" replace />;
  }

  return children;
}
