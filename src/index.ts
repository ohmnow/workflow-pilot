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

  const CYAN = '\x1b[36m';
  const DIM = '\x1b[2m';
  const RESET = '\x1b[0m';
  const BORDER = `${CYAN}┃${RESET}`;

  console.error('');
  console.error(`${BORDER}`);
  console.error(`${BORDER} ${CYAN}🎓 Training Mode${RESET}`);
  console.error(`${BORDER}`);
  console.error(`${BORDER}   What are you trying to accomplish today?`);
  console.error(`${BORDER}`);
  console.error(`${BORDER}   ${DIM}Workflow Pilot will guide you through${RESET}`);
  console.error(`${BORDER}   ${DIM}Claude Code best practices as you work.${RESET}`);
  console.error(`${BORDER}`);
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

    // ===========================================
    // LEFT BORDER VISUAL STYLE
    // All plugin output uses ┃ left border to distinguish from Claude Code native output
    // ===========================================
    const RESET = '\x1b[0m';
    const RED = '\x1b[31m';
    const YELLOW = '\x1b[33m';
    const CYAN = '\x1b[36m';
    const DIM = '\x1b[2m';
    const BOLD = '\x1b[1m';

    // Plugin identifier - consistent left border
    const PLUGIN_BORDER = `${CYAN}┃${RESET}`;
    const PLUGIN_HEADER = `${PLUGIN_BORDER} ${DIM}Workflow Pilot${RESET}`;

    // CRITICAL ALERTS: Show inline to user via stderr + exit code 1
    if (criticalAlerts.length > 0) {
      console.error('');
      console.error(`${PLUGIN_BORDER}`);
      console.error(`${PLUGIN_BORDER} ${RED}${BOLD}🚨 CRITICAL ALERT${RESET}`);
      console.error(`${PLUGIN_BORDER}`);

      for (const alert of criticalAlerts) {
        console.error(`${PLUGIN_BORDER}   ${RED}→${RESET} ${alert.suggestion}`);
        if (alert.reasoning) {
          console.error(`${PLUGIN_BORDER}     ${DIM}${alert.reasoning}${RESET}`);
        }
      }

      console.error(`${PLUGIN_BORDER}`);
      console.error('');

      // Exit with code 1 so stderr shows to user
      // Note: This means context won't be injected to Claude for this turn
      process.exit(1);
    }

    // INFO TIPS: Educational content for the user (subtle, same border)
    if (infoTips.length > 0) {
      console.error('');
      console.error(`${PLUGIN_BORDER}`);
      console.error(`${PLUGIN_BORDER} ${CYAN}💡 Tip${RESET}`);

      // Show tips (limit to 1 to keep it subtle)
      for (const tip of infoTips.slice(0, 1)) {
        console.error(`${PLUGIN_BORDER}   ${DIM}${tip.suggestion}${RESET}`);
      }

      console.error(`${PLUGIN_BORDER}`);
      console.error('');
    }

    // WARNING SUGGESTIONS: Show to user AND inject context to Claude
    if (warningSuggestions.length > 0) {
      console.error('');
      console.error(`${PLUGIN_BORDER}`);
      console.error(`${PLUGIN_BORDER} ${DIM}Workflow Pilot${RESET} ${DIM}${displayTime}${RESET}`);

      // Show each suggestion
      for (const suggestion of warningSuggestions.slice(0, 3)) {
        const icon = suggestion.priority === 'high' ? `${YELLOW}⚠${RESET}` : `${YELLOW}→${RESET}`;
        console.error(`${PLUGIN_BORDER}   ${icon} ${suggestion.suggestion}`);
        if (suggestion.reasoning) {
          console.error(`${PLUGIN_BORDER}     ${DIM}${suggestion.reasoning}${RESET}`);
        }
      }

      console.error(`${PLUGIN_BORDER}`);
      console.error('');

      // Also inject context to Claude via stdout
      // Pass training mode config if enabled
      const config = loadConfig();
      const formattedSuggestion = formatSuggestion(warningSuggestions, context, {
        trainingMode: isTrainingMode() ? {
          explainSuggestions: config.training.explainSuggestions,
          showExamples: config.training.showExamples,
        } : undefined,
      });

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
