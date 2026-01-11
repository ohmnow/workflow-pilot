# Workflow Pilot - Next Session Guide

**Last Updated:** 2026-01-11
**Version:** 0.6.0
**Status:** Production Ready

---

## Quick Start

```bash
cd "/Users/chris/cc-projects/claude code terminal plugin"
npm run build
npm test -- --run  # Should pass 88 tests
```

---

## Current State Summary

The plugin is a fully functional MVP with all hooks working:

### Completed Features
- **Three Operating Modes**: minimal, training, guidance
- **Three-Tier Visual Feedback**: critical (red), warning (gold), info (blue)
- **Configuration System**: JSON config with environment overrides
- **Cooldown System**: Time-based throttling to prevent alert fatigue
- **Smart Triggers**: Context-aware heuristics (not message counts)
- **All Three Hooks Working**: UserPromptSubmit, PreToolUse, PostToolUse
- **Proper Blocking**: Exit code 2 for blocking dangerous commands
- **Intent Matcher**: Fuzzy matching that ignores commit message content
- **25 Rules**: Testing, git, security, Claude Code, refactoring, type-safety, error-handling, documentation, production, code-quality
- **AI Integration**: Claude API with fallback to rules-only
- **Installer**: `node scripts/install.js` with full test coverage

### Architecture
```
src/
├── index.ts           # Hook entry point
├── config/
│   ├── schema.ts      # TypeScript interfaces
│   └── loader.ts      # Config loading
├── state/
│   └── cooldown.ts    # Cooldown tracking
├── analyzer/          # Context analysis
├── rules/
│   ├── index.ts       # Rule definitions
│   └── intent-matcher.ts  # Fuzzy security matching
└── output/            # Formatting

scripts/
├── install.js         # Installer (testable)
└── install.test.js    # 19 installer tests
```

---

## What to Work On Next

### Priority 1: User-Specific Config

**Current:** Config is global or project-level
**Desired:** Per-project customization with rule presets

**Ideas:**
- Detect project type (React, Node, Python)
- Apply relevant rule presets
- Allow `.workflow-pilot.json` in project root

---

### Priority 2: Smart Test Reminder Filtering

**Issue:** Plugin suggests "run tests" even for config-only changes (.gitignore, .md files)

**Fix:** Skip test reminders when only non-code files changed

---

### Priority 3: Autonomous Senior Dev Mode

**Vision:** Plugin that can work from specs/PRDs to guide development

**First Steps:**
1. Parse PRD/spec files
2. Extract requirements as checklist
3. Track completion as features are built
4. Suggest next steps based on PRD

**This is a larger feature - consider scoping carefully.**

---

## Key Files Quick Reference

| File | Purpose | Tests |
|------|---------|-------|
| `src/index.ts` | Hook entry, visual output | - |
| `src/rules/index.ts` | Rule definitions | 25 |
| `src/rules/intent-matcher.ts` | Fuzzy security matching | 44 |
| `scripts/install.js` | Installer | 19 |
| `src/config/loader.ts` | Config loading | - |
| `src/state/cooldown.ts` | Throttling | - |

---

## Environment Variables

```bash
WORKFLOW_PILOT_MODE=guidance    # minimal, training, guidance
WORKFLOW_PILOT_DEBUG=1          # Verbose logging
WORKFLOW_PILOT_CONFIG=/path     # Custom config path
ANTHROPIC_API_KEY=sk-ant-...    # For AI analysis
```

---

## Testing Commands

```bash
npm test -- --run              # Run all 88 tests
npm test -- --watch            # Watch mode
npm run build                  # Compile TypeScript
node scripts/install.js        # Install/update hooks
tail -20 /tmp/workflow-pilot.log  # Check hook activity
cat /tmp/workflow-pilot-state.json  # Check cooldown state
```

---

## Recent Commits

```
c75051c Add .playwright-mcp/ to gitignore
851a7ed Fix false positive on commit messages mentioning sensitive files
b019d59 Add PreToolUse hook and fix blocking exit code
1cc424d Add tests for install.js and refactor for testability
c80c439 Update NEXT-SESSION.md for v0.5.0
325fdb1 Add training mode with deep explanations and examples
```

---

## Session Summary (2026-01-11)

### What Was Done
1. **Install.js Tests**: Added 19 tests, refactored for dependency injection
2. **PreToolUse Hook**: Added to installer (was missing from settings)
3. **Exit Code Fix**: Changed from 1 to 2 for proper "block" signal
4. **False Positive Fix**: Intent matcher now ignores `-m "message"` content
5. **Gitignore**: Added `.playwright-mcp/` for Playwright screenshots

### Verified Working
- `git push --force origin main` → Blocked with CRITICAL ALERT
- `git add .env` → Blocked with CRITICAL ALERT
- `git commit -m "Fix .env handling"` → No longer triggers false positive

---

## Notes for Next Instance

1. **88 tests passing** - 25 rules + 44 intent matcher + 19 installer

2. **All hooks working** - UserPromptSubmit, PreToolUse, PostToolUse all configured

3. **Intent matcher is smart** - Ignores commit message content, only checks actual file args

4. **User vision:** Wants plugin to eventually work from PRDs/specs as autonomous senior dev

5. **Potential refinement:** Skip test reminders for config-only files

---

## Contact Points

- **Progress files:** `progress/` directory
- **Config:** `config/default.json`
- **Hooks:** `hooks/hooks.json`
- **Main logic:** `src/index.ts`
- **Installer:** `scripts/install.js`
