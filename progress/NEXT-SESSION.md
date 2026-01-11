# Workflow Pilot - Next Session Guide

**Last Updated:** 2026-01-11
**Version:** 0.7.0
**Status:** Ready for Manual Testing

---

## Quick Start

```bash
cd "/Users/chris/cc-projects/claude code terminal plugin"
npm run build
npm test -- --run  # Should pass 173 tests
```

---

## Manual Testing Checklist

This session's goal is to verify all features work correctly in Claude Code.

### Pre-Test Setup

```bash
# Ensure latest build
cd "/Users/chris/cc-projects/claude code terminal plugin"
npm run build

# Install hooks if not already done
node scripts/install.js

# Enable debug mode for visibility
export WORKFLOW_PILOT_DEBUG=1
```

---

## Test 1: Hook System Verification

### Test 1.1: UserPromptSubmit Hook
**What to do:** Start a fresh Claude Code session and type any prompt.

**Expected:** You should see hook output like:
```
[Workflow Pilot] 💡 Consider using Plan mode...
```

**Verify:** Hook fires on every prompt submission.

---

### Test 1.2: PreToolUse Blocking (CRITICAL)
**What to do:** Ask Claude to run a dangerous command.

```
Try: "Run git push --force origin main"
```

**Expected:**
```
🚨 CRITICAL ALERT: Dangerous Git Operation
   Attempting: force push to remote
   This can permanently destroy commit history for all collaborators.
```
Command should be BLOCKED (not executed).

**Also test:**
```
Try: "Run git add .env"
```
**Expected:** BLOCKED with sensitive file warning.

```
Try: "Run git add .env.example"
```
**Expected:** ALLOWED (template files are safe).

---

### Test 1.3: PostToolUse Feedback
**What to do:** Ask Claude to edit a code file.

```
Try: "Add a comment to src/index.ts"
```

**Expected:** After the edit completes, you may see suggestions like:
- Test reminder (if code was changed)
- Commit reminder (if many files uncommitted)

---

## Test 2: Project Config Loading

### Test 2.1: Create Project Config
**What to do:**
```bash
# Create a project-specific config
echo '{"mode": "training"}' > .workflow-pilot.json
```

Then start a new Claude Code session with debug enabled:
```bash
export WORKFLOW_PILOT_DEBUG=1
```

**Expected output:**
```
[WP Debug] Loaded config from: /path/to/.workflow-pilot.json
```

**Cleanup:**
```bash
rm .workflow-pilot.json
```

---

### Test 2.2: Config Precedence
**What to do:**
```bash
# Create project config with training mode
echo '{"mode": "training"}' > .workflow-pilot.json

# But override via environment
export WORKFLOW_PILOT_MODE=minimal
```

**Expected:** Environment variable wins. Mode should be `minimal`.

**Cleanup:**
```bash
rm .workflow-pilot.json
unset WORKFLOW_PILOT_MODE
```

---

## Test 3: Operating Modes

### Test 3.1: Minimal Mode
**What to do:**
```bash
export WORKFLOW_PILOT_MODE=minimal
```
Start Claude Code, trigger various actions.

**Expected:**
- Only CRITICAL alerts appear (red, security-related)
- NO warning suggestions
- NO info tips
- Very quiet operation

---

### Test 3.2: Training Mode
**What to do:**
```bash
export WORKFLOW_PILOT_MODE=training
```

**Expected:**
- All alert tiers enabled
- More frequent tips
- Explanations included with suggestions
- May ask about intent

---

### Test 3.3: Guidance Mode (Default)
**What to do:**
```bash
export WORKFLOW_PILOT_MODE=guidance
# or just unset it
unset WORKFLOW_PILOT_MODE
```

**Expected:**
- All tiers enabled
- Balanced frequency
- Concise output (no lengthy explanations)

---

## Test 4: Project Type Detection

### Test 4.1: Detect This Project (TypeScript/Node)
**What to do:** In this project directory with debug enabled:
```bash
export WORKFLOW_PILOT_DEBUG=1
```

**Expected output:**
```
[WP Debug] Detected project type: node
[WP Debug] TypeScript: true, Monorepo: false
```

---

