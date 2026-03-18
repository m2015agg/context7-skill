import Database from "better-sqlite3";
import { join } from "node:path";
import { existsSync } from "node:fs";

const DB_FILENAME = "docs.db";

// ─── Schema Creation ───

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  total_snippets INTEGER,
  trust_score INTEGER,
  benchmark_score REAL,
  versions TEXT,
  pinned_version TEXT,
  source_file TEXT,
  dep_name TEXT,
  import_count INTEGER DEFAULT 0,
  last_fetched TEXT
);

CREATE TABLE IF NOT EXISTS snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id TEXT NOT NULL REFERENCES libraries(id),
  title TEXT,
  content TEXT,
  source_url TEXT,
  query TEXT,
  tokens INTEGER,
  fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS query_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id TEXT NOT NULL,
  query TEXT NOT NULL,
  result_json TEXT,
  fetched_at TEXT,
  ttl_hours INTEGER DEFAULT 168,
  UNIQUE(library_id, query)
);

CREATE TABLE IF NOT EXISTS token_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id TEXT,
  query TEXT,
  tokens_served INTEGER,
  was_cache_hit INTEGER,
  timestamp TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  library_name,
  library_id,
  title,
  content,
  query,
  tokenize='porter unicode61'
);

CREATE INDEX IF NOT EXISTS idx_snippets_library ON snippets(library_id);
CREATE INDEX IF NOT EXISTS idx_snippets_query ON snippets(query);
CREATE INDEX IF NOT EXISTS idx_query_cache_lookup ON query_cache(library_id, query);
CREATE INDEX IF NOT EXISTS idx_token_stats_lib ON token_stats(library_id);
`;

// ─── Open / Init ───

export function openDb(cacheDir: string): Database.Database {
  const dbPath = join(cacheDir, DB_FILENAME);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");
  return db;
}

export function hasDb(cacheDir: string): boolean {
  return existsSync(join(cacheDir, DB_FILENAME));
}

export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}

export function clearData(db: Database.Database): void {
  db.exec("DELETE FROM docs_fts");
  db.exec("DELETE FROM snippets");
  db.exec("DELETE FROM query_cache");
  db.exec("DELETE FROM libraries");
}

export function setMetadata(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run(key, value);
}

export function getMetadata(db: Database.Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

// ─── Library Operations ───

export interface LibraryRow {
  id: string;
  name: string;
  description: string | null;
  total_snippets: number;
  trust_score: number;
  benchmark_score: number;
  versions: string | null;
  pinned_version: string | null;
  source_file: string | null;
  dep_name: string | null;
  import_count: number;
  last_fetched: string | null;
}

export function insertLibrary(db: Database.Database, lib: LibraryRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO libraries (id, name, description, total_snippets, trust_score, benchmark_score, versions, pinned_version, source_file, dep_name, import_count, last_fetched)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(lib.id, lib.name, lib.description, lib.total_snippets, lib.trust_score, lib.benchmark_score, lib.versions, lib.pinned_version, lib.source_file, lib.dep_name, lib.import_count, lib.last_fetched);
}

export function getLibrary(db: Database.Database, id: string): LibraryRow | undefined {
  return db.prepare("SELECT * FROM libraries WHERE id = ?").get(id) as LibraryRow | undefined;
}

export function getLibraryByDep(db: Database.Database, depName: string): LibraryRow | undefined {
  return db.prepare("SELECT * FROM libraries WHERE dep_name = ? OR name LIKE ?").get(depName, `%${depName}%`) as LibraryRow | undefined;
}

export function getAllLibraries(db: Database.Database): LibraryRow[] {
  return db.prepare("SELECT * FROM libraries ORDER BY import_count DESC, name").all() as LibraryRow[];
}

export function removeLibrary(db: Database.Database, id: string): void {
  db.exec("BEGIN");
  db.prepare("DELETE FROM snippets WHERE library_id = ?").run(id);
  db.prepare("DELETE FROM query_cache WHERE library_id = ?").run(id);
  db.prepare("DELETE FROM docs_fts WHERE library_id = ?").run(id);
  db.prepare("DELETE FROM libraries WHERE id = ?").run(id);
  db.exec("COMMIT");
}

// ─── Snippet Operations ───

export interface SnippetRow {
  library_id: string;
  title: string | null;
  content: string;
  source_url: string | null;
  query: string;
  tokens: number;
  fetched_at: string;
}

export function insertSnippets(db: Database.Database, snippets: SnippetRow[], libraryName: string): void {
  const insertSnippet = db.prepare(`
    INSERT INTO snippets (library_id, title, content, source_url, query, tokens, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = db.prepare(`
    INSERT INTO docs_fts (library_name, library_id, title, content, query)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const s of snippets) {
      insertSnippet.run(s.library_id, s.title, s.content, s.source_url, s.query, s.tokens, s.fetched_at);
      insertFts.run(libraryName, s.library_id, s.title || "", s.content || "", s.query);
    }
  });
  tx();
}

// ─── Query Cache ───

export interface CacheEntry {
  library_id: string;
  query: string;
  result_json: string;
  fetched_at: string;
  ttl_hours: number;
}

export function getCachedQuery(db: Database.Database, libraryId: string, query: string): CacheEntry | undefined {
  return db.prepare(`
    SELECT * FROM query_cache
    WHERE library_id = ? AND query = ?
  `).get(libraryId, query) as CacheEntry | undefined;
}

export function isCacheFresh(entry: CacheEntry): boolean {
  const fetchedAt = new Date(entry.fetched_at).getTime();
  const ttlMs = entry.ttl_hours * 60 * 60 * 1000;
  return Date.now() - fetchedAt < ttlMs;
}

export function upsertQueryCache(db: Database.Database, entry: CacheEntry): void {
  db.prepare(`
    INSERT OR REPLACE INTO query_cache (library_id, query, result_json, fetched_at, ttl_hours)
    VALUES (?, ?, ?, ?, ?)
  `).run(entry.library_id, entry.query, entry.result_json, entry.fetched_at, entry.ttl_hours);
}

// ─── FTS Search ───

export interface FtsResult {
  library_name: string;
  library_id: string;
  title: string;
  content: string;
  query: string;
  rank: number;
}

export function searchFTS(db: Database.Database, query: string): FtsResult[] {
  const safeQuery = query.replace(/['"]/g, "").trim();
  if (!safeQuery) return [];

  try {
    return db.prepare(`
      SELECT library_name, library_id, title, content, query, rank
      FROM docs_fts
      WHERE docs_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `).all(`"${safeQuery}"*`) as FtsResult[];
  } catch {
    return db.prepare(`
      SELECT library_name, library_id, title, content, query, 0 as rank
      FROM docs_fts
      WHERE content LIKE ? OR title LIKE ? OR library_name LIKE ?
      ORDER BY library_name, title
      LIMIT 50
    `).all(`%${safeQuery}%`, `%${safeQuery}%`, `%${safeQuery}%`) as FtsResult[];
  }
}

// ─── Token Stats ───

export function recordTokenStat(db: Database.Database, libraryId: string, query: string, tokens: number, cacheHit: boolean): void {
  db.prepare(`
    INSERT INTO token_stats (library_id, query, tokens_served, was_cache_hit, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(libraryId, query, tokens, cacheHit ? 1 : 0, new Date().toISOString());
}

export interface TokenStatsReport {
  totalTokensServed: number;
  cacheHits: number;
  apiCalls: number;
  hitRate: number;
  estimatedSavings: string;
}

export function getTokenStats(db: Database.Database): TokenStatsReport {
  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(tokens_served), 0) as total,
      COALESCE(SUM(CASE WHEN was_cache_hit = 1 THEN tokens_served ELSE 0 END), 0) as cached_tokens,
      COALESCE(SUM(CASE WHEN was_cache_hit = 1 THEN 1 ELSE 0 END), 0) as hits,
      COALESCE(SUM(CASE WHEN was_cache_hit = 0 THEN 1 ELSE 0 END), 0) as misses
    FROM token_stats
  `).get() as { total: number; cached_tokens: number; hits: number; misses: number };

  const totalCalls = stats.hits + stats.misses;
  const hitRate = totalCalls > 0 ? stats.hits / totalCalls : 0;
  // Rough estimate: $3/M input tokens for Claude
  const savedDollars = (stats.cached_tokens / 1_000_000) * 3;

  return {
    totalTokensServed: stats.total,
    cacheHits: stats.hits,
    apiCalls: stats.misses,
    hitRate,
    estimatedSavings: `$${savedDollars.toFixed(4)}`,
  };
}
