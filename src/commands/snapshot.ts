import { Command } from "commander";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { detectDeps, countImports } from "../util/deps.js";
import { searchLibrary, fetchDocs, isApiReachable } from "../util/api.js";
import { openDb, initSchema, clearData, insertLibrary, insertSnippets, setMetadata, type LibraryRow, type SnippetRow } from "../util/db.js";
import { openGlobalDb, getGlobalLibrary, setGlobalLibrary } from "../util/global-db.js";
import { readConfig } from "../util/config.js";

const CACHE_DIR = ".context7-cache";
const DEFAULT_QUERIES = ["getting started", "API reference", "configuration"];

export function snapshotCommand(): Command {
  return new Command("snapshot")
    .description("Detect project dependencies and cache their documentation")
    .option("--output <dir>", "Cache directory", CACHE_DIR)
    .action(async (opts) => {
      const projectDir = process.cwd();
      const cacheDir = join(projectDir, opts.output);

      // Step 1: Detect deps
      process.stdout.write("  Detecting dependencies... ");
      const deps = detectDeps(projectDir);
      if (deps.length === 0) {
        console.log("none found");
        return;
      }
      // Group by source file
      const byFile = new Map<string, number>();
      for (const d of deps) {
        byFile.set(d.sourceFile, (byFile.get(d.sourceFile) || 0) + 1);
      }
      const fileList = [...byFile.entries()].map(([f, n]) => `${f} (${n})`).join(", ");
      console.log(`${deps.length} deps from ${fileList}`);

      // Step 2: Count imports
      process.stdout.write("  Counting imports... ");
      const importCounts = countImports(projectDir, deps.map(d => d.name));
      const totalImports = [...importCounts.values()].reduce((a, b) => a + b, 0);
      console.log(`${totalImports} import references found`);

      // Step 3: Check API
      process.stdout.write("  Checking Context7 API... ");
      if (!isApiReachable()) {
        console.log("⚠ unreachable (using existing cache if available)");
        return;
      }
      console.log("✓ online");

      // Step 4: Resolve library IDs
      console.log("  Resolving libraries on Context7...");
      const globalDb = openGlobalDb();
      const resolved: Array<{ dep: typeof deps[0]; lib: { id: string; title: string; description: string; totalSnippets: number; trustScore: number; benchmarkScore: number; versions: string[] } }> = [];
      let skipped = 0;

      for (const dep of deps) {
        // Check global cache first
        const cached = getGlobalLibrary(globalDb, dep.name);
        if (cached) {
          resolved.push({
            dep,
            lib: {
              id: cached.library_id,
              title: cached.library_name,
              description: cached.description,
              totalSnippets: 0,
              trustScore: 0,
              benchmarkScore: cached.benchmark_score,
              versions: [],
            },
          });
          continue;
        }

        // Search Context7
        const results = searchLibrary(dep.name);
        if (results.length > 0 && results[0].benchmarkScore >= 10) {
          const best = results[0];
          resolved.push({ dep, lib: best });
          // Save to global cache
          setGlobalLibrary(globalDb, {
            dep_name: dep.name,
            library_id: best.id,
            library_name: best.title,
            description: best.description,
            benchmark_score: best.benchmarkScore,
            resolved_at: new Date().toISOString(),
          });
        } else {
          skipped++;
        }
        // Rate limit: small delay between requests
        await new Promise((r) => setTimeout(r, 200));
      }
      globalDb.close();

      console.log(`    Resolved ${resolved.length}/${deps.length} (skipped ${skipped})`);
      for (const r of resolved.slice(0, 10)) {
        const importCount = importCounts.get(r.dep.name) || 0;
        console.log(`      ${r.dep.name} → ${r.lib.id} (score: ${r.lib.benchmarkScore}, imports: ${importCount})`);
      }
      if (resolved.length > 10) {
        console.log(`      ... and ${resolved.length - 10} more`);
      }

      // Step 5: Create cache directory and DB
      if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
      const db = openDb(cacheDir);
      initSchema(db);
      clearData(db);

      // Step 6: Cache docs
      let totalSnippets = 0;
      const total = resolved.length;
      let current = 0;

      for (const r of resolved) {
        current++;
        const importCount = importCounts.get(r.dep.name) || 0;
        // Import-weighted: 10+ imports = 5 queries, 1-9 = 3, 0 = 1
        const queryCont = importCount >= 10 ? 5 : importCount >= 1 ? 3 : 1;
        const queries = DEFAULT_QUERIES.slice(0, queryCont);

        const libRow: LibraryRow = {
          id: r.lib.id,
          name: r.lib.title || r.dep.name,
          description: r.lib.description,
          total_snippets: r.lib.totalSnippets,
          trust_score: r.lib.trustScore,
          benchmark_score: r.lib.benchmarkScore,
          versions: JSON.stringify(r.lib.versions),
          pinned_version: r.dep.version,
          source_file: r.dep.sourceFile,
          dep_name: r.dep.name,
          import_count: importCount,
          last_fetched: new Date().toISOString(),
        };
        insertLibrary(db, libRow);

        for (const query of queries) {
          process.stdout.write(`\r  Caching docs... [${current}/${total}] ${r.dep.name}: "${query}"          `);
          const docs = fetchDocs(r.lib.id, query);
          const now = new Date().toISOString();

          const snippets: SnippetRow[] = [];
          for (const cs of docs.codeSnippets) {
            const code = cs.codeList.map((c) => `\`\`\`${c.language}\n${c.code}\n\`\`\``).join("\n");
            snippets.push({
              library_id: r.lib.id,
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
              library_id: r.lib.id,
              title: is.breadcrumb || null,
              content: is.content,
              source_url: is.pageId || null,
              query,
              tokens: is.contentTokens,
              fetched_at: now,
            });
          }

          if (snippets.length > 0) {
            insertSnippets(db, snippets, r.lib.title);
            totalSnippets += snippets.length;
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      console.log(`\r  Caching docs... done! ${totalSnippets} snippets cached                    `);

      // Step 7: Write metadata
      setMetadata(db, "snapshot_time", new Date().toISOString());
      setMetadata(db, "project_dir", projectDir);
      setMetadata(db, "library_count", String(resolved.length));
      setMetadata(db, "snippet_count", String(totalSnippets));

      // Step 8: Write index.md
      const indexLines = [`# Context7 Documentation Cache\n`, `Snapshot: ${new Date().toISOString()}\n`, `Libraries: ${resolved.length} | Snippets: ${totalSnippets}\n`, `\n## Cached Libraries\n`];
      for (const r of resolved) {
        const ic = importCounts.get(r.dep.name) || 0;
        indexLines.push(`- **${r.lib.title}** (\`${r.lib.id}\`) — ${ic} imports, score: ${r.lib.benchmarkScore}`);
      }
      writeFileSync(join(cacheDir, "index.md"), indexLines.join("\n") + "\n");

      // Step 9: Write per-library markdown
      const libsDir = join(cacheDir, "libs");
      if (!existsSync(libsDir)) mkdirSync(libsDir, { recursive: true });
      for (const r of resolved) {
        const safeName = r.dep.name.replace(/\//g, "__");
        const libFile = join(libsDir, `${safeName}.md`);
        const lines = [
          `# ${r.lib.title}`,
          ``,
          `- **ID**: \`${r.lib.id}\``,
          `- **Source**: ${r.dep.sourceFile}`,
          `- **Version**: ${r.dep.version || "latest"}`,
          `- **Imports**: ${importCounts.get(r.dep.name) || 0}`,
          `- **Score**: ${r.lib.benchmarkScore}`,
          ``,
        ];
        writeFileSync(libFile, lines.join("\n") + "\n");
      }

      db.close();

      console.log(`\n  ✓ Snapshot complete: ${resolved.length} libraries, ${totalSnippets} snippets`);
      console.log(`    Cache: ${cacheDir}\n`);
    });
}
