/**
 * AI Analyzer
 *
 * Uses Claude API to provide intelligent analysis of conversation context.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AnalysisContext } from './context-builder.js';

export interface AISuggestion {
  type: string;
  suggestion: string;
  reasoning?: string;
  priority: 'low' | 'medium' | 'high';
  source: 'ai';
}

// Analysis prompt template
const ANALYSIS_PROMPT = `You are a workflow guidance assistant for a solo developer using Claude Code.
Analyze the conversation context and provide helpful suggestions based on professional development best practices.

Focus areas:
1. Testing workflow - suggest running tests after code changes
2. Git workflow - suggest commits, PRs at appropriate times
3. Refactoring - identify opportunities for code improvement
4. Security - flag potential security issues
5. Production readiness - ensure code is production-quality
6. Claude Code best practices - suggest using features like Plan mode, subagents, skills

Current context:
- Hook event: {{hookEvent}}
- Current prompt: {{currentPrompt}}
- Conversation length: {{conversationLength}} messages
- Has uncommitted work: {{hasUncommittedWork}}
- Detected patterns: {{patterns}}

Recent activity summary:
{{recentActivity}}

Based on this context, provide 0-2 actionable suggestions. Be concise and practical.
Only suggest things that are clearly relevant to the current situation.
If nothing needs to be suggested, return an empty array.

Respond with a JSON array of suggestions:
[
  {
    "type": "testing|git|refactoring|security|shipping|claude-code",
    "suggestion": "Brief actionable suggestion",
    "reasoning": "Why this is relevant now",
    "priority": "low|medium|high"
  }
]`;

let anthropicClient: Anthropic | null = null;

/**
 * Initialize the Anthropic client
 */
function getClient(): Anthropic | null {
  if (anthropicClient) return anthropicClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

/**
 * Analyze context using Claude API
 */
export async function analyzeWithAI(context: AnalysisContext): Promise<AISuggestion[]> {
  const client = getClient();

  if (!client) {
    // No API key available, skip AI analysis
    return [];
  }

  try {
    const prompt = buildPrompt(context);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return [];
    }

    // Parse JSON response
    const suggestions = parseAIResponse(textContent.text);
    return suggestions.map((s) => ({ ...s, source: 'ai' as const }));
  } catch (error) {
    // Silently fail - AI analysis is optional
    console.error('AI analysis failed:', error);
    return [];
  }
}

/**
 * Build the analysis prompt from context
 */
function buildPrompt(context: AnalysisContext): string {
  const recentActivity = summarizeRecentActivity(context);
  const patterns = context.patterns.map((p) => `${p.type} (${p.confidence})`).join(', ');

  return ANALYSIS_PROMPT.replace('{{hookEvent}}', context.hookEvent)
    .replace('{{currentPrompt}}', context.currentPrompt || 'N/A')
    .replace('{{conversationLength}}', String(context.conversationLength))
    .replace('{{hasUncommittedWork}}', String(context.hasUncommittedWork))
    .replace('{{patterns}}', patterns || 'None detected')
    .replace('{{recentActivity}}', recentActivity);
}

/**
 * Summarize recent activity for the prompt
 */
function summarizeRecentActivity(context: AnalysisContext): string {
  const activities: string[] = [];

  // Summarize recent tool uses
  const toolSummary = new Map<string, number>();
  for (const tool of context.recentToolUses) {
    const count = toolSummary.get(tool.toolName || 'unknown') || 0;
    toolSummary.set(tool.toolName || 'unknown', count + 1);
  }

  for (const [tool, count] of toolSummary) {
    activities.push(`- ${tool}: ${count} uses`);
  }

  // Add test status
  if (context.lastTestRun) {
    activities.push(`- Last test run: found`);
  } else {
    activities.push(`- Last test run: none detected`);
  }

  return activities.join('\n') || 'No recent activity';
}

/**
 * Parse the AI response into structured suggestions
 */
function parseAIResponse(text: string): Omit<AISuggestion, 'source'>[] {
  try {
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.type === 'string' &&
        typeof item.suggestion === 'string' &&
        typeof item.priority === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * Check if AI analysis is available
 */
export function isAIAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
