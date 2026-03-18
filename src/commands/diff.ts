import { Command } from "commander";
import { join } from "node:path";
import { openDb, hasDb, initSchema, getAllLibraries } from "../util/db.js";
import { detectDeps } from "../util/deps.js";

const CACHE_DIR = ".context7-cache";

export function diffCommand(): Command {
  return new Command("diff")
    .description("Compare project dependencies vs cached libraries")
    .option("--dir <dir>", "Cache directory", CACHE_DIR)
    .option("--json", "JSON output")
    .action((opts) => {
      const projectDir = process.cwd();
      const cacheDir = join(projectDir, opts.dir);

      // Detect current deps
      const deps = detectDeps(projectDir);
      const depNames = new Set(deps.map((d) => d.name));

      // Get cached libs
      let cachedNames = new Set<string>();
      if (hasDb(cacheDir)) {
        const db = openDb(cacheDir);
        initSchema(db);
        const libs = getAllLibraries(db);
        cachedNames = new Set(libs.map((l) => l.dep_name || "").filter(Boolean));
        db.close();
      }

      const newDeps = [...depNames].filter((n) => !cachedNames.has(n));
      const removedDeps = [...cachedNames].filter((n) => !depNames.has(n));
      const unchanged = [...depNames].filter((n) => cachedNames.has(n));

      if (opts.json) {
        console.log(JSON.stringify({ new: newDeps, removed: removedDeps, unchanged, total_deps: depNames.size, total_cached: cachedNames.size }));
        return;
      }

      console.log(`\n  Dependency Diff:\n`);
      console.log(`  Project deps: ${depNames.size}`);
      console.log(`  Cached libs:  ${cachedNames.size}\n`);

      if (newDeps.length > 0) {
        console.log(`  + New (not cached): ${newDeps.length}`);
        for (const n of newDeps) console.log(`    + ${n}`);
        console.log("");
      }

      if (removedDeps.length > 0) {
        console.log(`  - Removed (cached but not in deps): ${removedDeps.length}`);
        for (const n of removedDeps) console.log(`    - ${n}`);
        console.log("");
      }

      if (newDeps.length === 0 && removedDeps.length === 0) {
        console.log("  ✓ Cache is in sync with project dependencies.\n");
      } else {
        console.log("  Run 'context7-skill snapshot' to update cache.\n");
      }
    });
}
