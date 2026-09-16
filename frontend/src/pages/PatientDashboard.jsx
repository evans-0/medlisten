import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import client from '../api/client';
import { viewFile } from '../api/viewFile';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import Spinner from '../components/Spinner';
import { ChatIcon, ClockIcon, ClipboardIcon, FolderIcon, SettingsIcon } from '../components/icons';
import useConfirm from '../hooks/useConfirm';
import useHaptics from '../hooks/useHaptics';

const NAV_ITEMS = [
  { to: '/patient/dashboard/chat', label: 'Talk to MedListen', icon: <ChatIcon /> },
  { to: '/patient/dashboard/visits', label: 'Visit History', icon: <ClockIcon /> },
  { to: '/patient/dashboard/history', label: 'Medical History', icon: <ClipboardIcon /> },
  { to: '/patient/dashboard/documents', label: 'Documents', icon: <FolderIcon /> },
  { to: '/patient/dashboard/settings', label: 'Settings', icon: <SettingsIcon /> },
];

export default function PatientDashboard() {
  const [confirm, confirmDialog] = useConfirm();
  const haptics = useHaptics();
  const [history, setHistory] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [visits, setVisits] = useState([]);
  const [saving, setSaving] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');
  const [historyError, setHistoryError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [historyRes, docsRes, visitsRes] = await Promise.all([
          client.get('/patient/history'),
          client.get('/patient/documents'),
          client.get('/patient/visits'),
        ]);
        setHistory(historyRes.data);
        setDocuments(docsRes.data);
        setVisits(visitsRes.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refreshVisits = async () => {
    const { data } = await client.get('/patient/visits');
    setVisits(data);
  };

  // A completed chat visit or a finished document extraction can silently
  // fold new facts into the patient's cumulative MedicalHistory record on
  // the backend (see mergeMedicalHistory.js) — `history` here is only ever
  // set once at mount otherwise, so callers that trigger either of those
  // need to explicitly ask for the latest copy.
  const refreshHistory = async () => {
    const { data } = await client.get('/patient/history');
    setHistory(data);
  };

  const fetchVisitDetail = async (id) => {
    const { data } = await client.get(`/patient/visits/${id}`);
    return data;
  };

  const handleSaveHistory = async (form) => {
    setSaving(true);
    setHistoryMessage('');
    setHistoryError(false);
    try {
      const { data } = await client.put('/patient/history', form);
      setHistory(data);
      setHistoryMessage('Medical history saved.');
      haptics.success();
    } catch {
      setHistoryMessage('Failed to save history.');
      setHistoryError(true);
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  const refreshDocuments = async () => {
    const { data } = await client.get('/patient/documents');
    setDocuments(data);
  };

  const handleUploaded = (doc) => {
    setDocuments((docs) => [doc, ...docs]);
    haptics.success();
    // Poll once after a short delay to pick up the async OCR result — the
    // raw history merge (if any) completes at the same point, so refresh
    // both. The overall-summary regeneration is a SECOND fire-and-forget
    // LLM call chained after that merge, so it's normally still running at
    // the 4s mark — a later second poll catches it once it's actually done.
    setTimeout(() => {
      refreshDocuments();
      refreshHistory();
    }, 4000);
    setTimeout(refreshHistory, 12000);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete this document?',
      message: 'This permanently removes the file and its extracted data. This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    await client.delete(`/patient/documents/${id}`);
    setDocuments((docs) => docs.filter((d) => d._id !== id));
  };

  const handleView = (doc) => viewFile(`/patient/documents/${doc._id}/file`);

  if (loading) return <div className="centered-page"><Spinner label="Loading..." /></div>;

  return (
    <div>
      {confirmDialog}
      <Navbar />
      <div className="dashboard-shell">
        <Sidebar items={NAV_ITEMS} />
        <div className="dashboard dashboard-main">
          <Outlet
            context={{
              history,
              documents,
              visits,
              saving,
              historyMessage,
              historyError,
              refreshVisits,
              refreshHistory,
              fetchVisitDetail,
              handleSaveHistory,
              handleUploaded,
              handleDelete,
              handleView,
            }}
          />
        </div>
      </div>
    </div>
  );
}
