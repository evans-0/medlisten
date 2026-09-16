import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AccessibilityProvider } from './context/AccessibilityContext';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import PatientLogin from './pages/PatientLogin';
import PatientRegister from './pages/PatientRegister';
import PatientResetPassword from './pages/PatientResetPassword';
import PatientDashboard from './pages/PatientDashboard';
import PatientProfile from './pages/PatientProfile';
import ChatSection from './pages/patient/ChatSection';
import VisitsSection from './pages/patient/VisitsSection';
import HistorySection from './pages/patient/HistorySection';
import DocumentsSection from './pages/patient/DocumentsSection';
import SettingsSection from './pages/patient/SettingsSection';
import DoctorLogin from './pages/DoctorLogin';
import DoctorRegister from './pages/DoctorRegister';
import DoctorDashboard from './pages/DoctorDashboard';
import DoctorPatientChart from './pages/DoctorPatientChart';

export default function App() {
  return (
    <AuthProvider>
      <AccessibilityProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/patient/login" element={<PatientLogin />} />
            <Route path="/patient/register" element={<PatientRegister />} />
            <Route path="/patient/reset-password" element={<PatientResetPassword />} />
            <Route
              path="/patient/profile"
              element={
                <ProtectedRoute role="patient">
                  <PatientProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/dashboard"
              element={
                <ProtectedRoute role="patient">
                  <PatientDashboard />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="chat" replace />} />
              <Route path="chat" element={<ChatSection />} />
              <Route path="visits" element={<VisitsSection />} />
              <Route path="history" element={<HistorySection />} />
              <Route path="documents" element={<DocumentsSection />} />
              <Route path="settings" element={<SettingsSection />} />
            </Route>
            <Route path="/doctor/login" element={<DoctorLogin />} />
            <Route path="/doctor/register" element={<DoctorRegister />} />
            <Route
              path="/doctor/dashboard"
              element={
                <ProtectedRoute role="doctor">
                  <DoctorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor/patients/:abhaId"
              element={
                <ProtectedRoute role="doctor">
                  <DoctorPatientChart />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AccessibilityProvider>
    </AuthProvider>
  );
}
