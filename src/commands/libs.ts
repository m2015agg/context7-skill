import { Command } from "commander";
import { join } from "node:path";
import { openDb, hasDb, initSchema, getAllLibraries } from "../util/db.js";

const CACHE_DIR = ".context7-cache";

export function libsCommand(): Command {
  return new Command("libs")
    .description("List cached libraries with stats")
    .option("--dir <dir>", "Cache directory", CACHE_DIR)
    .option("--json", "JSON output")
    .action((opts) => {
      const cacheDir = join(process.cwd(), opts.dir);
      if (!hasDb(cacheDir)) {
        console.log("  No cache found. Run: context7-skill init");
        return;
      }

      const db = openDb(cacheDir);
      initSchema(db);
      const libs = getAllLibraries(db);

      if (opts.json) {
        console.log(JSON.stringify(libs, null, 2));
        db.close();
        return;
      }

      if (libs.length === 0) {
        console.log("  No libraries cached.");
        db.close();
        return;
      }

      console.log(`\n  Cached Libraries (${libs.length}):\n`);
      console.log(`  ${"Name".padEnd(30)} ${"ID".padEnd(30)} ${"Imports".padStart(8)} ${"Score".padStart(8)} Last Fetched`);
      console.log("  " + "─".repeat(100));

      for (const lib of libs) {
        const fetched = lib.last_fetched ? timeSince(lib.last_fetched) : "never";
        const version = lib.pinned_version ? `@${lib.pinned_version}` : "";
        const name = `${lib.name}${version}`.slice(0, 30).padEnd(30);
        const id = lib.id.slice(0, 30).padEnd(30);
        const imports = String(lib.import_count).padStart(8);
        const score = lib.benchmark_score.toFixed(1).padStart(8);
        console.log(`  ${name} ${id} ${imports} ${score} ${fetched}`);
      }

      console.log("");
      db.close();
    });
}

function timeSince(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
