import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

export interface DetectedDep {
  name: string;
  version: string | null;
  sourceFile: string;
}

// Packages that Context7 won't have docs for
const SKIP_LIST = new Set([
  "typing-extensions", "typing_extensions", "setuptools", "wheel", "pip",
  "six", "certifi", "charset-normalizer", "urllib3", "idna", "packaging",
  "attrs", "wrapt", "decorator", "pbr", "pyasn1", "rsa", "cachetools",
  "pytz", "python-dateutil", "filelock", "platformdirs", "distlib",
  "virtualenv", "pluggy", "iniconfig", "tomli", "exceptiongroup",
  "colorama", "click", "markupsafe", "itsdangerous", "werkzeug",
  "jinja2", "blinker", "sniffio", "anyio", "h11", "httpcore",
  "annotated-types", "pydantic-core", "starlette", "cffi", "pycparser",
  "cryptography", "pyopenssl", "multidict", "yarl", "frozenlist", "aiosignal",
  "async-timeout", "greenlet", "dnspython", "email-validator",
  "python-multipart", "python-dotenv", "watchfiles", "uvloop", "httptools",
  "websockets", "orjson",
  // Node common utils
  "typescript", "tslib", "@types/node", "@types/react", "@types/react-dom",
  "eslint", "prettier", "vitest", "jest", "@testing-library/react",
]);

export function detectDeps(projectDir: string): DetectedDep[] {
  const deps: DetectedDep[] = [];
  const seen = new Set<string>();

  function addDep(name: string, version: string | null, sourceFile: string) {
    const normalized = name.toLowerCase().replace(/_/g, "-").trim();
    if (!normalized || SKIP_LIST.has(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    deps.push({ name: normalized, version, sourceFile });
  }

  // package.json
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      for (const section of ["dependencies", "devDependencies"]) {
        const d = pkg[section];
        if (d && typeof d === "object") {
          for (const [name, ver] of Object.entries(d)) {
            const v = String(ver).replace(/^[\^~>=<]/, "").split(".").slice(0, 3).join(".");
            addDep(name, v || null, "package.json");
          }
        }
      }
    } catch { /* skip */ }
  }

  // requirements.txt + requirements-*.txt
  const reqFiles = readdirSync(projectDir).filter(f => /^requirements.*\.txt$/.test(f));
  for (const reqFile of reqFiles) {
    parseRequirementsTxt(join(projectDir, reqFile), reqFile, addDep);
  }

  // Also check common subdirectories for requirements.txt
  for (const subdir of getSubDirs(projectDir)) {
    const subReqFiles = safeReadDir(join(projectDir, subdir)).filter(f => /^requirements.*\.txt$/.test(f));
    for (const reqFile of subReqFiles) {
      parseRequirementsTxt(join(projectDir, subdir, reqFile), `${subdir}/${reqFile}`, addDep);
    }
  }

  // pyproject.toml
  const pyprojectPath = join(projectDir, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    parsePyproject(pyprojectPath, addDep);
  }

  // Pipfile
  const pipfilePath = join(projectDir, "Pipfile");
  if (existsSync(pipfilePath)) {
    parsePipfile(pipfilePath, addDep);
  }

  // go.mod
  const goModPath = join(projectDir, "go.mod");
  if (existsSync(goModPath)) {
    parseGoMod(goModPath, addDep);
  }

  // Cargo.toml
  const cargoPath = join(projectDir, "Cargo.toml");
  if (existsSync(cargoPath)) {
    parseCargoToml(cargoPath, addDep);
  }

  // Gemfile
  const gemfilePath = join(projectDir, "Gemfile");
  if (existsSync(gemfilePath)) {
    parseGemfile(gemfilePath, addDep);
  }

  return deps;
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function getSubDirs(projectDir: string): string[] {
  try {
    return readdirSync(projectDir).filter(f => {
      if (f.startsWith(".") || f === "node_modules" || f === "dist" || f === "__pycache__" || f === "venv" || f === ".venv") return false;
      try {
        return statSync(join(projectDir, f)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function parseRequirementsTxt(filePath: string, sourceFile: string, addDep: (n: string, v: string | null, s: string) => void) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-") || trimmed.startsWith("--")) continue;
      // Handle: package==1.0.0, package>=1.0.0, package~=1.0.0, package[extras]>=1.0.0
      const match = trimmed.match(/^([a-zA-Z0-9._-]+)(?:\[.*?\])?\s*(?:[=<>~!]+\s*(.+?))?(?:\s*;.*)?$/);
      if (match) {
        addDep(match[1], match[2] || null, sourceFile);
      }
    }
  } catch { /* skip */ }
}

function parsePyproject(filePath: string, addDep: (n: string, v: string | null, s: string) => void) {
  try {
    const content = readFileSync(filePath, "utf-8");
    // Simple regex extraction for dependencies array
    const depSection = content.match(/\[project\]\s*[\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depSection) {
      const lines = depSection[1].split("\n");
      for (const line of lines) {
        const match = line.match(/"([a-zA-Z0-9._-]+)(?:\[.*?\])?\s*(?:[=<>~!]+\s*(.+?))?"/);
        if (match) {
          addDep(match[1], match[2] || null, "pyproject.toml");
        }
      }
    }
  } catch { /* skip */ }
}

function parsePipfile(filePath: string, addDep: (n: string, v: string | null, s: string) => void) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const inPackages = /\[packages\]([\s\S]*?)(?:\[|$)/;
    const match = content.match(inPackages);
    if (match) {
      for (const line of match[1].split("\n")) {
        const m = line.match(/^([a-zA-Z0-9._-]+)\s*=/);
        if (m) addDep(m[1], null, "Pipfile");
      }
    }
  } catch { /* skip */ }
}

function parseGoMod(filePath: string, addDep: (n: string, v: string | null, s: string) => void) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const reqBlock = content.match(/require\s*\(([\s\S]*?)\)/);
    if (reqBlock) {
      for (const line of reqBlock[1].split("\n")) {
        const m = line.trim().match(/^([^\s]+)\s+v?([\d.]+)/);
        if (m) {
          const name = m[1].split("/").pop() || m[1];
          addDep(name, m[2], "go.mod");
        }
      }
    }
  } catch { /* skip */ }
}

function parseCargoToml(filePath: string, addDep: (n: string, v: string | null, s: string) => void) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const depSection = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
    if (depSection) {
      for (const line of depSection[1].split("\n")) {
        const m = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"?([^"{\s]+)/);
        if (m) addDep(m[1], m[2], "Cargo.toml");
      }
    }
  } catch { /* skip */ }
}

