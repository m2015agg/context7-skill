import { Command } from "commander";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { checkCtx7 } from "../util/detect.js";
import { readConfig } from "../util/config.js";
import { hasDb, openDb, initSchema, getMetadata, getAllLibraries } from "../util/db.js";

const CACHE_DIR = ".context7-cache";

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Health check: verify setup, cache, permissions")
    .action(() => {
      let pass = 0;
      let warn = 0;
      let fail = 0;

      function ok(msg: string) { console.log(`  ✓ ${msg}`); pass++; }
      function warning(msg: string) { console.log(`  ⚠ ${msg}`); warn++; }
      function error(msg: string) { console.log(`  ✗ ${msg}`); fail++; }

      console.log("\n  context7-skill doctor\n");

      // 1. ctx7 CLI
      const ctx7 = checkCtx7();
      if (ctx7.installed) {
        ok(`ctx7 CLI: ${ctx7.version}`);
      } else {
        warning("ctx7 CLI not installed (optional: npm install -g ctx7)");
      }

      // 2. Config
      const config = readConfig();
      if (config) {
        ok("Global config: ~/.config/context7-skill/config.json");
      } else {
        error("No config found. Run: context7-skill install");
      }

      // 3. API key
      const apiKey = config?.apiKey || process.env.CONTEXT7_API_KEY;
      if (apiKey) {
        ok("API key configured");
      } else {
        warning("No API key (using free tier — rate limited)");
      }

      // 4. CLAUDE.md
      const claudeMdPaths = [
        join(process.cwd(), "CLAUDE.md"),
        join(process.cwd(), ".claude", "CLAUDE.md"),
        join(homedir(), ".claude", "CLAUDE.md"),
      ];
      const hasClaude = claudeMdPaths.some((p) => {
        if (!existsSync(p)) return false;
        return readFileSync(p, "utf-8").includes("context7-skill");
      });
      if (hasClaude) {
        ok("CLAUDE.md has context7-skill section");
      } else {
        error("CLAUDE.md missing context7-skill section. Run: context7-skill init");
      }

      // 5. Cache exists
      const cacheDir = join(process.cwd(), CACHE_DIR);
      if (hasDb(cacheDir)) {
        ok(`Cache directory: ${CACHE_DIR}/`);
        const db = openDb(cacheDir);
        initSchema(db);

        // 6. Cache age
        const snapshotTime = getMetadata(db, "snapshot_time");
        if (snapshotTime) {
          const age = Date.now() - new Date(snapshotTime).getTime();
          const days = Math.floor(age / (1000 * 60 * 60 * 24));
          if (days <= 7) {
            ok(`Snapshot age: ${days}d (fresh)`);
          } else {
            warning(`Snapshot age: ${days}d (stale — run: context7-skill snapshot)`);
          }
        } else {
          warning("No snapshot timestamp found");
        }

        // 7. Library count
        const libs = getAllLibraries(db);
        const snippetCount = db.prepare("SELECT COUNT(*) as count FROM snippets").get() as { count: number };
        if (libs.length > 0) {
          ok(`Libraries: ${libs.length}, Snippets: ${snippetCount.count}`);
        } else {
          warning("No libraries cached");
        }
        db.close();
      } else {
        error("No cache found. Run: context7-skill init");
      }

      // 8. Permissions
      const settingsPath = join(process.cwd(), ".claude", "settings.json");
      if (existsSync(settingsPath)) {
        const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
        const allow = (settings?.permissions?.allow || []) as string[];
        const hasContext7 = allow.some((c) => c.includes("context7-skill"));
        if (hasContext7) {
          ok("Permissions approved in .claude/settings.json");
        } else {
          warning("Permissions not approved. Run: context7-skill approve");
        }
      } else {
        warning("No .claude/settings.json found");
      }

      // 9. Cron
      try {
        const crontab = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
        if (crontab.includes("context7-skill")) {
          ok("Cron job active");
        } else {
          warning("No cron job. Run: context7-skill cron");
        }
      } catch {
        warning("No crontab configured");
      }

      // 10. .gitignore
      const gitignorePath = join(process.cwd(), ".gitignore");
      if (existsSync(gitignorePath)) {
        const gi = readFileSync(gitignorePath, "utf-8");
        if (gi.includes(".context7-cache")) {
          ok(".gitignore includes .context7-cache/");
        } else {
          warning(".gitignore missing .context7-cache/ entry");
        }
      }

      // Summary
      console.log(`\n  Summary: ${pass} pass, ${warn} warn, ${fail} fail\n`);
      if (fail > 0) {
        process.exit(1);
      }
    });
}