### Test 4.2: Test React Detection
**What to do:** Create a temporary test directory:
```bash
mkdir /tmp/test-react && cd /tmp/test-react
echo '{"dependencies": {"react": "^18.0.0"}}' > package.json
export WORKFLOW_PILOT_DEBUG=1
# Start Claude Code here
```

**Expected:**
```
[WP Debug] Detected project type: react
```

**Cleanup:**
```bash
rm -rf /tmp/test-react
```

---

### Test 4.3: Test Python Detection
**What to do:**
```bash
mkdir /tmp/test-python && cd /tmp/test-python
echo "flask==2.0.0" > requirements.txt
export WORKFLOW_PILOT_DEBUG=1
# Start Claude Code here
```

**Expected:**
```
[WP Debug] Detected project type: python-flask
```

**Cleanup:**
```bash
rm -rf /tmp/test-python
```

---

## Test 5: File Classification (Smart Test Filtering)

### Test 5.1: Code File Changes
**What to do:** Ask Claude to edit a `.ts` file.

**Expected:** Test reminder should eventually trigger (based on cooldown).

---

### Test 5.2: Config-Only Changes
**What to do:** Ask Claude to only edit config/docs files:
```
"Update the README.md to add a new section"
"Add an entry to .gitignore"
```

**Expected:** NO test reminder (only config/docs changed, no code).

---

### Test 5.3: Sensitive File Detection
**What to do:**
```
Try: "Create a .env file with DATABASE_URL=secret"
```

**Expected:** Warning about sensitive file creation.

```
Try: "Create a .env.example file with DATABASE_URL=placeholder"
```

**Expected:** No warning (template files are safe).

---

## Test 6: PRD Parser (Manual Verification)

### Test 6.1: Create and Parse a PRD
**What to do:**
```bash
cd "/Users/chris/cc-projects/claude code terminal plugin"
```

Create a test PRD:
```bash
cat > /tmp/test-prd.md << 'EOF'
# My Product PRD

## Requirements
- [ ] User authentication
- [ ] Dashboard page
- [x] Landing page (completed)

## Features
- Dark mode toggle
- Export to PDF

## User Stories
- As a user, I want to login so I can access my data
EOF
```

Then in Node REPL or a test script:
```javascript
import { parsePRD } from './dist/prd/parser.js';
import { readFileSync } from 'fs';

const content = readFileSync('/tmp/test-prd.md', 'utf-8');
const prd = parsePRD(content);

console.log('Title:', prd.title);
console.log('Requirements:', prd.requirements.length);
console.log('Sections:', prd.sections);
prd.requirements.forEach(r => {
  console.log(`  [${r.completed ? 'x' : ' '}] ${r.text} (${r.category})`);
});
```

**Expected output:**
```
Title: My Product PRD
Requirements: 6
Sections: [ 'Requirements', 'Features', 'User Stories' ]
  [ ] User authentication (requirement)
  [ ] Dashboard page (requirement)
  [x] Landing page (completed) (requirement)
  [ ] Dark mode toggle (feature)
  [ ] Export to PDF (feature)
  [ ] As a user, I want to login so I can access my data (user-story)
```

---

### Test 6.2: Progress Tracking
**What to do:** Use the tracker to persist progress:
```javascript
import { initializeProgress, markCompleted, getProgressSummary } from './dist/prd/tracker.js';
import { parsePRD } from './dist/prd/parser.js';
import { readFileSync } from 'fs';

const content = readFileSync('/tmp/test-prd.md', 'utf-8');
const prd = parsePRD(content);

// Initialize tracking
initializeProgress('/tmp/test-prd.md', content, '/tmp');

// Mark one complete
markCompleted('req-1', '/tmp');

// Get summary
const summary = getProgressSummary(prd, '/tmp');
console.log(`Progress: ${summary.completed}/${summary.total} (${summary.percentage}%)`);
console.log('Next:', summary.nextRequirement?.text);
```

**Expected:** Progress file created at `/tmp/.workflow-pilot-progress.json`

---

## Test 7: Cooldown System

### Test 7.1: Verify Cooldown State
**What to do:** After triggering some rules, check:
```bash
cat /tmp/workflow-pilot-state.json
```

**Expected:** JSON with `lastTriggered` timestamps for each rule.

---

### Test 7.2: Cooldown Suppression
**What to do:** Trigger the same suggestion twice rapidly.

**Expected:** Second trigger should be suppressed (silent) due to cooldown.

