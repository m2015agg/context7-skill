import { Command } from "commander";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { readConfig, writeConfig, getDefaultConfig } from "../util/config.js";
import { upsertSection } from "../util/claude-md.js";
import { getSkillDoc } from "./skill-doc.js";
import { checkCtx7, testApiAccess, validateApiKey } from "../util/detect.js";

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export function installCommand(): Command {
  return new Command("install")
    .description("Global setup wizard: ctx7 CLI, API key, config, CLAUDE.md")
    .option("--skip-shell", "Don't modify shell profile")
    .option("--ci", "Non-interactive mode")
    .option("--init", "Auto-run init in current directory after install")
    .action(async (opts) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      console.log("\n  ┌──────────────────────────────────┐");
      console.log("  │   context7-skill install wizard  │");
      console.log("  └──────────────────────────────────┘\n");

      // Step 1: Check ctx7 CLI
      process.stdout.write("  Step 1: Checking ctx7 CLI... ");
      const ctx7 = checkCtx7();
      if (ctx7.installed) {
        console.log(`✓ ${ctx7.version}`);
      } else {
        console.log("not found");
        if (!opts.ci) {
          const answer = await ask(rl, "  Install ctx7 globally? [Y/n] ");
          if (!answer || answer.toLowerCase() === "y") {
            try {
              execSync("npm install -g ctx7 2>&1", { stdio: "inherit" });
              console.log("  ✓ ctx7 installed");
            } catch {
              console.log("  ⚠ Failed to install ctx7. You can install it later with: npm install -g ctx7");
            }
          }
        } else {
          console.log("  ⚠ ctx7 not found. Install with: npm install -g ctx7");
        }
      }

      // Step 2: API Key
      console.log("");
      process.stdout.write("  Step 2: API Key... ");
      let config = readConfig() || getDefaultConfig();

      if (config.apiKey) {
        console.log("✓ already configured");
      } else {
        // Check env var
        const envKey = process.env.CONTEXT7_API_KEY;
        if (envKey) {
          console.log("✓ found in CONTEXT7_API_KEY env var");
          config.apiKey = envKey;
        } else {
          console.log("");
          if (!opts.ci) {
            console.log("  Context7 offers a free tier (rate-limited) and paid tier.");
            console.log("  Get an API key at: https://context7.com/dashboard\n");
            const key = await ask(rl, "  Enter API key (or press Enter for free tier): ");
            if (key.trim()) {
              process.stdout.write("  Validating... ");
              if (validateApiKey(key.trim())) {
                console.log("✓ valid");
                config.apiKey = key.trim();
                config.freeTier = false;
              } else {
                console.log("✗ invalid key, using free tier");
              }
            } else {
              // Test free tier access
              process.stdout.write("  Testing API access... ");
              if (testApiAccess()) {
                console.log("✓ free tier works");
              } else {
                console.log("⚠ API unreachable (may need key or check network)");
              }
            }
          }
        }
      }

      // Step 3: Write config
      console.log("");
      process.stdout.write("  Step 3: Writing config... ");
      writeConfig(config);
      console.log("✓ ~/.config/context7-skill/config.json");

      // Step 4: Update CLAUDE.md
      console.log("");
      process.stdout.write("  Step 4: Updating CLAUDE.md... ");
      const claudeMdPath = join(homedir(), ".claude", "CLAUDE.md");
      const result = upsertSection(claudeMdPath, getSkillDoc());
      console.log(`✓ ${result}`);

      // Step 5: Shell profile
      if (!opts.skipShell) {
        console.log("");
        process.stdout.write("  Step 5: Shell profile... ");
        const shell = process.env.SHELL || "/bin/bash";
        const rcFile = shell.includes("zsh") ? join(homedir(), ".zshrc") : join(homedir(), ".bashrc");
        if (existsSync(rcFile)) {
          const rc = readFileSync(rcFile, "utf-8");
          if (!rc.includes("CONTEXT7_API_KEY")) {
            const exportLine = `\n# context7-skill\nexport CONTEXT7_API_KEY="${config.apiKey || ""}"\n`;
            const { writeFileSync } = await import("node:fs");
            writeFileSync(rcFile, rc + exportLine);
            console.log(`✓ ${rcFile}`);
          } else {
            console.log("already present");
          }
        } else {
          console.log("⚠ shell profile not found");
        }
      }

      console.log("\n  ✓ context7-skill install complete\n");

      if (opts.init) {
        console.log("  Running init in current directory...\n");
        try {
          execSync("context7-skill init", { stdio: "inherit" });
        } catch {
          console.log("  ⚠ init failed. Run manually: context7-skill init");
        }
      } else {
        console.log("  Next: cd <project> && context7-skill init\n");
      }

      rl.close();
    });
}
