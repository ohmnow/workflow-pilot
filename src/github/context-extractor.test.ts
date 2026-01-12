import { describe, it, expect } from 'vitest';
import {
  extractWorkerContext,
  extractContextFromFeature,
  generateWorkerPrompt,
  generateCompactPrompt,
  validateContext,
  ExtractedContext,
} from './context-extractor.js';
import { GitHubIssue } from './client.js';
import { DEFAULT_AUTOPILOT_CONFIG } from '../orchestrator/autopilot-config.js';
import { GitHubFeature } from './issue-manager.js';

describe('ContextExtractor', () => {
  const createIssue = (overrides: Partial<GitHubIssue> = {}): GitHubIssue => ({
    number: 42,
    title: 'Add user authentication',
    body: `## Description

Implement user authentication with JWT tokens.

## Requirements

- Create login endpoint
- Create register endpoint
- Implement JWT token generation

## Acceptance Criteria

- [ ] Users can register with email and password
- [ ] Users can log in and receive a JWT
- [ ] Protected routes require valid JWT

## Related Files

- \`src/auth/login.ts\`
- \`src/auth/register.ts\`
`,
    state: 'open',
    labels: ['feature'],
    url: 'https://github.com/test/repo/issues/42',
    ...overrides,
  });

  describe('extractWorkerContext', () => {
    it('should extract basic issue info', () => {
      const issue = createIssue();
      const context = extractWorkerContext(issue);

      expect(context.issueNumber).toBe(42);
      expect(context.title).toBe('Add user authentication');
    });

    it('should extract description from ## Description section', () => {
      const issue = createIssue();
      const context = extractWorkerContext(issue);

      expect(context.description).toContain('JWT tokens');
    });

    it('should extract requirements', () => {
      const issue = createIssue();
      const context = extractWorkerContext(issue);

      expect(context.requirements).toContain('Create login endpoint');
      expect(context.requirements).toContain('Create register endpoint');
    });

    it('should extract acceptance criteria', () => {
      const issue = createIssue();
      const context = extractWorkerContext(issue);

      expect(context.acceptanceCriteria).toContain('Users can register with email and password');
      expect(context.acceptanceCriteria).toContain('Users can log in and receive a JWT');
    });

    it('should extract related files', () => {
      const issue = createIssue();
      const context = extractWorkerContext(issue);

      expect(context.relatedFiles).toContain('src/auth/login.ts');
      expect(context.relatedFiles).toContain('src/auth/register.ts');
    });

    it('should generate branch name', () => {
      const issue = createIssue();
      const context = extractWorkerContext(issue);

      expect(context.branchName).toBe('claude-worker/issue-42');
    });

    it('should extract feature ID from title [F-001]', () => {
      const issue = createIssue({ title: '[F-001] Add authentication' });
      const context = extractWorkerContext(issue);

      expect(context.featureId).toBe('F-001');
      expect(context.branchName).toBe('claude-worker/f-001');
    });

    it('should extract feature ID from title (T2-004)', () => {
      const issue = createIssue({ title: 'Context Extractor (T2-004)' });
      const context = extractWorkerContext(issue);

      expect(context.featureId).toBe('T2-004');
    });

    it('should extract feature ID from body', () => {
      const issue = createIssue({
        body: 'Feature ID: AUTH-001\n\nImplement auth',
      });
      const context = extractWorkerContext(issue);

      expect(context.featureId).toBe('AUTH-001');
    });

    it('should include scope instructions', () => {
      const issue = createIssue();
      const context = extractWorkerContext(issue);

      expect(context.scopeInstructions).toContain('Focus exclusively');
      expect(context.scopeInstructions).toContain('Do NOT modify');
    });

    it('should handle minimal issue body', () => {
      const issue = createIssue({
        body: 'Just a simple description without any structure.',
      });
      const context = extractWorkerContext(issue);

      expect(context.description).toContain('simple description');
      expect(context.acceptanceCriteria).toHaveLength(0);
    });

    it('should extract dependencies', () => {
      const issue = createIssue({
        body: `## Description
Add feature

## Dependencies
Depends on #41
Requires F-000
`,
      });
      const context = extractWorkerContext(issue);

      expect(context.dependencies.length).toBeGreaterThan(0);
    });

    it('should handle empty body', () => {
      const issue = createIssue({ body: '' });
      const context = extractWorkerContext(issue);

      expect(context.description).toBe('');
      expect(context.requirements).toHaveLength(0);
    });
  });

  describe('extractContextFromFeature', () => {
    const createFeature = (): GitHubFeature => ({
      id: 'F-001',
      name: 'User Authentication',
      description: 'Implement user auth with JWT',
      blocking: false,
      dependsOn: ['F-000'],
      status: 'ready',
      passes: false,
      sprint: 1,
      steps: [
        { id: 's1', description: 'Create login endpoint', completed: false },
        { id: 's2', description: 'Create register endpoint', completed: false },
      ],
      acceptanceCriteria: [
        { id: 'ac1', description: 'Users can register', verified: false },
        { id: 'ac2', description: 'Users can log in', verified: false },
      ],
      createdAt: new Date().toISOString(),
      githubIssue: 42,
    });

    it('should extract context from feature', () => {
      const feature = createFeature();
      const context = extractContextFromFeature(feature);

      expect(context.issueNumber).toBe(42);
      expect(context.title).toBe('User Authentication');
      expect(context.featureId).toBe('F-001');
      expect(context.description).toBe('Implement user auth with JWT');
    });

    it('should extract requirements from steps', () => {
      const feature = createFeature();
      const context = extractContextFromFeature(feature);

      expect(context.requirements).toContain('Create login endpoint');
      expect(context.requirements).toContain('Create register endpoint');
    });

    it('should extract acceptance criteria', () => {
      const feature = createFeature();
      const context = extractContextFromFeature(feature);

      expect(context.acceptanceCriteria).toContain('Users can register');
      expect(context.acceptanceCriteria).toContain('Users can log in');
    });

    it('should include dependencies', () => {
      const feature = createFeature();
      const context = extractContextFromFeature(feature);

      expect(context.dependencies).toContain('F-000');
    });

    it('should generate proper branch name', () => {
      const feature = createFeature();
      const context = extractContextFromFeature(feature);

      expect(context.branchName).toBe('claude-worker/f-001');
    });

    it('should include notes if present', () => {
      const feature = createFeature();
      feature.notes = 'Important implementation note';
      const context = extractContextFromFeature(feature);

      expect(context.notes).toContain('Important implementation note');
    });
  });

  describe('generateWorkerPrompt', () => {
    const createContext = (): ExtractedContext => ({
      issueNumber: 42,
      title: 'Add user authentication',
      featureId: 'F-001',
      description: 'Implement JWT authentication',
      requirements: ['Create login', 'Create register'],
      acceptanceCriteria: ['Users can login', 'JWT tokens work'],
      relatedFiles: ['src/auth.ts'],
      dependencies: ['F-000'],
      branchName: 'claude-worker/f-001',
      scopeInstructions: 'Focus only on auth',
      notes: ['Check existing code'],
    });

    it('should generate complete prompt', () => {
      const context = createContext();
      const prompt = generateWorkerPrompt(context);

      expect(prompt).toContain('# Task: Add user authentication');
      expect(prompt).toContain('**Feature ID:** F-001');
      expect(prompt).toContain('**Issue:** #42');
      expect(prompt).toContain('**Branch:** `claude-worker/f-001`');
    });

    it('should include description section', () => {
      const context = createContext();
      const prompt = generateWorkerPrompt(context);

      expect(prompt).toContain('## Description');
      expect(prompt).toContain('Implement JWT authentication');
    });

    it('should include requirements', () => {
      const context = createContext();
      const prompt = generateWorkerPrompt(context);

      expect(prompt).toContain('## Requirements');
      expect(prompt).toContain('- Create login');
      expect(prompt).toContain('- Create register');
    });

    it('should include acceptance criteria as checklist', () => {
      const context = createContext();
      const prompt = generateWorkerPrompt(context);

      expect(prompt).toContain('## Acceptance Criteria');
      expect(prompt).toContain('- [ ] Users can login');
      expect(prompt).toContain('- [ ] JWT tokens work');
    });

    it('should include related files', () => {
      const context = createContext();
      const prompt = generateWorkerPrompt(context);

      expect(prompt).toContain('## Related Files');
      expect(prompt).toContain('`src/auth.ts`');
    });

    it('should include dependencies', () => {
      const context = createContext();
      const prompt = generateWorkerPrompt(context);

      expect(prompt).toContain('## Dependencies');
      expect(prompt).toContain('- F-000');
    });

    it('should include scope instructions', () => {
      const context = createContext();
      const prompt = generateWorkerPrompt(context);

      expect(prompt).toContain('## Scope & Instructions');
      expect(prompt).toContain('Focus only on auth');
    });

    it('should include workflow steps', () => {
      const context = createContext();
      const prompt = generateWorkerPrompt(context);

      expect(prompt).toContain('## Workflow');
      expect(prompt).toContain('Write tests');
      expect(prompt).toContain('Fixes #42');
    });

    it('should include notes', () => {
      const context = createContext();
      const prompt = generateWorkerPrompt(context);

      expect(prompt).toContain('## Notes');
      expect(prompt).toContain('Check existing code');
    });

    it('should omit sections with empty data', () => {
      const context: ExtractedContext = {
        ...createContext(),
        requirements: [],
        relatedFiles: [],
        dependencies: [],
        notes: [],
      };
      const prompt = generateWorkerPrompt(context);

      expect(prompt).not.toContain('## Requirements');
      expect(prompt).not.toContain('## Related Files');
      expect(prompt).not.toContain('## Dependencies');
      expect(prompt).not.toContain('## Notes');
    });
  });

  describe('generateCompactPrompt', () => {
    it('should generate shorter prompt', () => {
      const context: ExtractedContext = {
        issueNumber: 42,
        title: 'Add auth',
        description: 'Implement authentication',
        requirements: [],
        acceptanceCriteria: ['Users can login'],
        relatedFiles: [],
        dependencies: [],
        branchName: 'claude-worker/issue-42',
        scopeInstructions: 'Focus on auth only',
        notes: [],
      };

      const prompt = generateCompactPrompt(context);

      expect(prompt).toContain('Task: Add auth');
      expect(prompt).toContain('Issue #42');
      expect(prompt).toContain('Branch: claude-worker/issue-42');
      expect(prompt).toContain('Fixes #42');
      expect(prompt.length).toBeLessThan(500);
    });
  });

  describe('validateContext', () => {
    it('should return valid for complete context', () => {
      const context: ExtractedContext = {
        issueNumber: 42,
        title: 'Test',
        description: 'A complete description with enough detail to work with',
        requirements: ['req1'],
        acceptanceCriteria: ['criterion1'],
        relatedFiles: [],
        dependencies: [],
        branchName: 'branch',
        scopeInstructions: 'scope',
        notes: [],
      };

      const result = validateContext(context);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn about short description', () => {
      const context: ExtractedContext = {
        issueNumber: 42,
        title: 'Test',
        description: 'Too short',
        requirements: [],
        acceptanceCriteria: ['criterion'],
        relatedFiles: [],
        dependencies: [],
        branchName: 'branch',
        scopeInstructions: 'scope',
        notes: [],
      };

      const result = validateContext(context);

      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('Description is too short or missing');
    });

    it('should warn about missing acceptance criteria', () => {
      const context: ExtractedContext = {
        issueNumber: 42,
        title: 'Test',
        description: 'A complete description with enough detail',
        requirements: [],
        acceptanceCriteria: [],
        relatedFiles: [],
        dependencies: [],
        branchName: 'branch',
        scopeInstructions: 'scope',
        notes: [],
      };

      const result = validateContext(context);

      expect(result.valid).toBe(false);
      expect(result.warnings.some(w => w.includes('acceptance criteria'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle issue with only checkbox items', () => {
      const issue = createIssue({
        body: `- [x] Done item
- [ ] Todo item
- [ ] Another todo`,
      });
      const context = extractWorkerContext(issue);

      expect(context.acceptanceCriteria.length).toBeGreaterThan(0);
    });

    it('should extract files from inline code', () => {
      const issue = createIssue({
        body: 'Check the `src/utils/helper.ts` file and `lib/core.js` for reference.',
      });
      const context = extractWorkerContext(issue);

      expect(context.relatedFiles).toContain('src/utils/helper.ts');
      expect(context.relatedFiles).toContain('lib/core.js');
    });

    it('should handle numbered lists', () => {
      const issue = createIssue({
        body: `## Requirements
1. First requirement
2. Second requirement
3. Third requirement`,
      });
      const context = extractWorkerContext(issue);

      expect(context.requirements).toContain('First requirement');
      expect(context.requirements).toContain('Second requirement');
    });

    it('should deduplicate related files', () => {
      const issue = createIssue({
        body: 'See `src/auth.ts` and also `src/auth.ts` mentioned twice.',
      });
      const context = extractWorkerContext(issue);

      const authCount = context.relatedFiles.filter(f => f === 'src/auth.ts').length;
      expect(authCount).toBe(1);
    });
  });
});
