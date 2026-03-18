import { execSync } from "node:child_process";

export function checkCtx7(): { installed: boolean; version: string | null } {
  try {
    const out = execSync("ctx7 --version 2>&1", { encoding: "utf-8", timeout: 10000 }).trim();
    const match = out.match(/(\d+\.\d+\.\d+)/);
    return { installed: true, version: match ? match[1] : out };
  } catch {
    // Also check via npx
    try {
      execSync("npx ctx7 --version 2>&1", { encoding: "utf-8", timeout: 15000 });
      return { installed: true, version: "npx" };
    } catch {
      return { installed: false, version: null };
    }
  }
}

export function validateApiKey(apiKey: string): boolean {
  try {
    const url = `https://context7.com/api/v2/libs/search?libraryName=react&query=test`;
    const result = execSync(
      `curl -sf "${url}" -H "Authorization: Bearer ${apiKey}" -o /dev/null -w "%{http_code}" 2>/dev/null`,
      { encoding: "utf-8", timeout: 10000 },
    ).trim();
    return result === "200";
  } catch {
    return false;
  }
}

export function testApiAccess(): boolean {
  try {
    const url = `https://context7.com/api/v2/libs/search?libraryName=react&query=hooks`;
    const result = execSync(
      `curl -sf "${url}" -o /dev/null -w "%{http_code}" 2>/dev/null`,
      { encoding: "utf-8", timeout: 10000 },
    ).trim();
    return result === "200";
  } catch {
    return false;
  }
}
