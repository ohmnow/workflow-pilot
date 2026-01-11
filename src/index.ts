#!/usr/bin/env node
/**
 * Claude Code Workflow Pilot - Hook Entry Point
 * Version: 0.3.0
 *
 * This is the main entry point for the plugin's hooks.
 * It receives JSON from stdin containing:
 * - session_id: Current session identifier
 * - transcript_path: Path to the JSONL transcript file
 * - prompt: User's prompt (for UserPromptSubmit)
 * - tool_name: Tool that was used (for PostToolUse)
 * - tool_input: Tool input parameters (for PostToolUse)
 * - tool_output: Tool output (for PostToolUse)
 * - hook_event_name: The hook event type
 *
 * Modes:
 * - minimal: Safety only (critical alerts)
 * - training: Learning assistant with explanations
 * - guidance: "Claude guiding Claude" with senior dev oversight
 */

import { parseTranscript } from './analyzer/transcript-parser.js';
import { buildContext } from './analyzer/context-builder.js';
import { analyzeWithAI } from './analyzer/ai-analyzer.js';
import { evaluateRules, RuleSuggestion } from './rules/index.js';
import { formatSuggestion } from './output/suggestion-formatter.js';
import { writeStatusFile } from './output/status-writer.js';
import { loadConfig, isTierEnabled, isCategoryEnabled, getMode, isTrainingMode } from './config/loader.js';
import { canTrigger, recordTrigger } from './state/cooldown.js';

interface HookInput {
  session_id: string;
  transcript_path: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  hook_event_name: 'UserPromptSubmit' | 'PostToolUse' | 'PreToolUse' | 'Stop';
}

interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
  };
}

/**
 * Map rule categories to config category names
 */
function mapCategory(ruleCategory: string): 'testing' | 'git' | 'security' | 'claudeCode' | 'refactoring' {
  const mapping: Record<string, 'testing' | 'git' | 'security' | 'claudeCode' | 'refactoring'> = {
    'testing': 'testing',
    'git': 'git',
    'security': 'security',
    'claude-code': 'claudeCode',
    'refactoring': 'refactoring',
  };
  return mapping[ruleCategory] || 'claudeCode';
}

/**
 * Filter suggestions based on config settings and cooldowns
 */
function filterSuggestions(suggestions: RuleSuggestion[]): RuleSuggestion[] {
  const mode = getMode();

  return suggestions.filter((suggestion) => {
    // Check tier enablement
    if (!isTierEnabled(suggestion.level)) {
      return false;
    }

    // Check category enablement
    const category = mapCategory(suggestion.type);
    if (!isCategoryEnabled(category)) {
      return false;
    }

    // Critical alerts bypass cooldowns
    if (suggestion.level === 'critical') {
      return true;
    }

    // In minimal mode, only critical alerts pass
    if (mode === 'minimal') {
      return false;
    }

    // Check cooldown using rule ID
    const ruleId = suggestion.ruleId || `${suggestion.source}-${suggestion.type}`;
    if (!canTrigger(ruleId)) {
      return false;
    }

    return true;
  });
}

/**
 * Record that filtered suggestions were shown
 */
function recordShownSuggestions(suggestions: RuleSuggestion[]): void {
  for (const suggestion of suggestions) {
    // Don't record cooldown for critical alerts
    if (suggestion.level === 'critical') continue;

    const ruleId = suggestion.ruleId || `${suggestion.source}-${suggestion.type}`;
    recordTrigger(ruleId);
  }
}

/**
 * Show training mode intent capture prompt
 */
