import { execSync } from "node:child_process";
import { readConfig } from "./config.js";

const BASE_URL = "https://context7.com/api";

export interface LibraryResult {
  id: string;
  title: string;
  description: string;
  totalSnippets: number;
  trustScore: number;
  benchmarkScore: number;
  versions: string[];
}

export interface CodeSnippet {
  codeTitle: string;
  codeDescription: string;
  codeLanguage: string;
  codeTokens: number;
  codeId: string;
  pageTitle: string;
  codeList: Array<{ language: string; code: string }>;
}

export interface InfoSnippet {
  pageId?: string;
  breadcrumb?: string;
  content: string;
  contentTokens: number;
}

export interface DocsResult {
  codeSnippets: CodeSnippet[];
  infoSnippets: InfoSnippet[];
}

function getAuthHeader(): string {
  const config = readConfig();
  if (config?.apiKey) {
    return `-H "Authorization: Bearer ${config.apiKey}"`;
  }
  // Check env var
  const key = process.env.CONTEXT7_API_KEY;
  if (key) {
    return `-H "Authorization: Bearer ${key}"`;
  }
  return "";
}

function curlGet(url: string, timeoutMs = 30000): string {
  const auth = getAuthHeader();
  const timeoutSec = Math.ceil(timeoutMs / 1000);
  const cmd = `curl -sf --max-time ${timeoutSec} "${url}" ${auth} 2>/dev/null`;
  return execSync(cmd, { encoding: "utf-8", timeout: timeoutMs + 5000 });
}

export function searchLibrary(name: string, query?: string): LibraryResult[] {
  const q = query || name;
  const url = `${BASE_URL}/v2/libs/search?libraryName=${encodeURIComponent(name)}&query=${encodeURIComponent(q)}`;
  try {
    const raw = curlGet(url);
    const data = JSON.parse(raw);
    const results = data.results || data || [];
    return (Array.isArray(results) ? results : []).map((r: Record<string, unknown>) => ({
      id: String(r.id || ""),
      title: String(r.title || ""),
      description: String(r.description || ""),
      totalSnippets: Number(r.totalSnippets || 0),
      trustScore: Number(r.trustScore || 0),
      benchmarkScore: Number(r.benchmarkScore || 0),
      versions: Array.isArray(r.versions) ? r.versions.map(String) : [],
    }));
  } catch {
    return [];
  }
}

export function fetchDocs(libraryId: string, query: string, tokens?: number): DocsResult {
  const tokenParam = tokens ? `&tokens=${tokens}` : "";
  const url = `${BASE_URL}/v2/context?libraryId=${encodeURIComponent(libraryId)}&query=${encodeURIComponent(query)}&type=json${tokenParam}`;
  try {
    const raw = curlGet(url);
    const data = JSON.parse(raw);
    return {
      codeSnippets: Array.isArray(data.codeSnippets) ? data.codeSnippets : [],
      infoSnippets: Array.isArray(data.infoSnippets) ? data.infoSnippets : [],
    };
  } catch {
    return { codeSnippets: [], infoSnippets: [] };
  }
}

export function isApiReachable(): boolean {
  try {
    const url = `${BASE_URL}/v2/libs/search?libraryName=react&query=test`;
    const auth = getAuthHeader();
    execSync(`curl -sf --max-time 5 "${url}" ${auth} -o /dev/null 2>/dev/null`, { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}
