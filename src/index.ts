#!/usr/bin/env node
/**
 * Claude Code Claude Hero - Hook Entry Point
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
import { printBox, formatBox } from './output/box-formatter.js';
import { writeStatusFile } from './output/status-writer.js';
import { loadConfig, isTierEnabled, isCategoryEnabled, getMode, isTrainingMode } from './config/loader.js';
import { canTrigger, recordTrigger } from './state/cooldown.js';
import { isOrchestratorMode } from './orchestrator/index.js';
import {
  handleUserPromptSubmit as handleOrchestratorPrompt,
  handlePreToolUse as handleOrchestratorPreTool,
  handlePostToolUse as handleOrchestratorPostTool,
} from './orchestrator/hooks.js';

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

  printBox([
    'What are you trying to accomplish today?',
    '',
    'Claude Hero will guide you through',
    'Claude Code best practices as you work.',
  ], {
    title: 'Training Mode',
    type: 'tip',
  });
}

async function main(): Promise<void> {
  try {
    // Log hook invocation to file for verification
    const fs = await import('fs');
    const logFile = '/tmp/claude-hero.log';
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `${timestamp} - Hook invoked\n`);

    // Read JSON from stdin
    const inputData = await readStdin();
    const input: HookInput = JSON.parse(inputData);

    // Log the event
    fs.appendFileSync(logFile, `${timestamp} - Event: ${input.hook_event_name}\n`);

    // Debug mode - output to stderr so it doesn't interfere with hook output
    const DEBUG = process.env.CLAUDE_HERO_DEBUG === '1';
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

    // Orchestrator mode: Handle phase-aware guidance
    let orchestratorContext: string | undefined;
    if (isOrchestratorMode()) {
      if (input.hook_event_name === 'UserPromptSubmit' && input.prompt) {
        const orchResult = await handleOrchestratorPrompt(input.prompt);

        // Show user message if any
        if (orchResult.userMessage) {
          const title = orchResult.statusSummary
            ? `Orchestrator - ${orchResult.statusSummary}`
            : 'Orchestrator';
          printBox([orchResult.userMessage], {
            title,
            type: 'info',
          });
        }

        orchestratorContext = orchResult.contextInjection;
      }

      if (input.hook_event_name === 'PreToolUse' && input.tool_name && input.tool_input) {
        const orchResult = handleOrchestratorPreTool(input.tool_name, input.tool_input);

        if (orchResult.block) {
          printBox([orchResult.blockReason || 'Action blocked'], {
            title: 'BLOCKED',
            type: 'critical',
          });
          process.exit(2);
        }
      }

      if (input.hook_event_name === 'PostToolUse' && input.tool_name && input.tool_input) {
        const orchResult = handleOrchestratorPostTool(
          input.tool_name,
          input.tool_input,
          input.tool_output || ''
        );

        if (orchResult.contextInjection) {
          orchestratorContext = (orchestratorContext || '') + '\n' + orchResult.contextInjection;
        }
      }
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
    // ROUNDED BOX VISUAL STYLE
    // All plugin output uses rounded boxes with #caaf5e background
    // ===========================================

    // CRITICAL ALERTS: Show inline to user via stderr + exit code 2
    if (criticalAlerts.length > 0) {
      const alertLines: string[] = [];
      for (const alert of criticalAlerts) {
        alertLines.push(`→ ${alert.suggestion}`);
        if (alert.reasoning) {
          alertLines.push(`  ${alert.reasoning}`);
        }
      }
      printBox(alertLines, {
        title: 'CRITICAL ALERT',
        type: 'critical',
        minWidth: 50,
      });

      // Exit with code 2 to signal "block" to Claude Code
      // This prevents the action from proceeding
      process.exit(2);
    }

    // INFO TIPS: Educational content for the user (subtle)
    if (infoTips.length > 0) {
      // Show tips (limit to 1 to keep it subtle)
      const tip = infoTips[0];
      printBox([tip.suggestion], {
        title: 'Tip',
        type: 'tip',
        minWidth: 35,
      });
    }

    // WARNING SUGGESTIONS: Show to user AND inject context to Claude
    if (warningSuggestions.length > 0) {
      const suggestionLines: string[] = [];
      for (const suggestion of warningSuggestions.slice(0, 3)) {
        const icon = suggestion.priority === 'high' ? '⚠' : '→';
        suggestionLines.push(`${icon} ${suggestion.suggestion}`);
        if (suggestion.reasoning) {
          suggestionLines.push(`  ${suggestion.reasoning}`);
        }
      }
      printBox(suggestionLines, {
        title: `Claude Hero ${displayTime}`,
        type: 'warning',
        minWidth: 45,
      });

      // Also inject context to Claude via stdout
      // Pass training mode config if enabled
      const config = loadConfig();
      const formattedSuggestion = formatSuggestion(warningSuggestions, context, {
        trainingMode: isTrainingMode() ? {
          explainSuggestions: config.training.explainSuggestions,
          showExamples: config.training.showExamples,
        } : undefined,
      });

      // Combine orchestrator context with suggestions if both exist
      const combinedContext = orchestratorContext
        ? `${orchestratorContext}\n\n${formattedSuggestion}`
        : formattedSuggestion;

      const output: HookOutput = {
        hookSpecificOutput: {
          hookEventName: input.hook_event_name,
          additionalContext: combinedContext,
        },
      };

      console.log(JSON.stringify(output));
    }
    // ORCHESTRATOR MODE: Inject context even if no rule suggestions
    else if (orchestratorContext) {
      const output: HookOutput = {
        hookSpecificOutput: {
          hookEventName: input.hook_event_name,
          additionalContext: orchestratorContext,
        },
      };

      console.log(JSON.stringify(output));
    }

    // Exit successfully - context goes to Claude
    process.exit(0);
  } catch (error) {
    // Log error but don't fail the hook (allow Claude to continue)
    console.error('Claude Hero Error:', error);
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
