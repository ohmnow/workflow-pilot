#!/usr/bin/env node
/**
 * Claude Hero Installer
 *
 * Automatically installs the plugin into Claude Code by:
 * 1. Building the project (if needed)
 * 2. Updating Claude Code's settings.json with hook configuration
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const PLUGIN_DIR = path.resolve(__dirname, '..');
const CLAUDE_SETTINGS_PATH = path.join(process.env.HOME, '.claude', 'settings.json');

/**
 * Operating modes with descriptions
 */
const MODES = {
  guidance: {
    name: 'guidance',
    label: 'Guidance (default)',
    description: 'Balanced suggestions - "Claude guiding Claude" with senior dev oversight',
  },
  minimal: {
    name: 'minimal',
    label: 'Minimal',
    description: 'Safety only - critical security alerts, no other suggestions',
  },
  training: {
    name: 'training',
    label: 'Training',
    description: 'Learning assistant - detailed explanations and best practice tips',
  },
  orchestrator: {
    name: 'orchestrator',
    label: 'Orchestrator (10X Mode)',
    description: '10X pair programmer - guides you from idea to production-ready app',
  },
};

/**
 * Generate hook configuration for the plugin
 */
function getHookConfig(pluginDir) {
  const command = `node "${path.join(pluginDir, 'dist', 'index.js')}"`;
  return {
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command
          }
        ]
      }
    ],
    PreToolUse: [
      {
        matcher: ".*",
        hooks: [
          {
            type: "command",
            command
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
            command
          }
        ]
      }
    ]
  };
}

function log(msg) {
  console.log(`[Claude Hero] ${msg}`);
}

function error(msg) {
  console.error(`[Claude Hero Error] ${msg}`);
}

/**
 * Prompt user for mode selection (interactive)
 */
async function promptForMode(rl) {
  return new Promise((resolve) => {
    console.log('');
    console.log('Choose your operating mode:');
    console.log('');

    const modeList = Object.values(MODES);
    modeList.forEach((mode, i) => {
      console.log(`  ${i + 1}. ${mode.label}`);
      console.log(`     ${mode.description}`);
      console.log('');
    });

    rl.question('Enter choice (1-4) [1]: ', (answer) => {
      const choice = parseInt(answer, 10) || 1;
      const selectedMode = modeList[choice - 1] || modeList[0];
      resolve(selectedMode.name);
    });
  });
}

/**
 * Create readline interface for user input
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Write config file with selected mode
 */
function writeConfigFile(_fs, configPath, mode) {
  const config = {
    mode,
    // Other settings will use defaults from schema
  };

  _fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

/**
 * Install the Claude Hero plugin
 * @param {Object} options - Installation options
 * @param {Object} options.fs - File system module (for testing)
 * @param {Function} options.execSync - execSync function (for testing)
 * @param {string} options.pluginDir - Plugin directory
 * @param {string} options.settingsPath - Claude settings path
 * @param {string} options.mode - Operating mode (skip prompt if provided)
 * @param {boolean} options.interactive - Enable interactive mode selection
 */
async function install(options = {}) {
  const _fs = options.fs || fs;
  const _execSync = options.execSync || execSync;
  const pluginDir = options.pluginDir || PLUGIN_DIR;
  const settingsPath = options.settingsPath || CLAUDE_SETTINGS_PATH;
  const hookConfig = getHookConfig(pluginDir);
  const interactive = options.interactive !== false; // Default to interactive

  log('Starting installation...');

  // Step 1: Check if dist exists, build if not
  const distPath = path.join(pluginDir, 'dist', 'index.js');
  if (!_fs.existsSync(distPath)) {
    log('Building project...');
    _execSync('npm run build', { cwd: pluginDir, stdio: 'inherit' });
  } else {
    log('Project already built.');
  }

  // Step 2: Select operating mode
  let selectedMode = options.mode || 'guidance';
  let rl = null;

  if (interactive && !options.mode) {
    rl = createReadlineInterface();
    selectedMode = await promptForMode(rl);
  }

  log(`Selected mode: ${selectedMode}`);

  // Step 3: Write plugin config file
  const configPath = path.join(pluginDir, '.claude-hero.json');
  writeConfigFile(_fs, configPath, selectedMode);
  log(`Configuration saved to ${configPath}`);

  if (rl) {
    rl.close();
  }

  // Step 4: Read existing Claude settings
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

  // Step 5: Merge hook configuration
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Check if already installed
  const existingHooks = JSON.stringify(settings.hooks);
  if (existingHooks.includes('claude-hero') || existingHooks.includes(pluginDir)) {
    log('Claude Hero hooks already configured. Updating...');
  }

  // Merge hooks (this will overwrite existing UserPromptSubmit/PostToolUse)
  // In a production version, we'd want to append rather than replace
  settings.hooks = {
    ...settings.hooks,
    ...hookConfig
  };

  // Step 6: Write updated settings
  log('Writing updated Claude Code settings...');
  _fs.writeFileSync(
    settingsPath,
    JSON.stringify(settings, null, 2),
    'utf-8'
  );

  log('');
  log('✅ Installation complete!');
  log('');
  log(`Mode: ${MODES[selectedMode]?.label || selectedMode}`);
  log('');

  // Mode-specific messages
  if (selectedMode === 'orchestrator') {
    log('🎯 Orchestrator Mode Active!');
    log('');
    log('Claude Hero will guide you from idea to production:');
    log('  • Feature planning with blocking dependencies');
    log('  • Sprint-based development cycles');
    log('  • Production readiness checks');
    log('');
    log('Start a new Claude Code session and describe what you want to build!');
  } else {
    log('Claude Hero is now active. It will provide suggestions on:');
    log('  • Testing workflow (run tests after code changes)');
    log('  • Git workflow (commit reminders, PR suggestions)');
    log('  • Claude Code best practices (Plan mode, subagents, skills)');
  }

  log('');
  log('To change mode, edit .claude-hero.json or run installer again.');
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
module.exports = {
  install,
  getHookConfig,
  promptForMode,
  writeConfigFile,
  PLUGIN_DIR,
  CLAUDE_SETTINGS_PATH,
  MODES,
};

// Run if executed directly
if (require.main === module) {
  main();
}
