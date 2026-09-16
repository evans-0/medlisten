/**
 * One-time backfill: mergeVisitIntoMedicalHistory / mergeDocumentIntoMedicalHistory
 * only run at the moment a visit or document extraction completes. Visits/
 * documents that completed before that merge step existed in the codebase
 * never got folded into the patient's cumulative MedicalHistory record.
 * This walks every patient's already-completed visits and extracted
 * documents, oldest first, and replays the same merge — safe to re-run,
 * since the merge itself dedupes against what's already there.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Patient = require('../src/models/Patient');
const Visit = require('../src/models/Visit');
const Document = require('../src/models/Document');
const { mergeVisitIntoMedicalHistory, mergeDocumentIntoMedicalHistory } = require('../src/utils/mergeMedicalHistory');

async function main() {
  await connectDB();

  const patients = await Patient.find().select('_id name abhaId');
  let visitsMerged = 0;
  let documentsMerged = 0;

  for (const patient of patients) {
    const visits = await Visit.find({ patient: patient._id, status: 'completed' }).sort({ createdAt: 1 });
    for (const visit of visits) {
      await mergeVisitIntoMedicalHistory(patient._id, visit);
      visitsMerged += 1;
    }

    const documents = await Document.find({
      patient: patient._id,
      ocrStatus: 'completed',
      extracted: { $ne: null },
    }).sort({ createdAt: 1 });
    for (const doc of documents) {
      await mergeDocumentIntoMedicalHistory(patient._id, doc);
      documentsMerged += 1;
    }

    console.log(`${patient.name} (${patient.abhaId}): ${visits.length} visits, ${documents.length} documents`);
  }

  console.log(`\nDone. Merged ${visitsMerged} visits and ${documentsMerged} documents across ${patients.length} patients.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
