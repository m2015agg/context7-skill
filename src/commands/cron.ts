import { Command } from "commander";
import { execSync } from "node:child_process";

export function cronCommand(): Command {
  return new Command("cron")
    .description("Nightly documentation cache refresh via cron")
    .option("--time <HH:MM>", "Schedule time (24h)", "03:00")
    .option("--status", "Show current cron status")
    .option("--remove", "Remove cron entry")
    .action((opts) => {
      const marker = `# context7-skill snapshot (${process.cwd()})`;

      if (opts.status) {
        try {
          const crontab = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
          const lines = crontab.split("\n").filter((l) => l.includes("context7-skill"));
          if (lines.length > 0) {
            console.log("  Active context7-skill cron jobs:");
            for (const l of lines) {
              if (!l.startsWith("#")) console.log(`    ${l}`);
            }
          } else {
            console.log("  No context7-skill cron jobs found.");
          }
        } catch {
          console.log("  No crontab configured.");
        }
        return;
      }

      if (opts.remove) {
        try {
          const crontab = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
          const lines = crontab.split("\n");
          const filtered: string[] = [];
          let skip = false;
          for (const line of lines) {
            if (line.includes(marker) || line.includes(`context7-skill snapshot`) && skip) {
              skip = true;
              continue;
            }
            if (skip && line.includes("context7-skill")) continue;
            skip = false;
            filtered.push(line);
          }
          const newCrontab = filtered.join("\n").replace(/\n{3,}/g, "\n\n");
          execSync(`echo '${newCrontab}' | crontab -`, { encoding: "utf-8" });
          console.log("  ✓ Cron entry removed.");
        } catch {
          console.log("  No crontab to remove.");
        }
        return;
      }

      // Add/update cron entry
      const [hours, minutes] = opts.time.split(":");
      const binPath = process.argv[1];
      const cronCmd = `cd "${process.cwd()}" && "${binPath}" snapshot 2>&1 >> /tmp/context7-skill-cron.log`;
      const cronLine = `${minutes} ${hours} * * * ${cronCmd}`;

      let existingCrontab = "";
      try {
        existingCrontab = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
      } catch { /* empty crontab */ }

      // Remove old entry if exists
      const lines = existingCrontab.split("\n").filter(
        (l) => !l.includes(marker) && !l.includes("context7-skill snapshot"),
      );

      lines.push(marker);
      lines.push(cronLine);

      const newCrontab = lines.filter(Boolean).join("\n") + "\n";
      execSync(`echo '${newCrontab}' | crontab -`, { encoding: "utf-8" });
      console.log(`  ✓ Cron set: ${opts.time} daily → context7-skill snapshot`);
    });
}
