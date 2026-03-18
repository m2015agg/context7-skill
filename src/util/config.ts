import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SkillConfig {
  apiKey?: string;
  freeTier: boolean;
  defaultTokenLimit: number;
  cacheTtlHours: number;
}

function getConfigDir(): string {
  return join(homedir(), ".config", "context7-skill");
}

function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function getConfigDir_public(): string {
  return getConfigDir();
}

export function readConfig(): SkillConfig | null {
  const path = getConfigPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as SkillConfig;
  } catch {
    return null;
  }
}

export function writeConfig(config: SkillConfig): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}

export function getDefaultConfig(): SkillConfig {
  return {
    freeTier: true,
    defaultTokenLimit: 5000,
    cacheTtlHours: 168, // 7 days
  };
}
