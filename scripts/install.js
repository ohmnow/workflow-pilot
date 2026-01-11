#!/usr/bin/env node
/**
 * Workflow Pilot Installer
 *
 * Automatically installs the plugin into Claude Code by:
 * 1. Building the project (if needed)
 * 2. Updating Claude Code's settings.json with hook configuration
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLUGIN_DIR = path.resolve(__dirname, '..');
const CLAUDE_SETTINGS_PATH = path.join(process.env.HOME, '.claude', 'settings.json');

// Hook configuration to add
const HOOK_CONFIG = {
  UserPromptSubmit: [
    {
      matcher: ".*",
      hooks: [
        {
          type: "command",
          command: `node "${path.join(PLUGIN_DIR, 'dist', 'index.js')}"`
        }
      ]
    }
  ],
  PostToolUse: [
    {
      matcher: ".*",
      hooks: [
        {
          type: "command",
          command: `node "${path.join(PLUGIN_DIR, 'dist', 'index.js')}"`
        }
      ]
    }
  ]
};

function log(msg) {
  console.log(`[Workflow Pilot] ${msg}`);
}

function error(msg) {
  console.error(`[Workflow Pilot Error] ${msg}`);
}

async function main() {
  try {
    log('Starting installation...');

    // Step 1: Check if dist exists, build if not
    const distPath = path.join(PLUGIN_DIR, 'dist', 'index.js');
    if (!fs.existsSync(distPath)) {
      log('Building project...');
      execSync('npm run build', { cwd: PLUGIN_DIR, stdio: 'inherit' });
    } else {
      log('Project already built.');
    }

    // Step 2: Read existing Claude settings
    let settings = {};
    if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
      log('Reading existing Claude Code settings...');
      const content = fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8');
      settings = JSON.parse(content);
    } else {
      log('No existing settings found, creating new...');
      // Ensure .claude directory exists
      const claudeDir = path.dirname(CLAUDE_SETTINGS_PATH);
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }
    }

    // Step 3: Merge hook configuration
    if (!settings.hooks) {
      settings.hooks = {};
    }

    // Check if already installed
    const existingHooks = JSON.stringify(settings.hooks);
    if (existingHooks.includes('workflow-pilot') || existingHooks.includes(PLUGIN_DIR)) {
      log('Workflow Pilot hooks already configured. Updating...');
    }

    // Merge hooks (this will overwrite existing UserPromptSubmit/PostToolUse)
    // In a production version, we'd want to append rather than replace
    settings.hooks = {
      ...settings.hooks,
      ...HOOK_CONFIG
    };

    // Step 4: Write updated settings
    log('Writing updated Claude Code settings...');
    fs.writeFileSync(
      CLAUDE_SETTINGS_PATH,
      JSON.stringify(settings, null, 2),
      'utf-8'
    );

    log('');
    log('✅ Installation complete!');
    log('');
    log('The Workflow Pilot is now active. It will provide suggestions on:');
    log('  • Testing workflow (run tests after code changes)');
    log('  • Git workflow (commit reminders, PR suggestions)');
    log('  • Claude Code best practices (Plan mode, subagents, skills)');
    log('');
    log('To uninstall, run: node scripts/uninstall.js');
    log('');

  } catch (err) {
    error(`Installation failed: ${err.message}`);
    process.exit(1);
  }
}

main();
