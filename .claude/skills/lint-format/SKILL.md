---
name: Lint and Format
description: Auto-fix lint issues and format the codebase (eslint --fix and prettier --write)
allowed-tools: Bash(npm run lint*) Bash(npm run format*)
---

Clean up style/lint issues before a commit. The Husky pre-commit hook already runs `npm test`, but not
lint or format, so run this explicitly.

1. Fix auto-fixable lint issues:
   ```!
   npm run lint:fix
   ```
2. Format the codebase:
   ```!
   npm run format
   ```
3. If lint still reports errors after `lint:fix`, list them for the user instead of editing files blindly —
   some ESLint rules aren't auto-fixable and need a real code change.
