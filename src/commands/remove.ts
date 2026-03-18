import { Command } from "commander";
import { join } from "node:path";
import { openDb, hasDb, initSchema, getLibrary, getLibraryByDep, removeLibrary } from "../util/db.js";

const CACHE_DIR = ".context7-cache";

export function removeCommand(): Command {
  return new Command("remove")
    .description("Remove a cached library")
    .argument("<library>", "Library name or Context7 ID")
    .option("--dir <dir>", "Cache directory", CACHE_DIR)
    .action((library, opts) => {
      const cacheDir = join(process.cwd(), opts.dir);
      if (!hasDb(cacheDir)) {
        console.log("  No cache found.");
        return;
      }

      const db = openDb(cacheDir);
      initSchema(db);

      const lib = library.startsWith("/")
        ? getLibrary(db, library)
        : (getLibraryByDep(db, library) || getLibrary(db, library));

      if (!lib) {
        console.log(`  Library "${library}" not found in cache.`);
        db.close();
        return;
      }

      removeLibrary(db, lib.id);
      console.log(`  ✓ Removed ${lib.name} (${lib.id})`);
      db.close();
    });
}
