#!/usr/bin/env node
/**
 * Claude Code Workflow Pilot - Hook Entry Point
 * Version: 0.2.0
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
 */

import { parseTranscript } from './analyzer/transcript-parser.js';
import { buildContext } from './analyzer/context-builder.js';
import { analyzeWithAI } from './analyzer/ai-analyzer.js';
import { evaluateRules } from './rules/index.js';
import { formatSuggestion } from './output/suggestion-formatter.js';

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

    // Get suggestions from rule engine and AI
    const ruleSuggestions = evaluateRules(context);
    if (DEBUG) {
      console.error('[WP Debug] Rule suggestions:', ruleSuggestions.length);
    }
    const aiSuggestions = await analyzeWithAI(context);

    // Combine and format suggestions
    const allSuggestions = [...ruleSuggestions, ...aiSuggestions];
    if (DEBUG) {
      console.error('[WP Debug] Total suggestions:', allSuggestions.length);
    }

    if (allSuggestions.length > 0) {
      const formattedSuggestion = formatSuggestion(allSuggestions, context);

      const output: HookOutput = {
        hookSpecificOutput: {
          hookEventName: input.hook_event_name,
          additionalContext: formattedSuggestion,
        },
      };

      console.log(JSON.stringify(output));
    }

    // Exit successfully
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
