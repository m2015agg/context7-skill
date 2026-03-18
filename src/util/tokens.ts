import type Database from "better-sqlite3";
import { getTokenStats, type TokenStatsReport } from "./db.js";

export function formatTokenStats(report: TokenStatsReport): string {
  const lines: string[] = [];
  lines.push(`  Token Savings Report`);
  lines.push(`  ────────────────────`);
  lines.push(`  Total tokens served:  ${report.totalTokensServed.toLocaleString()}`);
  lines.push(`  Cache hits:           ${report.cacheHits}`);
  lines.push(`  API fetches:          ${report.apiCalls}`);
  lines.push(`  Hit rate:             ${(report.hitRate * 100).toFixed(1)}%`);
  lines.push(`  Est. cost saved:      ${report.estimatedSavings}`);
  return lines.join("\n");
}

export function getTokenStatsReport(db: Database.Database): TokenStatsReport {
  return getTokenStats(db);
}
