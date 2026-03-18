import { Command } from "commander";
import { join } from "node:path";
import { openDb, hasDb, initSchema, searchFTS, recordTokenStat, insertSnippets, type SnippetRow } from "../util/db.js";
import { searchLibrary, fetchDocs, isApiReachable } from "../util/api.js";

const CACHE_DIR = ".context7-cache";

export function searchCommand(): Command {
  return new Command("search")
    .description("Search cached documentation (FTS5, API fallback)")
    .argument("<query>", "Search query")
    .option("--dir <dir>", "Cache directory", CACHE_DIR)
    .option("--json", "JSON output")
    .option("--limit <n>", "Max results", "20")
    .action((query, opts) => {
      const cacheDir = join(process.cwd(), opts.dir);
      const limit = parseInt(opts.limit, 10);

      if (!hasDb(cacheDir)) {
        if (opts.json) {
          console.log(JSON.stringify({ error: "No cache found. Run: context7-skill init" }));
        } else {
          console.log("  No cache found. Run: context7-skill init");
        }
        return;
      }

      const db = openDb(cacheDir);
      initSchema(db);

      // Search local cache
      let results = searchFTS(db, query).slice(0, limit);

      // If no local results, try API fallback
      if (results.length === 0 && isApiReachable()) {
        const libs = searchLibrary(query);
        if (libs.length > 0) {
          const best = libs[0];
          const docs = fetchDocs(best.id, query);
          const now = new Date().toISOString();
          const snippets: SnippetRow[] = [];
          for (const cs of docs.codeSnippets) {
            const code = cs.codeList.map((c) => `\`\`\`${c.language}\n${c.code}\n\`\`\``).join("\n");
            snippets.push({
              library_id: best.id,
              title: cs.codeTitle,
              content: `${cs.codeDescription}\n\n${code}`,
              source_url: cs.codeId,
              query,
              tokens: cs.codeTokens,
              fetched_at: now,
            });
          }
          for (const is of docs.infoSnippets) {
            snippets.push({
              library_id: best.id,
              title: is.breadcrumb || null,
              content: is.content,
              source_url: is.pageId || null,
              query,
              tokens: is.contentTokens,
              fetched_at: now,
            });
          }
          if (snippets.length > 0) {
            insertSnippets(db, snippets, best.title);
          }
          results = searchFTS(db, query).slice(0, limit);
        }
      }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        if (results.length === 0) {
          console.log("  No results found.");
        } else {
          console.log(`\n  Found ${results.length} results for "${query}":\n`);
          for (const r of results) {
            const title = r.title || "(untitled)";
            const contentPreview = (r.content || "").slice(0, 200).replace(/\n/g, " ");
            console.log(`  [${r.library_name}] ${title}`);
            console.log(`    ${contentPreview}...`);
            console.log("");
          }
        }
      }

      // Record stats
      const totalTokens = results.reduce((sum, r) => sum + (r.content?.length || 0), 0);
      recordTokenStat(db, "search", query, totalTokens, results.length > 0);

      db.close();
    });
}
