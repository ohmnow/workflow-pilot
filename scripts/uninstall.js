#!/usr/bin/env node
/**
 * Claude Hero Uninstaller
 *
 * Removes the plugin hooks from Claude Code settings
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_DIR = path.resolve(__dirname, '..');
const CLAUDE_SETTINGS_PATH = path.join(process.env.HOME, '.claude', 'settings.json');

function log(msg) {
  console.log(`[Claude Hero] ${msg}`);
}

function main() {
  try {
    if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) {
      log('No Claude Code settings found. Nothing to uninstall.');
      return;
    }

    log('Reading Claude Code settings...');
    const content = fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8');
    const settings = JSON.parse(content);

    if (!settings.hooks) {
      log('No hooks configured. Nothing to uninstall.');
      return;
    }

    // Remove hooks that reference this plugin
    let modified = false;

    for (const [eventName, hookList] of Object.entries(settings.hooks)) {
      if (Array.isArray(hookList)) {
        const filtered = hookList.filter(hook => {
          const hookStr = JSON.stringify(hook);
          const isClaudeHero = hookStr.includes(PLUGIN_DIR) ||
                                   hookStr.includes('claude-hero') ||
                                   hookStr.includes('claude code terminal plugin');
          if (isClaudeHero) {
            modified = true;
            return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          delete settings.hooks[eventName];
        } else {
          settings.hooks[eventName] = filtered;
        }
      }
    }

    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    if (modified) {
      log('Removing Claude Hero hooks...');
      fs.writeFileSync(
        CLAUDE_SETTINGS_PATH,
        JSON.stringify(settings, null, 2),
        'utf-8'
      );
      log('✅ Uninstallation complete!');
    } else {
      log('Claude Hero hooks not found in settings.');
    }

  } catch (err) {
    console.error(`[Claude Hero Error] Uninstallation failed: ${err.message}`);
    process.exit(1);
  }
}

main();
