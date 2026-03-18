import { Command } from "commander";
import { execSync } from "node:child_process";

export function updateCommand(): Command {
  return new Command("update")
    .description("Update context7-skill to latest version")
    .option("--check", "Check for updates without installing")
    .action((opts) => {
      try {
        const current = execSync("npm list -g @m2015agg/context7-skill --json 2>/dev/null", { encoding: "utf-8" });
        const parsed = JSON.parse(current);
        const currentVersion = parsed?.dependencies?.["@m2015agg/context7-skill"]?.version || "unknown";

        const latest = execSync("npm view @m2015agg/context7-skill version 2>/dev/null", { encoding: "utf-8" }).trim();

        if (currentVersion === latest) {
          console.log(`  ✓ Already on latest version: ${currentVersion}`);
          return;
        }

        console.log(`  Current: ${currentVersion}`);
        console.log(`  Latest:  ${latest}`);

        if (opts.check) {
          console.log(`\n  Run 'context7-skill update' to install.`);
          return;
        }

        console.log("\n  Updating...");
        execSync("npm install -g @m2015agg/context7-skill@latest 2>&1", { stdio: "inherit" });
        console.log("\n  ✓ Updated to latest version.");
        console.log("  ⚠ Re-run 'context7-skill init' to update CLAUDE.md and permissions.\n");
      } catch (e) {
        console.log(`  ⚠ Update check failed. Run manually: npm install -g @m2015agg/context7-skill@latest`);
      }
    });
}