function showTrainingIntentPrompt(): void {
  const config = loadConfig();
  if (!config.training.askIntent) return;

  const cyanBg = '\x1b[48;5;30m';
  const whiteText = '\x1b[38;5;255m';
  const reset = '\x1b[0m';

  const boxWidth = 56;
  const line = '─'.repeat(boxWidth);

  console.error('');
  console.error(`${cyanBg}${whiteText}╭${line}╮${reset}`);

  const header = '🎓 Training Mode';
  const headerPad = Math.floor((boxWidth - header.length) / 2);
  console.error(`${cyanBg}${whiteText}│${' '.repeat(headerPad)}${header}${' '.repeat(boxWidth - headerPad - header.length)}│${reset}`);

  console.error(`${cyanBg}${whiteText}├${line}┤${reset}`);

  const messages = [
    'What are you trying to accomplish today?',
    '',
    'Workflow Pilot will guide you through',
    'Claude Code best practices as you work.',
  ];

  for (const msg of messages) {
    const padding = boxWidth - msg.length - 2;
    console.error(`${cyanBg}${whiteText}│ ${msg}${' '.repeat(Math.max(0, padding))}│${reset}`);
  }

  console.error(`${cyanBg}${whiteText}╰${line}╯${reset}`);
  console.error('');
}

