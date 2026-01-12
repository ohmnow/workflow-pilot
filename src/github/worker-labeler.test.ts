import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkLabelEligibility,
  getEligibleFeatures,
  generateWorkerContext,
  formatWorkerContextMarkdown,
  labelEligibleFeatures,
  LabelEligibility,
} from './worker-labeler.js';
import { Feature, FeatureList } from '../orchestrator/feature-schema.js';
import { GitHubFeature } from './issue-manager.js';
import { DEFAULT_AUTOPILOT_CONFIG } from '../orchestrator/autopilot-config.js';

// Mock the client module
vi.mock('./client.js', () => ({
  updateIssue: vi.fn().mockResolvedValue({ success: true }),
  listOpenIssues: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { number: 1, body: 'Issue body', labels: [] },
      { number: 2, body: 'Issue 2 body', labels: ['ready-for-claude'] },
    ],
  }),
}));

describe('WorkerLabeler', () => {
  const createFeature = (overrides: Partial<GitHubFeature> = {}): GitHubFeature => ({
    id: 'F-001',
    name: 'Test Feature',
    description: 'A test feature',
    blocking: false,
    dependsOn: [],
    status: 'planned',
    passes: false,
    sprint: 1,
    steps: [],
    acceptanceCriteria: [
      { id: 'AC-1', description: 'Should work', verified: false },
    ],
    createdAt: new Date().toISOString(),
    githubIssue: 1,
    ...overrides,
  });

  const createFeatureList = (features: Feature[]): FeatureList => ({
    version: '1.0.0',
    project: {
      name: 'Test Project',
      description: 'A test project',
      createdAt: new Date().toISOString(),
    },
    sprints: [{ number: 1, status: 'active' }],
    features,
  });

  describe('checkLabelEligibility', () => {
    it('should be eligible for simple non-blocking feature', () => {
      const feature = createFeature();
      const result = checkLabelEligibility(feature, [feature]);

      expect(result.eligible).toBe(true);
      expect(result.featureId).toBe('F-001');
      expect(result.issueNumber).toBe(1);
    });

    it('should not be eligible without GitHub issue', () => {
      const feature = createFeature({ githubIssue: undefined });
      const result = checkLabelEligibility(feature, [feature]);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('no linked GitHub issue');
    });

    it('should not be eligible if blocking', () => {
      const feature = createFeature({ blocking: true });
      const result = checkLabelEligibility(feature, [feature]);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Blocking');
    });

    it('should not be eligible if dependencies not satisfied', () => {
      const dependency = createFeature({
        id: 'F-000',
        blocking: true,
        passes: false, // Not verified
      });
      const feature = createFeature({
        dependsOn: ['F-000'],
      });

      const result = checkLabelEligibility(feature, [dependency, feature]);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('unsatisfied dependencies');
    });

    it('should be eligible if dependencies are satisfied', () => {
      const dependency = createFeature({
        id: 'F-000',
        blocking: true,
        passes: true, // Verified
        status: 'verified',
      });
      const feature = createFeature({
        dependsOn: ['F-000'],
      });

      const result = checkLabelEligibility(feature, [dependency, feature]);

      expect(result.eligible).toBe(true);
    });

    it('should not be eligible if already in progress', () => {
      const feature = createFeature({ status: 'in_progress' });
      const result = checkLabelEligibility(feature, [feature]);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('in_progress');
    });

    it('should not be eligible if already implemented', () => {
      const feature = createFeature({ status: 'implemented' });
      const result = checkLabelEligibility(feature, [feature]);

      expect(result.eligible).toBe(false);
    });

    it('should not be eligible if already verified', () => {
      const feature = createFeature({ status: 'verified' });
      const result = checkLabelEligibility(feature, [feature]);

      expect(result.eligible).toBe(false);
    });
  });

  describe('getEligibleFeatures', () => {
    it('should return eligibility for all features', () => {
      const features = [
        createFeature({ id: 'F-001' }),
        createFeature({ id: 'F-002', blocking: true }),
        createFeature({ id: 'F-003', githubIssue: undefined }),
      ];
      const featureList = createFeatureList(features);

      const results = getEligibleFeatures(featureList, DEFAULT_AUTOPILOT_CONFIG);

      expect(results).toHaveLength(3);
      expect(results[0].eligible).toBe(true);
      expect(results[1].eligible).toBe(false);
      expect(results[2].eligible).toBe(false);
    });
  });

  describe('generateWorkerContext', () => {
    it('should generate context with correct fields', () => {
      const feature = createFeature({
        description: 'Implement user login',
        acceptanceCriteria: [
          { id: 'AC-1', description: 'User can log in', verified: false },
          { id: 'AC-2', description: 'Errors are shown', verified: false },
        ],
        dependsOn: ['F-000'],
      });

      const context = generateWorkerContext(feature, DEFAULT_AUTOPILOT_CONFIG);

      expect(context.featureId).toBe('F-001');
      expect(context.featureName).toBe('Test Feature');
      expect(context.description).toBe('Implement user login');
      expect(context.acceptanceCriteria).toHaveLength(2);
      expect(context.dependsOn).toContain('F-000');
      expect(context.branchName).toBe('claude-worker/f-001');
      expect(context.scope).toContain('scoped to feature F-001');
    });

    it('should use custom branch pattern', () => {
      const feature = createFeature({ id: 'AUTH-001' });
      const config = { ...DEFAULT_AUTOPILOT_CONFIG, branchPattern: 'worker/{feature-id}' };

      const context = generateWorkerContext(feature, config);

      expect(context.branchName).toBe('worker/auth-001');
    });
  });

  describe('formatWorkerContextMarkdown', () => {
    it('should format context as markdown', () => {
      const context = {
        featureId: 'F-001',
        featureName: 'Test Feature',
        description: 'A test',
        acceptanceCriteria: ['Works correctly', 'Has tests'],
        dependsOn: ['F-000'],
        scope: 'Scoped to F-001',
        branchName: 'claude-worker/f-001',
      };

      const markdown = formatWorkerContextMarkdown(context);

      expect(markdown).toContain('## Claude Worker Context');
      expect(markdown).toContain('### Scope');
      expect(markdown).toContain('Scoped to F-001');
      expect(markdown).toContain('### Branch');
      expect(markdown).toContain('`claude-worker/f-001`');
      expect(markdown).toContain('### Acceptance Criteria');
      expect(markdown).toContain('- [ ] Works correctly');
      expect(markdown).toContain('- [ ] Has tests');
      expect(markdown).toContain('### Dependencies');
      expect(markdown).toContain('`F-000`');
    });

    it('should include related files if provided', () => {
      const context = {
        featureId: 'F-001',
        featureName: 'Test',
        description: 'Test',
        acceptanceCriteria: [],
        dependsOn: [],
        relatedFiles: ['src/auth.ts', 'src/auth.test.ts'],
        scope: 'Scoped',
        branchName: 'branch',
      };

      const markdown = formatWorkerContextMarkdown(context);

      expect(markdown).toContain('### Related Files');
      expect(markdown).toContain('`src/auth.ts`');
      expect(markdown).toContain('`src/auth.test.ts`');
    });

    it('should omit dependencies section if none', () => {
      const context = {
        featureId: 'F-001',
        featureName: 'Test',
        description: 'Test',
        acceptanceCriteria: [],
        dependsOn: [],
        scope: 'Scoped',
        branchName: 'branch',
      };

      const markdown = formatWorkerContextMarkdown(context);

      expect(markdown).not.toContain('### Dependencies');
    });
  });

  describe('labelEligibleFeatures', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should label eligible features in dry run mode', async () => {
      const features = [
        createFeature({ id: 'F-001', githubIssue: 1 }),
        createFeature({ id: 'F-002', githubIssue: 2 }),
      ];
      const featureList = createFeatureList(features);

      const result = await labelEligibleFeatures(featureList, DEFAULT_AUTOPILOT_CONFIG, {
        dryRun: true,
      });

      expect(result.labeled).toContain('F-001');
      expect(result.labeled).toContain('F-002');
      expect(result.errors).toHaveLength(0);
    });

    it('should respect maxConcurrentWorkers limit', async () => {
      const features = [
        createFeature({ id: 'F-001', githubIssue: 1 }),
        createFeature({ id: 'F-002', githubIssue: 2 }),
        createFeature({ id: 'F-003', githubIssue: 3 }),
        createFeature({ id: 'F-004', githubIssue: 4 }),
      ];
      const featureList = createFeatureList(features);
      const config = { ...DEFAULT_AUTOPILOT_CONFIG, maxConcurrentWorkers: 2 };

      const result = await labelEligibleFeatures(featureList, config, {
        dryRun: true,
      });

      expect(result.labeled).toHaveLength(2);
      expect(result.skipped.filter(s => s.reason.includes('limit'))).toHaveLength(2);
    });

    it('should skip ineligible features with reason', async () => {
      const features = [
        createFeature({ id: 'F-001', blocking: true }),
        createFeature({ id: 'F-002', githubIssue: undefined }),
      ];
      const featureList = createFeatureList(features);

      const result = await labelEligibleFeatures(featureList, DEFAULT_AUTOPILOT_CONFIG, {
        dryRun: true,
      });

      expect(result.labeled).toHaveLength(0);
      expect(result.skipped).toHaveLength(2);
      expect(result.skipped[0].reason).toContain('Blocking');
      expect(result.skipped[1].reason).toContain('no linked GitHub issue');
    });

    it('should use maxToLabel option when specified', async () => {
      const features = [
        createFeature({ id: 'F-001', githubIssue: 1 }),
        createFeature({ id: 'F-002', githubIssue: 2 }),
        createFeature({ id: 'F-003', githubIssue: 3 }),
      ];
      const featureList = createFeatureList(features);

      const result = await labelEligibleFeatures(featureList, DEFAULT_AUTOPILOT_CONFIG, {
        dryRun: true,
        maxToLabel: 1,
      });

      expect(result.labeled).toHaveLength(1);
    });
  });
});
