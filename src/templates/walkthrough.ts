export function getWalkthroughTemplate(): string {
  return `---
description: Look up library documentation from Context7 cache for implementation guidance
allowed-tools: Read, Bash(context7-skill:*), Bash(cat:*)
---

# /context7 — Library Documentation Lookup

When the user invokes this command, help them find and use library documentation.

## Steps

1. **Show cached libraries**
   Run: \`context7-skill libs\`
   Summarize what's cached, highlight stale entries.

2. **Search for specific docs**
   Ask what library or topic they need help with.
   Run: \`context7-skill search <query>\`
   Show relevant snippets.

3. **Deep dive on a library**
   Run: \`context7-skill docs <library> <specific-question>\`
   Present the documentation with code examples.

4. **Cache new library**
   If the user needs docs for a library not yet cached:
   Run: \`context7-skill add <library-name>\`
   This resolves, fetches, and caches the docs.

5. **Pre-implementation prep**
   If the user is about to implement a feature:
   - Read the plan/requirements
   - Identify libraries involved
   - Run \`context7-skill diff\` to check what's missing
   - Cache docs for any missing libraries
   - Present relevant code patterns

6. **Cache health**
   Run: \`context7-skill cache stats\`
   Show token savings and cache hit rate.

## Tips
- Use \`context7-skill search <query>\` for broad searches across all libraries
- Use \`context7-skill docs <lib> <query>\` for targeted lookups
- Use \`context7-skill snapshot\` after adding new dependencies
- Use \`context7-skill doctor\` if something seems wrong
`;
}
