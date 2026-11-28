import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', 'backend', '.env') });

/**
 * Exports all MongoDB collections into a timestamped JSON snapshot directory under `db/backups/`.
 * Works locally without requiring external `mongodump` binaries.
 */
export async function runMongoBackup() {
  await connectDB();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(__dirname, 'backups', stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const collections = await mongoose.connection.db.listCollections().toArray();
  const summary = [];

  for (const col of collections) {
    const docs = await mongoose.connection.db.collection(col.name).find({}).toArray();
    fs.writeFileSync(path.join(outDir, `${col.name}.json`), JSON.stringify(docs, null, 2), 'utf8');
    summary.push({ collection: col.name, count: docs.length });
  }

  fs.writeFileSync(
    path.join(outDir, '_manifest.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), database: mongoose.connection.name, collections: summary }, null, 2),
    'utf8'
  );

  return { outDir, collections: summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runMongoBackup()
    .then((res) => {
      console.log(`Backup completed: ${res.outDir} (${res.collections.length} collections)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Backup failed:', err);
      process.exit(1);
    });
}
