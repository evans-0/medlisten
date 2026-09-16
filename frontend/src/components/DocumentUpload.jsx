import { useState } from 'react';
import client from '../api/client';
import { PillIcon, FlaskIcon, DischargeIcon, ScanIcon, FileIcon } from './icons';
import IconSelect from './IconSelect';
import useHaptics from '../hooks/useHaptics';

const CATEGORIES = [
  { value: 'prescription', label: 'Prescription', icon: <PillIcon /> },
  { value: 'lab_report', label: 'Lab report', icon: <FlaskIcon /> },
  { value: 'discharge_summary', label: 'Discharge summary', icon: <DischargeIcon /> },
  { value: 'imaging', label: 'Imaging', icon: <ScanIcon /> },
  { value: 'other', label: 'Other', icon: <FileIcon /> },
];

export default function DocumentUpload({ onUploaded }) {
  const haptics = useHaptics();
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState('prescription');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please choose a file first');
      haptics.error();
      return;
    }
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      const { data } = await client.post('/patient/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUploaded(data);
      setFile(null);
      e.target.reset();
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
      haptics.error();
    } finally {
      setUploading(false);
    }
  };

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      {error && <div key={error} className="error-banner">{error}</div>}
      <div className="field-group">
        <span className="field-group-label">Document type</span>
        <IconSelect value={category} onChange={setCategory} options={CATEGORIES} ariaLabel="Document type" />
      </div>
      <label>
        File (PDF, JPG, PNG, WEBP — max 15MB)
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => setFile(e.target.files[0])}
        />
      </label>
      <button className="btn btn-primary" type="submit" disabled={uploading}>
        {uploading ? 'Uploading...' : 'Upload document'}
      </button>
    </form>
  );
}
