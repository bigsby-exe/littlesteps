import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
const source = process.env.DATABASE_PATH || "./data/laura.sqlite";
const target = process.argv[2];
if (!target) throw new Error("Usage: npm run backup -- /path/to/backup.sqlite");
if (resolve(source) === resolve(target))
  throw new Error("Choose a separate backup file.");
mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, target);
  console.log(`Backup saved to ${target}`);
} finally {
  db.close();
}