---

## Test 8: Integration Scenario

### Full Development Session Test

1. **Setup:**
   ```bash
   cd "/Users/chris/cc-projects/claude code terminal plugin"
   export WORKFLOW_PILOT_DEBUG=1
   export WORKFLOW_PILOT_MODE=guidance
   ```

2. **Start Claude Code** and verify hook output appears.

3. **Test dangerous command blocking:**
   ```
   "Run git push --force origin main"
   ```
   Should be BLOCKED.

4. **Edit a code file:**
   ```
   "Add a TODO comment to src/index.ts"
   ```
   Should succeed, may trigger test reminder.

5. **Edit a config file:**
   ```
   "Add a comment to tsconfig.json"
   ```
   Should succeed, NO test reminder (config only).

6. **Check cooldown state:**
   ```bash
   cat /tmp/workflow-pilot-state.json
   ```

7. **Verify all hooks working** by checking log:
   ```bash
   tail -50 /tmp/workflow-pilot.log
   ```

---

## Test Results Checklist

After completing tests, mark off:

- [ ] **Test 1.1:** UserPromptSubmit hook fires
- [ ] **Test 1.2:** PreToolUse blocks dangerous commands
- [ ] **Test 1.3:** PostToolUse provides feedback
- [ ] **Test 2.1:** Project config loads from .workflow-pilot.json
- [ ] **Test 2.2:** Config precedence correct (env > file)
- [ ] **Test 3.1:** Minimal mode shows only critical alerts
- [ ] **Test 3.2:** Training mode shows all alerts with explanations
- [ ] **Test 3.3:** Guidance mode balanced output
- [ ] **Test 4.1:** TypeScript/Node project detected
- [ ] **Test 4.2:** React project detected
- [ ] **Test 4.3:** Python project detected
- [ ] **Test 5.1:** Code changes trigger test reminder
- [ ] **Test 5.2:** Config-only changes skip test reminder
- [ ] **Test 5.3:** Sensitive files detected correctly
- [ ] **Test 6.1:** PRD parser extracts requirements
- [ ] **Test 6.2:** Progress tracker persists state
- [ ] **Test 7.1:** Cooldown state file exists
- [ ] **Test 7.2:** Rapid triggers are suppressed
- [ ] **Test 8:** Full integration scenario passes

---

## Current Architecture

```
src/
├── index.ts              # Hook entry point
├── config/
│   ├── schema.ts         # TypeScript interfaces
│   ├── loader.ts         # Config loading chain
│   ├── project-detector.ts  # Project type detection
│   └── preset-loader.ts  # Rule presets
├── state/
│   └── cooldown.ts       # Cooldown + file tracking
├── utils/
│   └── file-classifier.ts  # File type classification
├── prd/
│   ├── parser.ts         # PRD markdown parser
│   └── tracker.ts        # Progress persistence
├── analyzer/
│   ├── ai-analyzer.ts    # Claude API integration
│   ├── context-builder.ts
│   └── transcript-parser.ts
├── rules/
│   ├── index.ts          # 25 rule definitions
│   └── intent-matcher.ts # Fuzzy security matching
└── output/
    ├── suggestion-formatter.ts
    └── status-writer.ts

config/
├── default.json
└── presets/
    ├── base.json
    ├── frontend.json
    ├── node.json
    ├── python.json
    └── typescript.json
```

---

## Key Commands Reference

```bash
# Build
npm run build

# Test (173 tests)
npm test -- --run

# Install hooks
node scripts/install.js

# Debug mode
export WORKFLOW_PILOT_DEBUG=1

# Mode switching
export WORKFLOW_PILOT_MODE=minimal|training|guidance

# Check hook activity
tail -f /tmp/workflow-pilot.log

# Check cooldown state
cat /tmp/workflow-pilot-state.json
```

---

## After Testing: Next Development Priorities

Once manual testing is complete, remaining work:

1. **Feature 10:** Wire presets into loadConfig()
2. **Features 16-17:** Wire smart test filter into rules
3. **Features 24-25:** PRD file auto-detection and hook integration
4. **Feature 28:** PRD progress display in output

---

## Notes

- All 173 automated tests passing
- Manual testing verifies real-world behavior
- PRD foundation ready for "autonomous senior dev" vision
- File at: `progress/NEXT-SESSION.md`
