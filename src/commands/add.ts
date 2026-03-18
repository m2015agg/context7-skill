import { Command } from "commander";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { openDb, hasDb, initSchema, insertLibrary, insertSnippets, getLibrary, type LibraryRow, type SnippetRow } from "../util/db.js";
import { searchLibrary, fetchDocs } from "../util/api.js";
import { openGlobalDb, setGlobalLibrary } from "../util/global-db.js";

const CACHE_DIR = ".context7-cache";

export function addCommand(): Command {
  return new Command("add")
    .description("Manually add and cache a library")
    .argument("<library>", "Library name (e.g., 'langchain', 'express')")
    .option("--dir <dir>", "Cache directory", CACHE_DIR)
    .action(async (library, opts) => {
      const cacheDir = join(process.cwd(), opts.dir);
      if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

      const db = openDb(cacheDir);
      initSchema(db);

      // Check if already cached
      const existing = getLibrary(db, library);
      if (existing) {
        console.log(`  ${library} is already cached as ${existing.name} (${existing.id})`);
        db.close();
        return;
      }

      // Resolve
      process.stdout.write(`  Resolving ${library}... `);
      const results = searchLibrary(library);
      if (results.length === 0) {
        console.log("not found on Context7");
        db.close();
        return;
      }

      const best = results[0];
      console.log(`${best.title} (${best.id}, score: ${best.benchmarkScore})`);

      // Save to global cache
      const globalDb = openGlobalDb();
      setGlobalLibrary(globalDb, {
        dep_name: library,
        library_id: best.id,
        library_name: best.title,
        description: best.description,
        benchmark_score: best.benchmarkScore,
        resolved_at: new Date().toISOString(),
      });
      globalDb.close();

      // Insert library
      const now = new Date().toISOString();
      insertLibrary(db, {
        id: best.id,
        name: best.title,
        description: best.description,
        total_snippets: best.totalSnippets,
        trust_score: best.trustScore,
        benchmark_score: best.benchmarkScore,
        versions: JSON.stringify(best.versions),
        pinned_version: null,
        source_file: "manual",
        dep_name: library,
        import_count: 0,
        last_fetched: now,
      });

      // Cache docs
      const queries = ["getting started", "API reference", "configuration"];
      let totalSnippets = 0;
      for (const query of queries) {
        process.stdout.write(`  Caching "${query}"... `);
        const docs = fetchDocs(best.id, query);
        const snippets: SnippetRow[] = [];
        for (const cs of docs.codeSnippets) {
          const code = cs.codeList.map((c) => `\`\`\`${c.language}\n${c.code}\n\`\`\``).join("\n");
          snippets.push({ library_id: best.id, title: cs.codeTitle, content: `${cs.codeDescription}\n\n${code}`, source_url: cs.codeId, query, tokens: cs.codeTokens, fetched_at: now });
        }
        for (const is of docs.infoSnippets) {
          snippets.push({ library_id: best.id, title: is.breadcrumb || null, content: is.content, source_url: is.pageId || null, query, tokens: is.contentTokens, fetched_at: now });
        }
        if (snippets.length > 0) {
          insertSnippets(db, snippets, best.title);
          totalSnippets += snippets.length;
        }
        console.log(`${snippets.length} snippets`);
        await new Promise((r) => setTimeout(r, 200));
      }

      db.close();
      console.log(`\n  ✓ Added ${best.title}: ${totalSnippets} snippets cached\n`);
    });
}
