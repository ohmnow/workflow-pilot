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

/**
 * Generate hook configuration for the plugin
 */
function getHookConfig(pluginDir) {
  return {
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${path.join(pluginDir, 'dist', 'index.js')}"`
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
            command: `node "${path.join(pluginDir, 'dist', 'index.js')}"`
          }
        ]
      }
    ]
  };
}

function log(msg) {
  console.log(`[Workflow Pilot] ${msg}`);
}

function error(msg) {
  console.error(`[Workflow Pilot Error] ${msg}`);
}

/**
 * Install the Workflow Pilot plugin
 * @param {Object} options - Installation options
 * @param {Object} options.fs - File system module (for testing)
 * @param {Function} options.execSync - execSync function (for testing)
 * @param {string} options.pluginDir - Plugin directory
 * @param {string} options.settingsPath - Claude settings path
 */
async function install(options = {}) {
  const _fs = options.fs || fs;
  const _execSync = options.execSync || execSync;
  const pluginDir = options.pluginDir || PLUGIN_DIR;
  const settingsPath = options.settingsPath || CLAUDE_SETTINGS_PATH;
  const hookConfig = getHookConfig(pluginDir);

  log('Starting installation...');

  // Step 1: Check if dist exists, build if not
  const distPath = path.join(pluginDir, 'dist', 'index.js');
  if (!_fs.existsSync(distPath)) {
    log('Building project...');
    _execSync('npm run build', { cwd: pluginDir, stdio: 'inherit' });
  } else {
    log('Project already built.');
  }

  // Step 2: Read existing Claude settings
  let settings = {};
  if (_fs.existsSync(settingsPath)) {
    log('Reading existing Claude Code settings...');
    const content = _fs.readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  } else {
    log('No existing settings found, creating new...');
    // Ensure .claude directory exists
    const claudeDir = path.dirname(settingsPath);
    if (!_fs.existsSync(claudeDir)) {
      _fs.mkdirSync(claudeDir, { recursive: true });
    }
  }

  // Step 3: Merge hook configuration
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Check if already installed
  const existingHooks = JSON.stringify(settings.hooks);
  if (existingHooks.includes('workflow-pilot') || existingHooks.includes(pluginDir)) {
    log('Workflow Pilot hooks already configured. Updating...');
  }

  // Merge hooks (this will overwrite existing UserPromptSubmit/PostToolUse)
  // In a production version, we'd want to append rather than replace
  settings.hooks = {
    ...settings.hooks,
    ...hookConfig
  };

  // Step 4: Write updated settings
  log('Writing updated Claude Code settings...');
  _fs.writeFileSync(
    settingsPath,
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

  return settings;
}

async function main() {
  try {
    await install();
  } catch (err) {
    error(`Installation failed: ${err.message}`);
    process.exit(1);
  }
}

// Export for testing
module.exports = { install, getHookConfig, PLUGIN_DIR, CLAUDE_SETTINGS_PATH };

// Run if executed directly
if (require.main === module) {
  main();
}
