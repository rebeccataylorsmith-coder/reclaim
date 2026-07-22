import { Database } from "bun:sqlite";
import { initSchema } from "./schema";

const DB_PATH = "data/reclaim.db";

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA foreign_keys=ON;");

  _db = db;
  initSchema(db);
  return db;
}
