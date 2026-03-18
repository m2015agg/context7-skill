#!/usr/bin/env node
import { Command } from "commander";
import { installCommand } from "./commands/install.js";
import { initCommand } from "./commands/init.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { searchCommand } from "./commands/search.js";
import { docsCommand } from "./commands/docs.js";
import { libsCommand } from "./commands/libs.js";
import { addCommand } from "./commands/add.js";
import { removeCommand } from "./commands/remove.js";
import { diffCommand } from "./commands/diff.js";
import { cacheCommand } from "./commands/cache.js";
import { approveCommand } from "./commands/approve.js";
import { cronCommand } from "./commands/cron.js";
import { doctorCommand } from "./commands/doctor.js";
import { updateCommand } from "./commands/update.js";

const program = new Command();

program
  .name("context7-skill")
  .description("Local documentation cache for AI agents. Caches Context7 library docs in SQLite+FTS5.")
  .version("0.1.2");

program.addCommand(installCommand());
program.addCommand(initCommand());
program.addCommand(snapshotCommand());
program.addCommand(searchCommand());
program.addCommand(docsCommand());
program.addCommand(libsCommand());
program.addCommand(addCommand());
program.addCommand(removeCommand());
program.addCommand(diffCommand());
program.addCommand(cacheCommand());
program.addCommand(approveCommand());
program.addCommand(cronCommand());
program.addCommand(doctorCommand());
program.addCommand(updateCommand());

program.parse();
