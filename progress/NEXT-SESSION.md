# Workflow Pilot - Next Session Guide

**Last Updated:** 2026-01-11
**Version:** 0.7.0
**Status:** Production Ready with Extended Features

---

## Quick Start

```bash
cd "/Users/chris/cc-projects/claude code terminal plugin"
npm run build
npm test -- --run  # Should pass 173 tests
```

---

## Current State Summary

The plugin is a fully functional MVP with significant new features:

### Completed Features (This Session)
- **Project Config Loading**: `.workflow-pilot.json` in project root
- **Project Type Detection**: React, Next.js, Vue, Angular, Node, Express, Python, Go, Rust
- **Rule Presets System**: config/presets/ with frontend, node, python, typescript presets
- **File Classification**: code, test, config, docs, style, build classification
- **Smart Test Filter Infrastructure**: Track file changes, hasCodeChangesThisSession()
- **PRD Parser**: Parse markdown PRDs, extract requirements/features/user stories
- **PRD Tracker**: Persist progress, suggest next requirement

### Test Summary
| Suite | Tests |
|-------|-------|
| install.test.js | 19 |
| intent-matcher.test.ts | 44 |
| rules/index.test.ts | 25 |
| file-classifier.test.ts | 38 |
| project-detector.test.ts | 25 |
| prd/parser.test.ts | 22 |
| **Total** | **173** |

### Architecture
```
src/
├── index.ts              # Hook entry point
├── config/
│   ├── schema.ts         # TypeScript interfaces
│   ├── loader.ts         # Config loading with .workflow-pilot.json
│   ├── project-detector.ts  # NEW: Project type detection
│   └── preset-loader.ts  # NEW: Load rule presets
├── state/
│   └── cooldown.ts       # Cooldown + file change tracking
├── utils/
│   └── file-classifier.ts  # NEW: File type classification
├── prd/
│   ├── parser.ts         # NEW: PRD markdown parser
│   └── tracker.ts        # NEW: PRD progress tracking
├── analyzer/             # Context analysis
├── rules/
│   ├── index.ts          # Rule definitions
│   └── intent-matcher.ts # Fuzzy security matching
└── output/               # Formatting

config/
├── default.json          # Default config
└── presets/              # NEW: Rule presets
    ├── base.json
    ├── frontend.json
    ├── node.json
    ├── python.json
    └── typescript.json
```

---

## What to Work On Next

### Priority 1: Complete Integrations

**Feature 10**: Integrate presets into config loading chain
- Wire `loadPreset()` into `loadConfig()`
- Apply preset based on detected project type
- Add integration tests

**Features 16-17**: Complete smart test filter integration
- Modify test reminder rule to use `hasCodeChangesThisSession()`
- Skip reminder if only config/docs changed
- Add tests

### Priority 2: PRD Integration

**Feature 24**: Detect PRD file in project
- Check for PRD.md, SPEC.md, docs/PRD.md
- Make path configurable

**Feature 25**: Inject PRD context into hook output
- Show progress summary
- Suggest next requirement

### Priority 3: Future Enhancements

**Feature 33**: Auto-detect completion from git commits
- Parse commit messages
- Fuzzy match against requirements
- Suggest marking complete

---

## Key Files Quick Reference

| File | Purpose | Tests |
|------|---------|-------|
| `src/index.ts` | Hook entry, visual output | - |
| `src/rules/index.ts` | Rule definitions | 25 |
| `src/rules/intent-matcher.ts` | Fuzzy security matching | 44 |
| `src/config/loader.ts` | Config loading chain | - |
| `src/config/project-detector.ts` | Project type detection | 25 |
| `src/config/preset-loader.ts` | Preset loading | - |
| `src/utils/file-classifier.ts` | File classification | 38 |
| `src/prd/parser.ts` | PRD parsing | 22 |
| `src/prd/tracker.ts` | Progress tracking | - |
| `scripts/install.js` | Installer | 19 |

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
npm test -- --run              # Run all 173 tests
npm test -- --watch            # Watch mode
npm run build                  # Compile TypeScript
node scripts/install.js        # Install/update hooks
tail -20 /tmp/workflow-pilot.log  # Check hook activity
cat /tmp/workflow-pilot-state.json  # Check cooldown state
```

---

## New Config File Support

Projects can now use `.workflow-pilot.json` in project root:

```json
{
  "mode": "training",
  "categories": {
    "testing": true,
    "security": true
  }
}
```

Priority order (lowest to highest):
1. Built-in defaults
2. User global (~/.config/workflow-pilot/config.json)
3. Project config (./config/workflow-pilot.json)
4. **Project root (./.workflow-pilot.json)** - NEW
5. Environment variable override

---

## Project Detection

The plugin auto-detects project types:

| Type | Detection Method |
|------|------------------|
| react | package.json: react dependency |
| nextjs | package.json: next dependency |
| vue | package.json: vue dependency |
| angular | package.json: @angular/core |
| node-express | package.json: express |
| node-fastify | package.json: fastify |
| python-flask | requirements.txt contains flask |
| python-django | requirements.txt contains django |
| python-fastapi | pyproject.toml contains fastapi |
| go | go.mod exists |
| rust | Cargo.toml exists |

Also detects:
- TypeScript (tsconfig.json)
- Monorepo (workspaces, apps/, packages/)
- Test framework (vitest, jest, pytest)
- Package manager (npm, yarn, pnpm, pip, poetry)

---

## Session Summary (2026-01-11)

### What Was Done
1. **Feature List**: Created Anthropic autonomous-coding format feature list (35 features)
2. **Project Config**: Added .workflow-pilot.json support with config chain
3. **Project Detector**: Full detection for React, Vue, Angular, Node, Python, Go, Rust
4. **Rule Presets**: Created preset system with frontend, node, python, typescript presets
5. **File Classifier**: Complete file type classification (code, test, config, docs, etc.)
6. **Smart Test Filter**: Infrastructure for tracking file changes
7. **PRD Parser**: Full markdown PRD parsing with requirements, features, user stories
8. **PRD Tracker**: Progress persistence and next requirement suggestions
9. **Tests**: Added 85 new tests (173 total, all passing)
10. **Test Plan**: Created comprehensive manual test plan

### Files Created
```
src/config/project-detector.ts     - Project type detection
src/config/preset-loader.ts        - Preset loading
src/utils/file-classifier.ts       - File classification
src/prd/parser.ts                  - PRD parsing
src/prd/tracker.ts                 - Progress tracking
config/presets/base.json           - Base preset
config/presets/frontend.json       - Frontend preset
config/presets/node.json           - Node preset
config/presets/python.json         - Python preset
config/presets/typescript.json     - TypeScript preset
TEST-PLAN.md                       - Manual test plan
```

### Tests Added
- file-classifier.test.ts (38 tests)
- project-detector.test.ts (25 tests)
- prd/parser.test.ts (22 tests)

---

## Notes for Next Instance

1. **173 tests passing** - Run `npm test -- --run` to verify

2. **All major modules created** - Project detection, file classification, PRD parsing all functional

3. **Integration pending** - Presets and smart test filter need to be wired into main logic

4. **User vision:** Autonomous senior dev mode - PRD foundation is ready

5. **Feature list format:** Using Anthropic autonomous-coding format in feature_list.json

---

## Contact Points

- **Progress files:** `progress/` directory
- **Config:** `config/default.json`
- **Presets:** `config/presets/`
- **Hooks:** `hooks/hooks.json`
- **Main logic:** `src/index.ts`
- **Installer:** `scripts/install.js`
- **Test Plan:** `TEST-PLAN.md`
- **Feature List:** `feature_list.json`
