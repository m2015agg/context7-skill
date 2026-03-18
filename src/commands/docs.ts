import { Command } from "commander";
import { join } from "node:path";
import {
  openDb, hasDb, initSchema,
  getLibrary, getLibraryByDep, insertLibrary, insertSnippets,
  getCachedQuery, isCacheFresh, upsertQueryCache,
  recordTokenStat,
  type SnippetRow, type LibraryRow,
} from "../util/db.js";
import { searchLibrary, fetchDocs, isApiReachable } from "../util/api.js";
import { openGlobalDb, getGlobalLibrary, setGlobalLibrary } from "../util/global-db.js";
import { readConfig } from "../util/config.js";

const CACHE_DIR = ".context7-cache";

export function docsCommand(): Command {
  return new Command("docs")
    .description("Get documentation for a library (cache-first, API fallback)")
    .argument("<library>", "Library name or Context7 ID (e.g., 'fastapi' or '/fastapi/fastapi')")
    .argument("<query>", "What you need help with")
    .option("--dir <dir>", "Cache directory", CACHE_DIR)
    .option("--json", "JSON output")
    .option("--no-cache", "Force fresh fetch from API")
    .option("--tokens <n>", "Max tokens to return")
    .action((library, query, opts) => {
      const cacheDir = join(process.cwd(), opts.dir);
      const db = hasDb(cacheDir) ? openDb(cacheDir) : null;
      if (db) initSchema(db);

      // Resolve library ID
      let libraryId: string;
      let libraryName: string;

      if (library.startsWith("/")) {
        // Already a Context7 ID
        libraryId = library;
        libraryName = library.split("/").pop() || library;
      } else {
        // Try to find in local DB
        const localLib = db ? (getLibraryByDep(db, library) || getLibrary(db, library)) : null;
        if (localLib) {
          libraryId = localLib.id;
          libraryName = localLib.name;
        } else {
          // Try global cache
          const globalDb = openGlobalDb();
          const globalLib = getGlobalLibrary(globalDb, library);
          globalDb.close();
          if (globalLib) {
            libraryId = globalLib.library_id;
            libraryName = globalLib.library_name;
          } else {
            // Resolve via API
            const results = searchLibrary(library);
            if (results.length === 0) {
              const msg = `No library found for "${library}". Try a different name.`;
              if (opts.json) {
                console.log(JSON.stringify({ error: msg }));
              } else {
                console.log(`  ${msg}`);
              }
              db?.close();
              return;
            }
            libraryId = results[0].id;
            libraryName = results[0].title;
          }
        }
      }

      // Check cache (unless --no-cache)
      if (opts.cache !== false && db) {
        const cached = getCachedQuery(db, libraryId, query);
        if (cached && isCacheFresh(cached)) {
          const result = JSON.parse(cached.result_json);
          const tokenCount = cached.result_json.length;
          recordTokenStat(db, libraryId, query, tokenCount, true);

          if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            printDocs(libraryName, result);
          }
          db.close();
          return;
        }
      }

      // Fetch from API
      if (!isApiReachable()) {
        // Offline: try to find ANY cached content for this library
        if (db) {
          const snippets = db.prepare(
            "SELECT title, content FROM snippets WHERE library_id = ? LIMIT 20"
          ).all(libraryId) as Array<{ title: string; content: string }>;
          if (snippets.length > 0) {
            if (opts.json) {
              console.log(JSON.stringify({ source: "offline-cache", snippets }));
            } else {
              console.log(`  [OFFLINE] Serving cached docs for ${libraryName}:\n`);
              for (const s of snippets) {
                console.log(`  ## ${s.title || "(untitled)"}`);
                console.log(`  ${s.content.slice(0, 500)}\n`);
              }
            }
            db.close();
            return;
          }
        }
        const msg = "API unreachable and no cached docs available.";
        if (opts.json) {
          console.log(JSON.stringify({ error: msg }));
        } else {
          console.log(`  ${msg}`);
        }
        db?.close();
        return;
      }

      const tokens = opts.tokens ? parseInt(opts.tokens, 10) : undefined;
      const docs = fetchDocs(libraryId, query, tokens);
      const now = new Date().toISOString();

      // Cache the result
      if (db) {
        const config = readConfig();
        upsertQueryCache(db, {
          library_id: libraryId,
          query,
          result_json: JSON.stringify(docs),
          fetched_at: now,
          ttl_hours: config?.cacheTtlHours || 168,
        });

        // Also store individual snippets for FTS
        const snippetRows: SnippetRow[] = [];
        for (const cs of docs.codeSnippets) {
          const code = cs.codeList.map((c) => `\`\`\`${c.language}\n${c.code}\n\`\`\``).join("\n");
          snippetRows.push({
            library_id: libraryId,
            title: cs.codeTitle,
            content: `${cs.codeDescription}\n\n${code}`,
            source_url: cs.codeId,
            query,
            tokens: cs.codeTokens,
            fetched_at: now,
          });
        }
        for (const is of docs.infoSnippets) {
          snippetRows.push({
            library_id: libraryId,
            title: is.breadcrumb || null,
            content: is.content,
            source_url: is.pageId || null,
            query,
            tokens: is.contentTokens,
            fetched_at: now,
          });
        }
        if (snippetRows.length > 0) {
          insertSnippets(db, snippetRows, libraryName);
        }

        // Ensure library exists in DB
        if (!getLibrary(db, libraryId)) {
          insertLibrary(db, {
            id: libraryId,
            name: libraryName,
            description: null,
            total_snippets: snippetRows.length,
            trust_score: 0,
            benchmark_score: 0,
            versions: null,
            pinned_version: null,
            source_file: "manual",
            dep_name: library,
            import_count: 0,
            last_fetched: now,
          });
        }

        const tokenCount = JSON.stringify(docs).length;
        recordTokenStat(db, libraryId, query, tokenCount, false);
      }

      if (opts.json) {
        console.log(JSON.stringify(docs, null, 2));
      } else {
        printDocs(libraryName, docs);
      }

      db?.close();
    });
}

function printDocs(libraryName: string, docs: { codeSnippets: Array<{ codeTitle: string; codeDescription: string; codeList: Array<{ language: string; code: string }> }>; infoSnippets: Array<{ breadcrumb?: string; content: string }> }) {
  console.log(`\n  Documentation for ${libraryName}:\n`);

  if (docs.infoSnippets.length > 0) {
    for (const is of docs.infoSnippets) {
      if (is.breadcrumb) console.log(`  --- ${is.breadcrumb} ---`);
      console.log(`  ${is.content}\n`);
    }
  }

  if (docs.codeSnippets.length > 0) {
    console.log("  Code Examples:\n");
    for (const cs of docs.codeSnippets) {
      console.log(`  ## ${cs.codeTitle}`);
      console.log(`  ${cs.codeDescription}`);
      for (const c of cs.codeList) {
        console.log(`  \`\`\`${c.language}`);
        console.log(`  ${c.code}`);
        console.log("  ```\n");
      }
    }
  }

  if (docs.codeSnippets.length === 0 && docs.infoSnippets.length === 0) {
    console.log("  No documentation found for this query.\n");
  }
}
