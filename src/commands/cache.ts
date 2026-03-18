import { Command } from "commander";
import { join } from "node:path";
import { existsSync, rmSync, statSync } from "node:fs";
import { openDb, hasDb, initSchema, getAllLibraries, getMetadata } from "../util/db.js";
import { getTokenStatsReport } from "../util/tokens.js";
import { formatTokenStats } from "../util/tokens.js";

const CACHE_DIR = ".context7-cache";

export function cacheCommand(): Command {
  const cmd = new Command("cache")
    .description("Cache management: list, stats, clear");

  cmd.addCommand(
    new Command("list")
      .description("List cached queries")
      .option("--dir <dir>", "Cache directory", CACHE_DIR)
      .action((opts) => {
        const cacheDir = join(process.cwd(), opts.dir);
        if (!hasDb(cacheDir)) {
          console.log("  No cache found.");
          return;
        }
        const db = openDb(cacheDir);
        initSchema(db);
        const entries = db.prepare(`
          SELECT library_id, query, fetched_at, ttl_hours
          FROM query_cache
          ORDER BY fetched_at DESC
        `).all() as Array<{ library_id: string; query: string; fetched_at: string; ttl_hours: number }>;

        if (entries.length === 0) {
          console.log("  No cached queries.");
          db.close();
          return;
        }

        console.log(`\n  Cached Queries (${entries.length}):\n`);
        for (const e of entries) {
          const age = timeSince(e.fetched_at);
          console.log(`  ${e.library_id} — "${e.query}" (${age})`);
        }
        console.log("");
        db.close();
      }),
  );

  cmd.addCommand(
    new Command("stats")
      .description("Cache statistics and token savings")
      .option("--dir <dir>", "Cache directory", CACHE_DIR)
      .option("--json", "JSON output")
      .action((opts) => {
        const cacheDir = join(process.cwd(), opts.dir);
        if (!hasDb(cacheDir)) {
          console.log("  No cache found.");
          return;
        }
        const db = openDb(cacheDir);
        initSchema(db);

        const libs = getAllLibraries(db);
        const snapshotTime = getMetadata(db, "snapshot_time");
        const snippetCount = db.prepare("SELECT COUNT(*) as count FROM snippets").get() as { count: number };
        const queryCount = db.prepare("SELECT COUNT(*) as count FROM query_cache").get() as { count: number };
        const tokenReport = getTokenStatsReport(db);

        // Get DB file size
        let dbSize = "unknown";
        try {
          const dbPath = join(cacheDir, "docs.db");
          const stat = statSync(dbPath);
          dbSize = `${(stat.size / 1024).toFixed(0)} KB`;
        } catch { /* */ }

        if (opts.json) {
          console.log(JSON.stringify({
            libraries: libs.length,
            snippets: snippetCount.count,
            queries: queryCount.count,
            dbSize,
            snapshotTime,
            tokenStats: tokenReport,
          }, null, 2));
          db.close();
          return;
        }

        console.log(`\n  Cache Statistics:\n`);
        console.log(`  Libraries:    ${libs.length}`);
        console.log(`  Snippets:     ${snippetCount.count}`);
        console.log(`  Queries:      ${queryCount.count}`);
        console.log(`  DB size:      ${dbSize}`);
        console.log(`  Last snapshot: ${snapshotTime || "never"}`);
        console.log("");
        console.log(formatTokenStats(tokenReport));
        console.log("");
        db.close();
      }),
  );

  cmd.addCommand(
    new Command("clear")
      .description("Wipe local documentation cache")
      .option("--dir <dir>", "Cache directory", CACHE_DIR)
      .action((opts) => {
        const cacheDir = join(process.cwd(), opts.dir);
        if (!existsSync(cacheDir)) {
          console.log("  No cache to clear.");
          return;
        }
        rmSync(cacheDir, { recursive: true, force: true });
        console.log("  ✓ Cache cleared.");
      }),
  );

  return cmd;
}

function timeSince(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
