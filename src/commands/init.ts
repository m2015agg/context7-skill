import { Command } from "commander";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { upsertSection } from "../util/claude-md.js";
import { getSkillDoc } from "./skill-doc.js";
import { readConfig } from "../util/config.js";
import { getWalkthroughTemplate } from "../templates/walkthrough.js";

export function initCommand(): Command {
  return new Command("init")
    .description("Per-project setup: detect deps, cache docs, write CLAUDE.md, approve, cron")
    .option("--skip-snapshot", "Skip caching documentation")
    .option("--skip-approve", "Skip permission pre-approval")
    .option("--skip-cron", "Skip cron setup")
    .action(async (opts) => {
      const projectDir = process.cwd();
      console.log("\n  context7-skill init\n");

      // Step 1: Write CLAUDE.md
      process.stdout.write("  Step 1: Writing CLAUDE.md... ");
      const skillDoc = getSkillDoc();
      const rootMd = join(projectDir, "CLAUDE.md");
      const dotMd = join(projectDir, ".claude", "CLAUDE.md");
      const r1 = upsertSection(rootMd, skillDoc);
      const r2 = upsertSection(dotMd, skillDoc);
      console.log(`✓ root=${r1}, .claude=${r2}`);

      // Step 2: Write .env
      process.stdout.write("  Step 2: Writing .env... ");
      const config = readConfig();
      const envPath = join(projectDir, ".env");
      const envSection = `\n# context7-skill\nCONTEXT7_API_KEY=${config?.apiKey || ""}\n`;
      if (existsSync(envPath)) {
        const existing = readFileSync(envPath, "utf-8");
        if (!existing.includes("CONTEXT7_API_KEY")) {
          appendFileSync(envPath, envSection);
          console.log("✓ appended");
        } else {
          console.log("already present");
        }
      } else {
        writeFileSync(envPath, envSection, { mode: 0o600 });
        console.log("✓ created");
      }

      // Update .gitignore
      const gitignorePath = join(projectDir, ".gitignore");
      const ignoreEntries = [".env", ".context7-cache/"];
      if (existsSync(gitignorePath)) {
        let gi = readFileSync(gitignorePath, "utf-8");
        let changed = false;
        for (const entry of ignoreEntries) {
          if (!gi.includes(entry)) {
            gi += `\n${entry}`;
            changed = true;
          }
        }
        if (changed) writeFileSync(gitignorePath, gi);
      } else {
        writeFileSync(gitignorePath, ignoreEntries.join("\n") + "\n");
      }

      // Step 3: Write walkthrough command
      process.stdout.write("  Step 3: Writing /context7 command... ");
      const cmdDir = join(projectDir, ".claude", "commands");
      if (!existsSync(cmdDir)) mkdirSync(cmdDir, { recursive: true });
      const cmdPath = join(cmdDir, "context7.md");
      writeFileSync(cmdPath, getWalkthroughTemplate());
      console.log("✓");

      // Step 4: Snapshot
      if (!opts.skipSnapshot) {
        console.log("  Step 4: Caching documentation...");
        try {
          execSync("context7-skill snapshot", { stdio: "inherit", cwd: projectDir });
        } catch {
          console.log("  ⚠ Snapshot failed. Run manually: context7-skill snapshot");
        }
      } else {
        console.log("  Step 4: Skipped (--skip-snapshot)");
      }

      // Step 5: Approve permissions
      if (!opts.skipApprove) {
        process.stdout.write("  Step 5: Approving permissions... ");
        try {
          execSync("context7-skill approve", { stdio: "pipe", cwd: projectDir });
          console.log("✓");
        } catch {
          console.log("⚠ failed");
        }
      } else {
        console.log("  Step 5: Skipped (--skip-approve)");
      }

      // Step 6: Cron
      if (!opts.skipCron) {
        process.stdout.write("  Step 6: Setting up cron... ");
        try {
          execSync("context7-skill cron", { stdio: "pipe", cwd: projectDir });
          console.log("✓");
        } catch {
          console.log("⚠ failed");
        }
      } else {
        console.log("  Step 6: Skipped (--skip-cron)");
      }

      console.log("\n  ✓ context7-skill init complete");
      console.log("    Claude can now use: context7-skill search, docs, libs\n");
    });
}
