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
        currentPrompt: 'let\'s work on a different task now',
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

      const secretAlert = suggestions.find(s => s.level === 'critical');
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

      const dangerAlert = suggestions.find(s => s.level === 'critical');
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

      const envAlert = suggestions.find(s => s.level === 'critical');
      expect(envAlert).toBeDefined();
      expect(envAlert?.suggestion).toContain('SENSITIVE');
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

  describe('Type Safety Rules', () => {
    it('suggests TypeScript for .js files', () => {
      const context = createContext({
        toolInfo: {
          name: 'Write',
          input: { file_path: '/project/src/utils.js', content: 'function helper() {}' },
        },
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('TypeScript'))).toBe(true);
    });

    it('does not trigger for config files', () => {
      const context = createContext({
        toolInfo: {
          name: 'Write',
          input: { file_path: '/project/vite.config.js', content: 'export default {}' },
        },
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('TypeScript'))).toBe(false);
    });
  });

  describe('Error Handling Rules', () => {
    it('suggests try/catch for async code without error handling', () => {
      const context = createContext({
        toolInfo: {
          name: 'Edit',
          input: {
            file_path: 'api.ts',
            new_string: `
              async function fetchData() {
                const response = await fetch('/api/data');
                const data = await response.json();
                return data;
              }
            `,
          },
        },
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('error handling'))).toBe(true);
    });

    it('does not trigger when try/catch is present', () => {
      const context = createContext({
        toolInfo: {
          name: 'Edit',
          input: {
            file_path: 'api.ts',
            new_string: `
              async function fetchData() {
                try {
                  const response = await fetch('/api/data');
                  return await response.json();
                } catch (error) {
                  console.error(error);
                }
              }
            `,
          },
        },
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('error handling'))).toBe(false);
    });
  });

  describe('PR Readiness Rules', () => {
    it('warns when creating PR without tests', () => {
      const context = createContext({
        toolInfo: {
          name: 'Bash',
          input: { command: 'gh pr create --title "New feature"' },
        },
        lastTestRun: undefined,
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s =>
        s.suggestion.includes('tests') && s.suggestion.includes('PR')
      )).toBe(true);
    });

    it('does not warn when tests were run', () => {
      const context = createContext({
        toolInfo: {
          name: 'Bash',
          input: { command: 'gh pr create --title "New feature"' },
        },
        lastTestRun: { toolName: 'Bash', toolInput: { command: 'npm test' } } as any,
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s =>
        s.ruleId === 'pr-readiness-check'
      )).toBe(false);
    });
  });

  describe('Dependency Security Rules', () => {
    it('suggests npm audit after installing packages', () => {
      const context = createContext({
        toolInfo: {
          name: 'Bash',
          input: { command: 'npm install lodash' },
        },
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('npm audit'))).toBe(true);
    });

    it('suggests audit after editing package.json', () => {
      const context = createContext({
        toolInfo: {
          name: 'Edit',
          input: { file_path: '/project/package.json', new_string: '"lodash": "^4.0.0"' },
        },
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('npm audit'))).toBe(true);
    });
  });

  describe('Documentation Rules', () => {
    it('suggests JSDoc for exported functions without docs', () => {
      const context = createContext({
        toolInfo: {
          name: 'Write',
          input: {
            file_path: 'utils.ts',
            content: `
              export function calculateTotal(items: Item[]): number {
                return items.reduce((sum, item) => sum + item.price, 0);
              }

              export function formatCurrency(amount: number): string {
                return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
              }
            `,
          },
        },
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('JSDoc'))).toBe(true);
    });

    it('does not trigger when JSDoc is present', () => {
      const context = createContext({
        toolInfo: {
          name: 'Write',
          input: {
            file_path: 'utils.ts',
            content: `
              /**
               * Calculate the total price of items
               */
              export function calculateTotal(items: Item[]): number {
                return items.reduce((sum, item) => sum + item.price, 0);
              }
            `,
          },
        },
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('JSDoc'))).toBe(false);
    });
  });

  describe('Production Rules', () => {
    it('warns when deploying without recent build', () => {
      const context = createContext({
        toolInfo: {
          name: 'Bash',
          input: { command: 'vercel --prod' },
        },
        recentToolUses: [],
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('build'))).toBe(true);
    });

    it('does not warn when build was run recently', () => {
      const context = createContext({
        toolInfo: {
          name: 'Bash',
          input: { command: 'vercel --prod' },
        },
        recentToolUses: [
          { toolName: 'Bash', toolInput: { command: 'npm run build' } } as any,
        ],
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.ruleId === 'build-before-deploy')).toBe(false);
    });
  });

  describe('Code Quality Rules', () => {
    it('suggests linting before commit when code was changed', () => {
      const context = createContext({
        toolInfo: {
          name: 'Bash',
          input: { command: 'git commit -m "Add feature"' },
        },
        recentToolUses: [
          { toolName: 'Edit', toolInput: { file_path: 'src/app.ts' } } as any,
        ],
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.suggestion.includes('linter'))).toBe(true);
    });

    it('does not suggest lint if already run', () => {
      const context = createContext({
        toolInfo: {
          name: 'Bash',
          input: { command: 'git commit -m "Add feature"' },
        },
        recentToolUses: [
          { toolName: 'Edit', toolInput: { file_path: 'src/app.ts' } } as any,
          { toolName: 'Bash', toolInput: { command: 'npm run lint' } } as any,
        ],
      });

      const suggestions = evaluateRules(context);

      expect(suggestions.some(s => s.ruleId === 'lint-before-commit')).toBe(false);
    });
  });
});