function parseGemfile(filePath: string, addDep: (n: string, v: string | null, s: string) => void) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/gem\s+['"]([^'"]+)['"]/);
      if (m) addDep(m[1], null, "Gemfile");
    }
  } catch { /* skip */ }
}

// ─── Import Counter ───

export function countImports(projectDir: string, depNames: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name of depNames) counts.set(name, 0);

  const extensions = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".mjs"]);

  function scanDir(dir: string, depth: number) {
    if (depth > 5) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "dist" || entry === "__pycache__" || entry === "venv" || entry === ".venv" || entry === "build") continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath, depth + 1);
        } else if (extensions.has(extname(entry))) {
          const content = readFileSync(fullPath, "utf-8");
          for (const name of depNames) {
            // Python: import X, from X import, from X.sub import
            // JS/TS: import ... from 'X', require('X')
            const pyPattern = new RegExp(`(?:^|\\n)\\s*(?:import\\s+${name}|from\\s+${name}[.\\s])`, "g");
            const jsPattern = new RegExp(`(?:from\\s+['"]${name}(?:[/'"])|require\\(['"]${name}(?:[/'"]))`,"g");
            const pyMatches = content.match(pyPattern);
            const jsMatches = content.match(jsPattern);
            const total = (pyMatches?.length || 0) + (jsMatches?.length || 0);
            if (total > 0) {
              counts.set(name, (counts.get(name) || 0) + total);
            }
          }
        }
      } catch { /* skip individual files */ }
    }
  }

  scanDir(projectDir, 0);
  return counts;
}