async function main(): Promise<void> {
  try {
    // Log hook invocation to file for verification
    const fs = await import('fs');
    const logFile = '/tmp/workflow-pilot.log';
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `${timestamp} - Hook invoked\n`);

    // Read JSON from stdin
    const inputData = await readStdin();
    const input: HookInput = JSON.parse(inputData);

    // Log the event
    fs.appendFileSync(logFile, `${timestamp} - Event: ${input.hook_event_name}\n`);

    // Debug mode - output to stderr so it doesn't interfere with hook output
    const DEBUG = process.env.WORKFLOW_PILOT_DEBUG === '1';
    if (DEBUG) {
      console.error('[WP Debug] Input:', JSON.stringify(input, null, 2));
    }

    // Parse the transcript to get conversation history
    const transcript = await parseTranscript(input.transcript_path);
    if (DEBUG) {
      console.error('[WP Debug] Transcript messages:', transcript.messages.length);
    }

    // Build context for analysis
    const context = buildContext({
      transcript,
      currentPrompt: input.prompt,
      hookEvent: input.hook_event_name,
      toolInfo: input.tool_name
        ? {
            name: input.tool_name,
            input: input.tool_input,
            output: input.tool_output,
          }
        : undefined,
    });

    if (DEBUG) {
      console.error('[WP Debug] Context patterns:', context.patterns);
      console.error('[WP Debug] Has uncommitted work:', context.hasUncommittedWork);
      console.error('[WP Debug] Recent tool uses:', context.recentToolUses.length);
    }

    // Load configuration
    const config = loadConfig();
    const mode = getMode();

    if (DEBUG) {
      console.error('[WP Debug] Mode:', mode);
      console.error('[WP Debug] Config:', JSON.stringify(config, null, 2));
    }

    // Training mode: Show intent prompt at start of conversation
    if (isTrainingMode() &&
        input.hook_event_name === 'UserPromptSubmit' &&
        context.conversationLength <= 3) {
      showTrainingIntentPrompt();
    }

    // Get suggestions from rule engine and AI
    const ruleSuggestions = evaluateRules(context);
    if (DEBUG) {
      console.error('[WP Debug] Rule suggestions:', ruleSuggestions.length);
    }

    // Only call AI if enabled in config
    const aiSuggestions = config.ai.enabled ? await analyzeWithAI(context) : [];

    // Combine all suggestions
    const allSuggestions = [...ruleSuggestions, ...aiSuggestions];

    if (DEBUG) {
      console.error('[WP Debug] Total suggestions before filter:', allSuggestions.length);
    }

    // Filter suggestions based on config and cooldowns
    const filteredSuggestions = filterSuggestions(allSuggestions);

    if (DEBUG) {
      console.error('[WP Debug] Suggestions after filter:', filteredSuggestions.length);
    }

    // Write status file for status line integration
    writeStatusFile(context, filteredSuggestions, input.session_id);

    // Separate filtered suggestions by level
    const criticalAlerts = filteredSuggestions.filter(s => s.level === 'critical');
    const warningSuggestions = filteredSuggestions.filter(s => s.level === 'warning');
    const infoTips = filteredSuggestions.filter(s => s.level === 'info');

    // Record that we showed these suggestions (for cooldown tracking)
    recordShownSuggestions(filteredSuggestions);

    const displayTime = new Date().toLocaleTimeString();

    // CRITICAL ALERTS: Show inline to user via stderr + exit code 1
    if (criticalAlerts.length > 0) {
      // ANSI colors: Red theme for critical alerts
      const redBg = '\x1b[48;5;196m';
      const darkRedBg = '\x1b[48;5;52m';
      const whiteText = '\x1b[38;5;255m';
      const whiteBold = '\x1b[1;37m';
      const reset = '\x1b[0m';
      const dim = '\x1b[2m';

      // Box width (adjust based on terminal, 60 chars is safe)
      const boxWidth = 60;
      const horizontalLine = '━'.repeat(boxWidth);
      const emptyLine = ' '.repeat(boxWidth);

      console.error('');
      console.error('');

      // Top border
      console.error(`${redBg}${whiteText}┏${horizontalLine}┓${reset}`);

      // Empty padding line
      console.error(`${redBg}${whiteText}┃${emptyLine}┃${reset}`);

      // Header
      const header = '🚨 CRITICAL ALERT';
      const headerPadding = Math.floor((boxWidth - header.length) / 2);
      const headerLine = ' '.repeat(headerPadding) + header + ' '.repeat(boxWidth - headerPadding - header.length);
      console.error(`${redBg}${whiteBold}┃${headerLine}┃${reset}`);

      // Empty padding line
      console.error(`${redBg}${whiteText}┃${emptyLine}┃${reset}`);

      // Separator
      console.error(`${redBg}${whiteText}┃${'─'.repeat(boxWidth)}┃${reset}`);

      // Empty padding line
      console.error(`${redBg}${whiteText}┃${emptyLine}┃${reset}`);

      // Alert messages
      for (const alert of criticalAlerts) {
        // Word wrap the suggestion to fit in box
        const words = alert.suggestion.split(' ');
        let currentLine = '';
        const lines: string[] = [];

        for (const word of words) {
          if ((currentLine + ' ' + word).trim().length <= boxWidth - 4) {
            currentLine = (currentLine + ' ' + word).trim();
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);

        for (const line of lines) {
          const linePadding = boxWidth - line.length - 2;
          console.error(`${redBg}${whiteText}┃  ${line}${' '.repeat(linePadding)}┃${reset}`);
        }

        if (alert.reasoning) {
          // Empty line before reasoning
          console.error(`${redBg}${whiteText}┃${emptyLine}┃${reset}`);
          const reasoningLines: string[] = [];
          const reasoningWords = alert.reasoning.split(' ');
          let reasoningLine = '';
          for (const word of reasoningWords) {
            if ((reasoningLine + ' ' + word).trim().length <= boxWidth - 6) {
              reasoningLine = (reasoningLine + ' ' + word).trim();
            } else {
              if (reasoningLine) reasoningLines.push(reasoningLine);
              reasoningLine = word;
            }
          }
          if (reasoningLine) reasoningLines.push(reasoningLine);

          for (const line of reasoningLines) {
            const linePadding = boxWidth - line.length - 4;
            console.error(`${darkRedBg}${whiteText}┃    ${line}${' '.repeat(linePadding)}┃${reset}`);
          }
        }
      }

      // Empty padding line
      console.error(`${redBg}${whiteText}┃${emptyLine}┃${reset}`);

      // Bottom border
      console.error(`${redBg}${whiteText}┗${horizontalLine}┛${reset}`);

      console.error('');
      console.error('');

      // Exit with code 1 so stderr shows to user
      // Note: This means context won't be injected to Claude for this turn
      process.exit(1);
    }

    // INFO TIPS: Educational content for the user (subtle blue theme)
    if (infoTips.length > 0) {
      const blueBg = '\x1b[48;5;24m';   // Dark blue background
      const lightText = '\x1b[38;5;153m'; // Light blue text
      const reset = '\x1b[0m';

      const boxWidth = 60;
      const thinLine = '─'.repeat(boxWidth);

      console.error('');
      console.error(`${blueBg}${lightText}╭${thinLine}╮${reset}`);

      // Header
      const header = '📚 Did You Know?';
      const headerPadding = Math.floor((boxWidth - header.length) / 2);
      const headerLine = ' '.repeat(headerPadding) + header + ' '.repeat(boxWidth - headerPadding - header.length);
      console.error(`${blueBg}${lightText}│${headerLine}│${reset}`);

      console.error(`${blueBg}${lightText}├${thinLine}┤${reset}`);

      // Show tips (limit to 1 to keep it subtle)
      for (const tip of infoTips.slice(0, 1)) {
        const words = tip.suggestion.split(' ');
        let currentLine = '';
        const lines: string[] = [];

        for (const word of words) {
          if ((currentLine + ' ' + word).trim().length <= boxWidth - 4) {
            currentLine = (currentLine + ' ' + word).trim();
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);

        for (const line of lines) {
          const padding = boxWidth - line.length - 2;
          console.error(`${blueBg}${lightText}│ ${line}${' '.repeat(Math.max(0, padding))}│${reset}`);
        }
      }

      console.error(`${blueBg}${lightText}╰${thinLine}╯${reset}`);
      console.error('');
    }

    // WARNING SUGGESTIONS: Show to user AND inject context to Claude (gold theme)
    if (warningSuggestions.length > 0) {
      const goldBg = '\x1b[48;5;222m';
      const darkText = '\x1b[38;5;236m';
      const reset = '\x1b[0m';

      const boxWidth = 56;
      const thinLine = '─'.repeat(boxWidth);

      // Visual output to stderr (user sees this)
      console.error('');
      console.error(`${goldBg}${darkText}╭${thinLine}╮${reset}`);

      // Header
      const header = '💡 Workflow Pilot';
      const headerPadding = Math.floor((boxWidth - header.length) / 2);
      const headerLine = ' '.repeat(headerPadding) + header + ' '.repeat(boxWidth - headerPadding - header.length);
      console.error(`${goldBg}${darkText}│${headerLine}│${reset}`);

      console.error(`${goldBg}${darkText}├${thinLine}┤${reset}`);

      // Show each suggestion
      for (const suggestion of warningSuggestions.slice(0, 3)) {
        const icon = suggestion.priority === 'high' ? '⚠️' : suggestion.priority === 'medium' ? '→' : '·';

        // Word wrap
        const text = `${icon} ${suggestion.suggestion}`;
        const words = text.split(' ');
        let currentLine = '';
        const lines: string[] = [];

        for (const word of words) {
          if ((currentLine + ' ' + word).trim().length <= boxWidth - 4) {
            currentLine = (currentLine + ' ' + word).trim();
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);

        for (const line of lines) {
          const padding = boxWidth - line.length - 2;
          console.error(`${goldBg}${darkText}│ ${line}${' '.repeat(Math.max(0, padding))}│${reset}`);
        }
      }

      console.error(`${goldBg}${darkText}╰${thinLine}╯${reset}`);
      console.error('');

      // Also inject context to Claude via stdout
      const formattedSuggestion = formatSuggestion(warningSuggestions, context);

      const output: HookOutput = {
        hookSpecificOutput: {
          hookEventName: input.hook_event_name,
          additionalContext: formattedSuggestion,
        },
      };

      console.log(JSON.stringify(output));
    }

    // Exit successfully - context goes to Claude
    process.exit(0);
  } catch (error) {
    // Log error but don't fail the hook (allow Claude to continue)
    console.error('Workflow Pilot Error:', error);
    process.exit(0);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', (err) => {
      reject(err);
    });
  });
}

main();
