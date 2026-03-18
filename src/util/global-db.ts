import Database from "better-sqlite3";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

const GLOBAL_DB = "global-cache.db";

const GLOBAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS global_libraries (
  dep_name TEXT PRIMARY KEY,
  library_id TEXT,
  library_name TEXT,
  description TEXT,
  benchmark_score REAL,
  resolved_at TEXT
);
`;

function getGlobalDbPath(): string {
  const dir = join(homedir(), ".config", "context7-skill");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, GLOBAL_DB);
}

export function openGlobalDb(): Database.Database {
  const db = new Database(getGlobalDbPath());
  db.pragma("journal_mode = WAL");
  db.exec(GLOBAL_SCHEMA);
  return db;
}

export interface GlobalLibrary {
  dep_name: string;
  library_id: string;
  library_name: string;
  description: string;
  benchmark_score: number;
  resolved_at: string;
}

export function getGlobalLibrary(db: Database.Database, depName: string): GlobalLibrary | undefined {
  return db.prepare("SELECT * FROM global_libraries WHERE dep_name = ?").get(depName) as GlobalLibrary | undefined;
}

export function setGlobalLibrary(db: Database.Database, lib: GlobalLibrary): void {
  db.prepare(`
    INSERT OR REPLACE INTO global_libraries (dep_name, library_id, library_name, description, benchmark_score, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(lib.dep_name, lib.library_id, lib.library_name, lib.description, lib.benchmark_score, lib.resolved_at);
}

export function getAllGlobalLibraries(db: Database.Database): GlobalLibrary[] {
  return db.prepare("SELECT * FROM global_libraries ORDER BY dep_name").all() as GlobalLibrary[];
}
