import { useOutletContext } from 'react-router-dom';
import DocumentUpload from '../../components/DocumentUpload';
import DocumentList from '../../components/DocumentList';

export default function DocumentsSection() {
  const { documents, handleUploaded, handleDelete, handleView } = useOutletContext();
  return (
    <>
      <section className="card">
        <h2>Upload a document</h2>
        <DocumentUpload onUploaded={handleUploaded} />
      </section>

      <section className="card">
        <h2>My documents</h2>
        <DocumentList documents={documents} onView={handleView} onDelete={handleDelete} />
      </section>
    </>
  );
}
