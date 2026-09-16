/**
 * Convenience script: runs a local MongoDB instance with no system install
 * required, for developers who don't have MongoDB Community Server or an
 * Atlas cluster handy. Data persists across restarts under backend/.mongo-data.
 *
 * Not for production use — see README for real deployment options.
 */
const fs = require('fs');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PORT = 27017;
const DB_PATH = path.join(__dirname, '..', '.mongo-data');

async function main() {
  fs.mkdirSync(DB_PATH, { recursive: true });

  const mongod = await MongoMemoryServer.create({
    instance: { port: PORT, dbPath: DB_PATH, dbName: 'sih_patient_dashboard' },
  });

  console.log(`Local MongoDB running at ${mongod.getUri()}`);
  console.log('Press Ctrl+C to stop.');

  const shutdown = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start local MongoDB:', err);
  process.exit(1);
});
