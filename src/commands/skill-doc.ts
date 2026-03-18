export function getSkillDoc(): string {
  return `## context7-skill (Library Documentation Cache)

Local documentation cache for AI agents. Queries cached docs first, falls back to Context7 API.
Uses \`.context7-cache/\` directory with SQLite + FTS5 for fast full-text search.

### Quick Reference

| Command | Use For |
|---------|---------|
| \`context7-skill search <query>\` | Search cached docs across all libraries |
| \`context7-skill docs <library> <query>\` | Get docs for a specific library |
| \`context7-skill libs\` | List all cached libraries |
| \`context7-skill add <library>\` | Manually cache a new library |
| \`context7-skill diff\` | Compare project deps vs cached libraries |
| \`context7-skill cache stats\` | Cache size, hit rate, token savings |

### Usage Rules

1. **Before implementing any plan**: check if the plan references libraries not in the local cache
2. **Pre-cache new libraries**: \`context7-skill docs <library> <query>\` before starting implementation
3. **After adding dependencies**: run \`context7-skill snapshot\` to detect and cache new libraries
4. **Prefer local cache**: use \`context7-skill search\` and \`context7-skill docs\` instead of Context7 MCP tools
5. **Cache is authoritative**: if docs are cached locally, do NOT re-fetch from Context7 API
6. **Offline resilience**: if API is unreachable, cached docs are still valid — use them

### Commands

- \`context7-skill search <query>\` — FTS5 search across all cached library docs
- \`context7-skill docs <library> <query>\` — get docs for specific library (cache-first, API fallback)
- \`context7-skill docs <library> <query> --no-cache\` — force fresh fetch from API
- \`context7-skill libs\` — list cached libraries with stats (import count, snippets, freshness)
- \`context7-skill libs --json\` — structured output
- \`context7-skill add <library>\` — manually add and cache a library
- \`context7-skill remove <library>\` — remove a cached library
- \`context7-skill diff\` — compare current project deps vs cached (new/removed/stale)
- \`context7-skill cache stats\` — token savings, hit rate, total size
- \`context7-skill cache list\` — list all cached queries
- \`context7-skill cache clear\` — wipe local cache
- \`context7-skill snapshot\` — refresh all cached library docs
- \`context7-skill doctor\` — health check

### Integration with /plan Workflow

When planning implementation of a feature:
1. Read the plan requirements
2. Identify NEW libraries/technologies mentioned
3. For each new library: \`context7-skill docs <library> <relevant-query>\`
4. Verify docs are cached: \`context7-skill libs\`
5. Proceed with implementation using cached docs

### Schema Snapshot Auto-Refresh
- Snapshot refreshes nightly via cron (if configured with \`context7-skill cron\`)
- **After adding dependencies**: Run \`context7-skill snapshot\` to detect and cache new libraries
- **Rule of thumb**: If you added new packages to requirements.txt or package.json, refresh the cache`;
}
