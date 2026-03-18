import { Command } from "commander";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

const APPROVED_COMMANDS = [
  "Bash(context7-skill search:*)",
  "Bash(context7-skill docs:*)",
  "Bash(context7-skill libs:*)",
  "Bash(context7-skill add:*)",
  "Bash(context7-skill remove:*)",
  "Bash(context7-skill diff:*)",
  "Bash(context7-skill cache list:*)",
  "Bash(context7-skill cache stats:*)",
  "Bash(context7-skill doctor:*)",
  "Bash(context7-skill snapshot:*)",
  "Bash(ctx7 library:*)",
  "Bash(ctx7 docs:*)",
];

export function approveCommand(): Command {
  return new Command("approve")
    .description("Pre-approve read-only commands in Claude Code settings")
    .option("--global", "Apply globally instead of per-project")
    .option("--remove", "Remove pre-approved commands")
    .action((opts) => {
      const settingsPath = opts.global
        ? join(homedir(), ".claude", "settings.json")
        : join(process.cwd(), ".claude", "settings.json");

      const dir = join(settingsPath, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        try {
          settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
        } catch { /* start fresh */ }
      }

      if (!settings.permissions) settings.permissions = {};
      const perms = settings.permissions as Record<string, unknown>;
      if (!Array.isArray(perms.allow)) perms.allow = [];
      const allow = perms.allow as string[];

      if (opts.remove) {
        const before = allow.length;
        perms.allow = allow.filter((cmd) => !APPROVED_COMMANDS.includes(cmd));
        const removed = before - (perms.allow as string[]).length;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
        console.log(`  ✓ Removed ${removed} context7-skill permissions`);
        return;
      }

      let added = 0;
      for (const cmd of APPROVED_COMMANDS) {
        if (!allow.includes(cmd)) {
          allow.push(cmd);
          added++;
        }
      }

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
      if (added > 0) {
        console.log(`  ✓ ${added} commands pre-approved in ${settingsPath}`);
      } else {
        console.log(`  All commands already approved`);
      }
    });
}
