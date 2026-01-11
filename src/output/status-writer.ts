/**
 * Status Writer
 *
 * Writes Workflow Pilot state to a JSON file that can be read by
 * the status line script for persistent visibility.
 */

import * as fs from 'fs';
import { AnalysisContext } from '../analyzer/context-builder.js';
import { RuleSuggestion } from '../rules/index.js';
import { AISuggestion } from '../analyzer/ai-analyzer.js';

const STATUS_FILE = '/tmp/workflow-pilot-status.json';

export interface WorkflowStatus {
  timestamp: string;
  sessionId: string;

  // Project health indicators
  health: {
    uncommittedChanges: boolean;
    testsPassing: boolean | null;  // null = unknown
    hasRecentCommit: boolean;
  };

  // Current suggestions (top priority ones)
  suggestions: {
    count: number;
    topPriority: string | null;
    categories: string[];
  };

  // Session info
  session: {
    messageCount: number;
    toolUseCount: number;
    startedAt: string | null;
  };

  // Short status for status line display
  shortStatus: string;
}

export function writeStatusFile(
  context: AnalysisContext,
  suggestions: (RuleSuggestion | AISuggestion)[],
  sessionId: string
): void {
  try {
    // Determine health indicators
    const uncommittedChanges = context.hasUncommittedWork;
    const hasRecentCommit = !context.patterns.some(p => p.type === 'long-uncommitted-session');

    // Get suggestion categories
    const categories = [...new Set(suggestions.map(s => s.type))];
    const highPriority = suggestions.find(s => s.priority === 'high');

    // Build short status for status line
    let shortStatus = '';
    if (suggestions.length === 0) {
      shortStatus = '✓';
    } else if (highPriority) {
      shortStatus = `⚠ ${suggestions.length}`;
    } else {
      shortStatus = `💡${suggestions.length}`;
    }

    // Add uncommitted indicator
    if (uncommittedChanges) {
      shortStatus += ' 📝';
    }

    const status: WorkflowStatus = {
      timestamp: new Date().toISOString(),
      sessionId,
      health: {
        uncommittedChanges,
        testsPassing: null, // TODO: detect from context
        hasRecentCommit,
      },
      suggestions: {
        count: suggestions.length,
        topPriority: highPriority?.suggestion || suggestions[0]?.suggestion || null,
        categories,
      },
      session: {
        messageCount: context.conversationLength,
        toolUseCount: context.recentToolUses.length,
        startedAt: null, // TODO: track session start
      },
      shortStatus,
    };

    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  } catch (error) {
    // Silently fail - status line is optional
    console.error('[WP] Failed to write status file:', error);
  }
}

export function readStatusFile(): WorkflowStatus | null {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const content = fs.readFileSync(STATUS_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Silently fail
  }
  return null;
}
