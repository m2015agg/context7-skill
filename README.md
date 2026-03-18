# @m2015agg/context7-skill

[![npm version](https://img.shields.io/npm/v/@m2015agg/context7-skill.svg)](https://www.npmjs.com/package/@m2015agg/context7-skill)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Local documentation cache for AI agents.** Caches Context7 library docs in SQLite+FTS5, serving them via CLI instead of burning context on MCP round-trips.

## Why This Exists

Every time your AI agent needs library docs, the Context7 MCP server:
1. Hits an API and waits for a response
2. Dumps **thousands of tokens** of documentation into your context window
3. Those tokens sit there **forever** even after the agent got what it needed
4. The **same docs get re-fetched** across conversations

This package solves that:

| | Context7 MCP | context7-skill |
|---|---|---|
| Doc lookup | API call every time | Local SQLite cache first |
| Speed | **~1,270ms** per lookup | **~64ms** per lookup (**20x faster**) |
| Context cost | **~3,077 tokens** per lookup | **~1,666 tokens** per lookup (**45% less**) |
| Repeat queries | Re-fetches same docs | Cache hit, zero API calls |
| 20 lookups/session | 25.4s waiting, 61K tokens | 1.3s waiting, 33K tokens |
| Offline | No | Yes, for cached libs |
| Project-aware | No | Auto-detects deps, pre-caches |
| Install | Manual MCP config | `install` → `init` → done |

### Anthropic SkillsBench Results

Benchmarked using [Anthropic's official skill-creator framework](https://github.com/anthropics/skills) — 3 evals × 3 runs per config, graded against objective assertions.

```
┌─────────────────────────────────────────────────────────────┐
│  Metric          │  CLI Cache      │  MCP Server    │ Delta │
├─────────────────────────────────────────────────────────────┤
│  Pass Rate       │  93% ± 10%      │  48% ± 33%     │ +46%  │
│  Speed           │  17.9s ± 4.3s   │  21.2s ± 2.8s  │ -3.3s │
│  Consistency     │  ± 10% variance │  ± 33% variance│  3x   │
└─────────────────────────────────────────────────────────────┘

Evals:
  1. FastAPI dependency injection  → CLI: 100% | MCP: 50%
  2. Celery + Redis configuration  → CLI: 80%  | MCP: 20%
  3. Supabase RLS policies         → CLI: 100% | MCP: 73%
```

The MCP server is wildly inconsistent — swinging between 20% and 100% across runs. The CLI cache hits 80-100% every time because the docs are pre-loaded locally.

### Raw Speed Benchmarks (SQLite lookup vs API round-trip)

```
Speed:
  MCP (API round-trip):  ~1,270ms average per lookup
  CLI (SQLite cache):       ~64ms average per lookup
  Speedup:                  19.8x faster

Context Window:
  MCP: ~3,077 tokens per lookup (tool schemas + API response)
  CLI: ~1,666 tokens per lookup (bash command + result only)
  Saved: ~1,411 tokens per lookup (45%)

Per Session (20 doc lookups):
  MCP:  25.4s waiting, ~61,540 tokens consumed
  CLI:   1.3s waiting, ~33,320 tokens consumed
  Saved: 24.1s and ~28,220 tokens per session

Over 10 Conversations (repeat queries):
  MCP:  615,400 tokens (re-fetches every time)
  CLI:  333,200 tokens (cache hits after first fetch)
  Saved: 282,200 tokens (45%), ~$0.85 at $3/M input tokens
```

## Quick Start

```bash
# Install globally
npm install -g @m2015agg/context7-skill

# One-time global setup
context7-skill install

# Per-project setup (auto-detects deps, caches docs, approves permissions)
cd your-project
context7-skill init
```

That's it. Your AI agent can now use cached docs via CLI:

```bash
context7-skill search "fastapi dependency injection"
context7-skill docs fastapi "how to use background tasks"
context7-skill libs
```

## How It Works

1. **`init` scans your project** for `package.json`, `requirements.txt`, `pyproject.toml`, `Pipfile`, `Cargo.toml`, `go.mod`, `Gemfile`, and more
2. **Resolves each dependency** on Context7 (e.g., `fastapi` → `/fastapi/fastapi`)
3. **Pre-caches documentation** in a local SQLite database with FTS5 full-text search
4. **Writes CLAUDE.md** instructions so your agent knows to use the cache
5. **Pre-approves read commands** in `.claude/settings.json` (no permission prompts)
6. **Nightly cron** keeps the cache fresh

## Commands

### For Users (run these yourself)

| Command | Description |
|---------|-------------|
| `install` | Global setup wizard (ctx7 CLI, API key, config) |
| `install --init` | Global setup + init current project |
| `init` | Per-project: detect deps, cache, CLAUDE.md, approve, cron |
| `doctor` | Health check (10 checks) |
| `update` | Self-update to latest version |

### For AI Agents (Claude calls these automatically)

| Command | Description |
|---------|-------------|
| `search <query>` | FTS5 search across all cached docs |
| `docs <library> <query>` | Get docs (cache-first, API fallback) |
| `docs <lib> <query> --no-cache` | Force fresh fetch |
| `libs` | List cached libraries with import counts |
| `add <library>` | Manually add a library |
| `remove <library>` | Remove a cached library |
| `diff` | Compare project deps vs cached |
| `cache stats` | Token savings, hit rate |
| `cache list` | List cached queries |
| `cache clear` | Wipe local cache |
| `snapshot` | Refresh all cached docs |

## Smart Caching

### Import-Weighted Pre-Caching

Libraries you use most get more cached docs:
- **10+ imports** in source → 5 queries pre-cached
- **1-9 imports** → 3 queries pre-cached
- **0 imports** → 1 query pre-cached

### Version-Aware

Detects pinned versions from dependency files (`fastapi==0.109.0`) and uses version-specific Context7 documentation when available.

### Global Library Resolution Cache

`~/.config/context7-skill/global-cache.db` stores library name → Context7 ID mappings across all projects. If project A already resolved `fastapi`, project B skips the API call.

### Token Savings Tracking

Every cache operation is tracked:

```
$ context7-skill cache stats

  Cache Statistics:

  Libraries:    15
  Snippets:     312
  Queries:      47
  DB size:      1,240 KB
  Last snapshot: 2026-03-18T03:00:00Z

  Token Savings Report
  ────────────────────
  Total tokens served:  145,000
  Cache hits:           42
  API fetches:          5
  Hit rate:             89.4%
  Est. cost saved:      $0.4350
```

### Offline Resilience

If the Context7 API is unreachable, cached docs are served without errors. The skill doc instructs agents: "Cache is authoritative."

## Integration with /plan Workflow

The CLAUDE.md instructions tell your agent:

> **Before implementing any plan:**
> 1. Identify libraries mentioned in the plan
> 2. Run `context7-skill docs <library> <query>` for any not cached
> 3. Verify with `context7-skill libs`
> 4. Proceed with cached docs available

## Architecture

```
.context7-cache/
├── docs.db          # SQLite + FTS5 (all queries go here)
├── index.md         # Human-readable overview
└── libs/
    ├── fastapi.md   # Per-library summary
    ├── supabase.md
    └── ...

~/.config/context7-skill/
├── config.json      # API key, settings (mode 600)
└── global-cache.db  # Cross-project library resolution cache
```

## Security

- **API keys** stored in `~/.config/context7-skill/config.json` (mode 600) and project `.env`
- **CLAUDE.md** contains only CLI commands — no secrets
- **Pre-approved commands** are read-only (search, docs, libs)
- **Write operations** (add, remove, snapshot) still require approval

## Companion Packages

- **[@m2015agg/supabase-skill](https://www.npmjs.com/package/@m2015agg/supabase-skill)** — Same pattern for Supabase database schema
- **[@m2015agg/notion-cli](https://www.npmjs.com/package/@m2015agg/notion-cli)** — Notion API CLI for agents

## License

MIT
