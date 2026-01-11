/**
 * Context Builder
 *
 * Assembles context from transcript and current state for analysis.
 */

import {
  Transcript,
  TranscriptMessage,
  getRecentMessages,
  getToolUses,
} from './transcript-parser.js';

export interface ToolInfo {
  name: string;
  input?: Record<string, unknown>;
  output?: string;
}

export interface ContextInput {
  transcript: Transcript;
  currentPrompt?: string;
  hookEvent: string;
  toolInfo?: ToolInfo;
}

export interface AnalysisContext {
  // Recent conversation for understanding state
  recentMessages: TranscriptMessage[];

  // Current user intent
  currentPrompt?: string;

  // What triggered this analysis
  hookEvent: string;

  // Tool information if this is a PostToolUse event
  toolInfo?: ToolInfo;

  // Derived context
  recentToolUses: TranscriptMessage[];
  hasUncommittedWork: boolean;
  lastTestRun?: TranscriptMessage;
  conversationLength: number;

  // Patterns detected
  patterns: ContextPattern[];
}

export interface ContextPattern {
  type: string;
  confidence: number;
  details?: string;
}

/**
 * Build analysis context from transcript and current state
 */
export function buildContext(input: ContextInput): AnalysisContext {
  const recentMessages = getRecentMessages(input.transcript, 20);
  const recentToolUses = getToolUses(input.transcript).slice(-10);

  const context: AnalysisContext = {
    recentMessages,
    currentPrompt: input.currentPrompt,
    hookEvent: input.hookEvent,
    toolInfo: input.toolInfo,
    recentToolUses,
    hasUncommittedWork: detectUncommittedWork(recentToolUses),
    lastTestRun: findLastTestRun(recentToolUses),
    conversationLength: input.transcript.messages.length,
    patterns: [],
  };

  // Detect patterns
  context.patterns = detectPatterns(context);

  return context;
}

/**
 * Detect if there's likely uncommitted work based on tool usage
 */
function detectUncommittedWork(toolUses: TranscriptMessage[]): boolean {
  let hasEdits = false;
  let hasCommit = false;

  for (const tool of toolUses) {
    if (tool.toolName === 'Edit' || tool.toolName === 'Write') {
      hasEdits = true;
    }
    if (
      tool.toolName === 'Bash' &&
      tool.toolInput &&
      typeof tool.toolInput === 'object' &&
      'command' in tool.toolInput &&
      typeof tool.toolInput.command === 'string' &&
      tool.toolInput.command.includes('git commit')
    ) {
      hasCommit = true;
      hasEdits = false; // Reset after commit
    }
  }

  return hasEdits && !hasCommit;
}

/**
 * Find the last test run in tool history
 */
function findLastTestRun(toolUses: TranscriptMessage[]): TranscriptMessage | undefined {
  const testPatterns = ['npm test', 'npm run test', 'vitest', 'jest', 'pytest', 'cargo test'];

  for (let i = toolUses.length - 1; i >= 0; i--) {
    const tool = toolUses[i];
    if (
      tool.toolName === 'Bash' &&
      tool.toolInput &&
      typeof tool.toolInput === 'object' &&
      'command' in tool.toolInput &&
      typeof tool.toolInput.command === 'string'
    ) {
      const command = tool.toolInput.command;
      if (testPatterns.some((pattern) => command.includes(pattern))) {
        return tool;
      }
    }
  }

  return undefined;
}

/**
 * Detect patterns in the conversation context
 */
function detectPatterns(context: AnalysisContext): ContextPattern[] {
  const patterns: ContextPattern[] = [];

  // Pattern: Code was written without tests
  if (hasRecentCodeChanges(context) && !context.lastTestRun) {
    patterns.push({
      type: 'code-without-tests',
      confidence: 0.8,
      details: 'Code changes detected without recent test run',
    });
  }

  // Pattern: Long session without commit
  if (context.hasUncommittedWork && context.conversationLength > 30) {
    patterns.push({
      type: 'long-uncommitted-session',
      confidence: 0.9,
      details: 'Extended session with uncommitted changes',
    });
  }

  // Pattern: Multiple failed attempts
  if (hasMultipleFailures(context)) {
    patterns.push({
      type: 'multiple-failures',
      confidence: 0.85,
      details: 'Multiple failed attempts detected',
    });
  }

  // Pattern: Large task without planning
  if (isLargeTask(context) && !hasUsedPlanMode(context)) {
    patterns.push({
      type: 'large-task-no-plan',
      confidence: 0.7,
      details: 'Complex task without plan mode',
    });
  }

  // Pattern: Multi-file exploration needed
  if (needsExploration(context)) {
    patterns.push({
      type: 'needs-exploration',
      confidence: 0.75,
      details: 'Task may benefit from codebase exploration',
    });
  }

  return patterns;
}

function hasRecentCodeChanges(context: AnalysisContext): boolean {
  return context.recentToolUses.some(
    (t) => t.toolName === 'Edit' || t.toolName === 'Write'
  );
}

function hasMultipleFailures(context: AnalysisContext): boolean {
  const recentBash = context.recentToolUses.filter((t) => t.toolName === 'Bash');
  let failureCount = 0;

  for (const tool of recentBash.slice(-5)) {
    if (
      tool.toolOutput &&
      (tool.toolOutput.includes('error') ||
        tool.toolOutput.includes('Error') ||
        tool.toolOutput.includes('failed') ||
        tool.toolOutput.includes('FAILED'))
    ) {
      failureCount++;
    }
  }

  return failureCount >= 2;
}

function isLargeTask(context: AnalysisContext): boolean {
  const prompt = context.currentPrompt?.toLowerCase() || '';
  const largeTaskIndicators = [
    'implement',
    'create a',
    'build a',
    'add feature',
    'refactor',
    'migrate',
    'redesign',
  ];

  return largeTaskIndicators.some((indicator) => prompt.includes(indicator));
}

function hasUsedPlanMode(context: AnalysisContext): boolean {
  // Check if plan mode or planning was mentioned
  return context.recentMessages.some(
    (m) =>
      m.content.toLowerCase().includes('plan mode') ||
      m.content.toLowerCase().includes('let me plan')
  );
}

function needsExploration(context: AnalysisContext): boolean {
  const prompt = context.currentPrompt?.toLowerCase() || '';
  const explorationIndicators = [
    'where is',
    'find',
    'search for',
    'how does',
    'understand',
    'look for',
  ];

  return explorationIndicators.some((indicator) => prompt.includes(indicator));
}
