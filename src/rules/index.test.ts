/**
 * Tests for the Rule Engine
 */

import { describe, it, expect } from 'vitest';
import { evaluateRules, RuleSuggestion } from './index.js';
import { AnalysisContext } from '../analyzer/context-builder.js';

// Helper to create a minimal context
function createContext(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    recentMessages: [],
    hookEvent: 'UserPromptSubmit',
    recentToolUses: [],
    hasUncommittedWork: false,
    conversationLength: 10,
    patterns: [],
    ...overrides,
  };
}

describe('Rule Engine', () => {
  describe('Testing Rules', () => {
    it('suggests running tests when code-without-tests pattern detected', () => {
      const context = createContext({
        patterns: [{ type: 'code-without-tests', confidence: 0.8 }],
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('tests'))).toBe(true);
    });

    it('suggests testing before commit', () => {
      const context = createContext({
        toolInfo: {
          name: 'Bash',
          input: { command: 'git commit -m "test"' },
        },
        lastTestRun: undefined,
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('tests') && s.priority === 'high')).toBe(true);
    });
  });

  describe('Git Rules', () => {
    it('suggests committing during long uncommitted session', () => {
      const context = createContext({
        patterns: [{ type: 'long-uncommitted-session', confidence: 0.9 }],
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('commit'))).toBe(true);
    });

    it('suggests committing before switching tasks', () => {
      const context = createContext({
        currentPrompt: 'now lets work on something else',
        hasUncommittedWork: true,
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s =>
        s.suggestion.includes('Commit') && s.priority === 'high'
      )).toBe(true);
    });
  });

  describe('Claude Code Best Practices', () => {
    it('suggests Plan mode for large tasks', () => {
      const context = createContext({
        patterns: [{ type: 'large-task-no-plan', confidence: 0.7 }],
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('Plan mode'))).toBe(true);
    });

    it('suggests /compact for long conversations', () => {
      const context = createContext({
        conversationLength: 150,
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('/compact'))).toBe(true);
    });

    it('suggests stepping back after multiple failures', () => {
      const context = createContext({
        patterns: [{ type: 'multiple-failures', confidence: 0.85 }],
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s =>
        s.suggestion.includes('step') || s.suggestion.includes('reassess')
      )).toBe(true);
    });
  });

  describe('Security Rules - Critical Alerts', () => {
    it('detects hardcoded secrets in Edit operations', () => {
      const context = createContext({
        toolInfo: {
          name: 'Edit',
          input: {
            file_path: 'config.js',
            new_string: 'const apiKey = "sk_live_abc123def456789012345"'
          },
        },
      });

      const suggestions = evaluateRules(context);

      const secretAlert = suggestions.find(s => s.critical === true);
      expect(secretAlert).toBeDefined();
      expect(secretAlert?.suggestion).toContain('SECRET');
    });

    it('detects dangerous git commands', () => {
      const context = createContext({
        toolInfo: {
          name: 'Bash',
          input: { command: 'git push --force origin main' },
        },
      });

      const suggestions = evaluateRules(context);

      const dangerAlert = suggestions.find(s => s.critical === true);
      expect(dangerAlert).toBeDefined();
      expect(dangerAlert?.suggestion).toContain('DANGEROUS');
    });

    it('detects committing .env files', () => {
      const context = createContext({
        toolInfo: {
          name: 'Bash',
          input: { command: 'git add .env' },
        },
      });

      const suggestions = evaluateRules(context);

      const envAlert = suggestions.find(s => s.critical === true);
      expect(envAlert).toBeDefined();
      expect(envAlert?.suggestion).toContain('.env');
    });
  });

  describe('Deduplication', () => {
    it('keeps highest priority when same category triggers multiple rules', () => {
      const context = createContext({
        patterns: [{ type: 'code-without-tests', confidence: 0.8 }],
        toolInfo: {
          name: 'Bash',
          input: { command: 'git commit -m "test"' },
        },
        lastTestRun: undefined,
      });

      const suggestions = evaluateRules(context);
      const testingSuggestions = suggestions.filter(s => s.type === 'testing');

      // Should dedupe to highest priority
      expect(testingSuggestions.length).toBe(1);
      expect(testingSuggestions[0].priority).toBe('high');
    });
  });
});
